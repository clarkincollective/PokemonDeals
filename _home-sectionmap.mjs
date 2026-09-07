// 13C.3 - homepage section-height contribution map. Genuine Chrome CDP.
//   node _home-sectionmap.mjs <baseUrl> <label>
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3141";
const LABEL = process.argv[3] || "run";
const CHROME = process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WIDTHS = [
  { w: 375, h: 812, mobile: true },
  { w: 390, h: 844, mobile: true },
  { w: 430, h: 932, mobile: true },
  { w: 1280, h: 900, mobile: false },
];

let _id = 0;
function cdp(ws, m, p = {}, s) {
  const id = ++_id;
  return new Promise((res, rej) => {
    const on = (ev) => { let x; try { x = JSON.parse(ev.data); } catch { return; } if (x.id === id) { ws.removeEventListener("message", on); x.error ? rej(new Error(m + ": " + x.error.message)) : res(x.result); } };
    ws.addEventListener("message", on);
    ws.send(JSON.stringify(s ? { id, method: m, params: p, sessionId: s } : { id, method: m, params: p }));
  });
}

const PROBE = `(() => {
  const de = document.documentElement;
  const yTop = (el) => Math.round(el.getBoundingClientRect().top + window.scrollY);
  // major sections: <header>, <section>, <main> that carry an h1/h2 or a data-analytics-section
  const nodes = [...document.querySelectorAll('header, section, main')].filter(el => el.querySelector('h1,h2') || el.hasAttribute('data-analytics-section'));
  const sections = nodes.map(el => {
    const r = el.getBoundingClientRect();
    const h = el.querySelector('h1,h2');
    return {
      tag: el.tagName.toLowerCase(),
      seg: el.getAttribute('data-analytics-section') || null,
      heading: h ? h.tagName + ': ' + h.textContent.trim().replace(/\\s+/g,' ').slice(0,46) : null,
      y: yTop(el),
      h: Math.round(r.height),
      dealCards: el.querySelectorAll('[data-analytics-deal-impression], a[href^="/deals/"]').length,
      hubTiles: el.querySelectorAll('a[href^="/cards/"], a[href^="/sets/"], a[href^="/pokemon/"]').length,
      imgs: el.querySelectorAll('img').length,
      viewAllLinks: [...el.querySelectorAll('a')].filter(a => /view all|see all|see top|browse|compare all|all guides|full methodology|all pokemon|all sets/i.test(a.textContent)).map(a => a.textContent.trim().slice(0,28)),
    };
  });
  const h2s = [...document.querySelectorAll('h2')].map(h => h.textContent.trim().replace(/\\s+/g,' ').slice(0,46));
  const y = (sel) => { const e = document.querySelector(sel); return e ? yTop(e) : null; };
  return {
    innerWidth: window.innerWidth, clientWidth: de.clientWidth,
    pageOverflows: de.scrollWidth > de.clientWidth + 1,
    docHeight: de.scrollHeight,
    h1Count: document.querySelectorAll('h1').length,
    h2Count: h2s.length,
    h2s,
    totalDealCards: document.querySelectorAll('a[href^="/deals/"]').length,
    totalDistinctDeals: new Set([...document.querySelectorAll('a[href^="/deals/"]')].map(a => a.getAttribute('href').match(/\\/deals\\/(\\d+)/)?.[1]).filter(Boolean)).size,
    totalImages: document.querySelectorAll('img').length,
    totalDomNodes: document.querySelectorAll('*').length,
    htmlBytes: document.documentElement.outerHTML.length,
    allDealsY: y('[data-analytics-section="all_deals"]'),
    howItWorksY: y('#how-it-works'),
    footerY: y('footer, [role=contentinfo]'),
    sections,
  };
})()`;

async function main() {
  const chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--hide-scrollbars","--remote-debugging-port=9339","--user-data-dir="+path.join(os.tmpdir(),"sm"+Date.now()),"about:blank"], { stdio: ["ignore","ignore","pipe"] });
  let ws = null; chrome.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !ws) ws = m[0]; });
  for (let i = 0; i < 100 && !ws; i++) await sleep(100);
  const B = new WebSocket(ws);
  await new Promise((r, j) => { B.addEventListener("open", r, { once: true }); B.addEventListener("error", j, { once: true }); });
  const { targetId } = await cdp(B, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp(B, "Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => cdp(B, m, p, sessionId);
  await send("Page.enable"); await send("Runtime.enable");

  const out = { base: BASE, label: LABEL, ranAt: new Date().toISOString(), widths: [] };
  for (const vp of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile, screenWidth: vp.w, screenHeight: vp.h });
    await send("Emulation.setUserAgentOverride", { userAgent: vp.mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36" });
    await send("Page.navigate", { url: BASE + "/" });
    await sleep(4500);
    const probe = await send("Runtime.evaluate", { returnByValue: true, expression: PROBE });
    const d = probe.result.value;
    out.widths.push({ requested: vp, ...d });
    console.log(`\n======== ${LABEL} @ ${vp.w} ========  docH=${d.docHeight}  H2=${d.h2Count}  deals=${d.totalDistinctDeals}(${d.totalDealCards} anchors)  imgs=${d.totalImages}  dom=${d.totalDomNodes}  html=${(d.htmlBytes/1024).toFixed(0)}KB  overflow=${d.pageOverflows}`);
    console.log(`  allDealsY=${d.allDealsY}  howItWorksY=${d.howItWorksY}  footerY=${d.footerY}`);
    if (vp.w === 375) {
      for (const s of d.sections) {
        console.log(`  y=${String(s.y).padStart(6)}  h=${String(s.h).padStart(6)}  ${(s.seg||'-').padEnd(14)} cards=${String(s.dealCards).padStart(3)} hub=${String(s.hubTiles).padStart(3)} img=${String(s.imgs).padStart(3)}  ${s.heading||''}  ${s.viewAllLinks.length?('['+s.viewAllLinks.join(' | ')+']'):''}`);
      }
    }
  }
  writeFileSync(path.join(process.cwd(), `_home-sectionmap-${LABEL}.json`), JSON.stringify(out, null, 2));
  B.close(); chrome.kill();
  console.log(`\n-> _home-sectionmap-${LABEL}.json`);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

// 13C.1 - homepage hierarchy measurement. Genuine Chrome via CDP.
//   node _home-measure.mjs <baseUrl> <label>
// Prints y-positions of key homepage landmarks + doc height + H2 lanes
// at 375 / 390 / 430 / 1280, and a full ordered section map.
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
function cdp(ws, method, params = {}, sessionId) {
  const id = ++_id;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id === id) { ws.removeEventListener("message", onMsg); m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result); }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

const PROBE = `(() => {
  const de = document.documentElement;
  const yTop = (el) => el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
  const vis = (el) => { if(!el) return null; const r=el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  // hero search: the visible HeroSearch text input (has autocomplete=off + name=q, inside <header>)
  const heroInput = document.querySelector('header input[name="q"]');
  // discovery CTA: an anchor whose text is a browse-deals action, near the top
  const allA = [...document.querySelectorAll('a')];
  const discovery = allA.find(a => /browse (today'?s )?deals|see (all )?deals|below market|browse all deals|view all deals/i.test(a.textContent.trim()) && yTop(a) < 3000);
  // first real deal card (link to /deals/<id>)
  const firstDeal = document.querySelector('a[href^="/deals/"]');
  // first affiliate / marketplace CTA
  const firstAff = document.querySelector('a[href*="ebay."], a[href*="/api/out"], a[data-analytics-affiliate], a[rel~="sponsored"]');
  const h2s = [...document.querySelectorAll('h2')].map(h=>h.textContent.trim().replace(/\\s+/g,' ').slice(0,48));
  const h1 = document.querySelector('h1');
  // ordered section map: <section>/<header>/<main> with a data-analytics-section or an h2
  const sections = [...document.querySelectorAll('header, section, main')].map(el => {
    const r = el.getBoundingClientRect();
    const h = el.querySelector('h1,h2');
    return {
      tag: el.tagName.toLowerCase(),
      seg: el.getAttribute('data-analytics-section') || null,
      heading: h ? h.textContent.trim().replace(/\\s+/g,' ').slice(0,44) : null,
      y: Math.round(r.top + window.scrollY),
      h: Math.round(r.height),
    };
  }).filter(s => s.heading || s.seg);
  // duplicate ids
  const ids = [...document.querySelectorAll('[id]')].map(e=>e.id).filter(Boolean);
  const dup = [...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
  return {
    innerWidth: window.innerWidth, clientWidth: de.clientWidth, dpr: window.devicePixelRatio,
    pageOverflows: de.scrollWidth > de.clientWidth + 1, scrollWidth: de.scrollWidth,
    h1: h1 ? h1.textContent.trim().replace(/\\s+/g,' ') : null,
    heroSearchY: yTop(heroInput), heroSearchVisible: vis(heroInput),
    discoveryCtaText: discovery ? discovery.textContent.trim().slice(0,40) : null,
    discoveryCtaY: yTop(discovery),
    firstDealY: yTop(firstDeal),
    firstAffiliateY: yTop(firstAff),
    docHeight: de.scrollHeight,
    h2Count: h2s.length, h2s,
    duplicateIds: dup,
    sectionMap: sections,
  };
})()`;

async function main() {
  const userDir = path.join(os.tmpdir(), "pdf-home-" + Date.now());
  const chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--hide-scrollbars","--remote-debugging-port=9335","--user-data-dir="+userDir,"about:blank"], { stdio: ["ignore","ignore","pipe"] });
  let wsUrl = null;
  chrome.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !wsUrl) wsUrl = m[0]; });
  for (let i = 0; i < 100 && !wsUrl; i++) await sleep(100);
  if (!wsUrl) throw new Error("no CDP endpoint");
  const browser = new WebSocket(wsUrl);
  await new Promise((r, j) => { browser.addEventListener("open", r, { once: true }); browser.addEventListener("error", j, { once: true }); });
  const { targetId } = await cdp(browser, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp(browser, "Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => cdp(browser, m, p, sessionId);
  await send("Page.enable"); await send("Runtime.enable");

  const out = { base: BASE, label: LABEL, ranAt: new Date().toISOString(), widths: [] };
  for (const vp of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile, screenWidth: vp.w, screenHeight: vp.h });
    await send("Emulation.setUserAgentOverride", { userAgent: vp.mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36" });
    await send("Page.navigate", { url: BASE + "/" });
    await sleep(4200);
    const probe = await send("Runtime.evaluate", { returnByValue: true, expression: PROBE });
    out.widths.push({ requested: vp, ...probe.result.value });
    const d = probe.result.value;
    console.log(`\n=== ${LABEL} @ ${vp.w} (inW=${d.innerWidth} overflow=${d.pageOverflows}) ===`);
    console.log(`  hero search y:      ${d.heroSearchY}  (visible=${d.heroSearchVisible})`);
    console.log(`  discovery CTA:      ${JSON.stringify(d.discoveryCtaText)} @ y=${d.discoveryCtaY}`);
    console.log(`  first deal card y:  ${d.firstDealY}`);
    console.log(`  first affiliate y:  ${d.firstAffiliateY}`);
    console.log(`  doc height:         ${d.docHeight}`);
    console.log(`  H2 lanes (${d.h2Count}):     ${JSON.stringify(d.h2s)}`);
    console.log(`  duplicate ids:      ${JSON.stringify(d.duplicateIds)}`);
    if (vp.w === 375) {
      console.log(`  --- section map (375) ---`);
      for (const s of d.sectionMap) console.log(`     y=${String(s.y).padStart(6)} h=${String(s.h).padStart(6)}  ${s.tag}${s.seg?(' ['+s.seg+']'):''}  ${s.heading||''}`);
    }
  }
  writeFileSync(path.join(process.cwd(), `_home-measure-${LABEL}.json`), JSON.stringify(out, null, 2));
  browser.close(); chrome.kill();
  console.log(`\n-> _home-measure-${LABEL}.json`);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

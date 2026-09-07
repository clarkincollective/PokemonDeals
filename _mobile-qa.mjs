// 13B.7.2 - dev-only mobile visual QA. Drives system Chrome over CDP
// (no npm deps) with real Emulation.setDeviceMetricsOverride, so the
// CSS viewport truly is 375 / 390 / 430. Captures screenshots + runs
// in-page geometry/a11y probes.
//
//   node _mobile-qa.mjs [baseUrl]      (default https://pokemondealfinder.com)
//
// Output: _mobileqa/<width>/<slug>[-<state>].png  +  _mobileqa/report.json

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] || "https://pokemondealfinder.com";
const CHROME =
  process.env.CHROME_BIN ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join(process.cwd(), "_mobileqa");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
];

const ROUTES = [
  { slug: "home", url: "/" },
  { slug: "search-pikachu", url: "/search?q=pikachu", filters: true },
  {
    slug: "search-dense",
    url: "/search?q=psa%2010%20pikachu&type=graded&grader=PSA&grade=10&maxPrice=200&listing=BIN",
    filters: true,
  },
  { slug: "search-evolving-skies-umbreon", url: "/search?q=evolving%20skies%20umbreon" },
  { slug: "search-team-rocket-umbreon", url: "/search?q=team%20rocket%20umbreon" },
  { slug: "search-charizard-4-102", url: "/search?q=charizard%204%2F102" },
  { slug: "pokemon-pikachu", url: "/pokemon/pikachu", filters: true },
  { slug: "pokemon-pikachu-graded", url: "/pokemon/pikachu?type=graded&grader=PSA&grade=10" },
  { slug: "sets-base-set", url: "/sets/base-set", filters: true },
  { slug: "sets-base-set-graded", url: "/sets/base-set?type=graded&grader=PSA" },
  { slug: "cards-charizard-base-set", url: "/cards/charizard-base-set", card: true },
  {
    slug: "cards-charizard-base-set-graded",
    url: "/cards/charizard-base-set?type=graded&grader=PSA&grade=10",
    card: true,
  },
];

// ---- tiny CDP client over the global WebSocket -------------------
let _id = 0;
function cdp(ws, method, params = {}, sessionId) {
  const id = ++_id;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.id === id) {
        ws.removeEventListener("message", onMsg);
        m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

async function main() {
  const userDir = path.join(os.tmpdir(), "pdf-mobileqa-" + Date.now());
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--remote-debugging-port=9333",
      "--user-data-dir=" + userDir,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  let wsUrl = null;
  chrome.stderr.on("data", (b) => {
    const m = String(b).match(/ws:\/\/[^\s]+/);
    if (m && !wsUrl) wsUrl = m[0];
  });
  for (let i = 0; i < 100 && !wsUrl; i++) await sleep(100);
  if (!wsUrl) throw new Error("Chrome did not expose a CDP endpoint");

  const browser = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    browser.addEventListener("open", r, { once: true });
    browser.addEventListener("error", j, { once: true });
  });

  const { targetId } = await cdp(browser, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp(browser, "Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => cdp(browser, method, params, sessionId);
  await send("Page.enable");
  await send("Runtime.enable");

  const report = { base: BASE, ranAt: new Date().toISOString(), viewports: [] };

  for (const vp of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: vp.w,
      screenHeight: vp.h,
    });
    await send("Emulation.setUserAgentOverride", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    mkdirSync(path.join(OUT, String(vp.w)), { recursive: true });
    const vpEntry = { requested: vp, routes: [] };

    for (const route of ROUTES) {
      const url = BASE + route.url;
      await send("Page.navigate", { url });
      // wait for load + a beat for client hydration / server-rendered search
      await sleep(route.card || route.filters ? 4200 : 3200);

      const probe = await send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const de = document.documentElement;
          const fs = (sel) => { const e = document.querySelector(sel); if(!e) return null; const c=getComputedStyle(e); const r=e.getBoundingClientRect(); return {fontPx:parseFloat(c.fontSize), h:Math.round(r.height), w:Math.round(r.width)}; };
          const controls = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')].map(e=>({
            tag:e.tagName, id:e.id||null, type:e.type||null,
            aria:e.getAttribute('aria-label')||null,
            label:(e.labels&&e.labels[0])?e.labels[0].textContent.trim().slice(0,24):null,
            fontPx:parseFloat(getComputedStyle(e).fontSize),
          }));
          const unlabeled = controls.filter(c => !c.aria && !c.label && c.type!=='checkbox' && c.type!=='radio');
          const ids = [...document.querySelectorAll('[id]')].map(e=>e.id);
          const dupIds = [...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
          // internal horizontal scrollers (intentional) vs page overflow
          const scrollers = [...document.querySelectorAll('*')].filter(el=>{
            const c=getComputedStyle(el); return (c.overflowX==='auto'||c.overflowX==='scroll') && el.scrollWidth>el.clientWidth+1;
          }).map(el=>({cls:(el.className||'').toString().slice(0,50), sw:el.scrollWidth, cw:el.clientWidth}));
          // any element whose right edge exceeds the viewport and is NOT inside a scroller
          const bleed = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.right <= de.clientWidth + 1) continue;
            let a=el, inScroller=false;
            while (a && a!==document.body) { const ac=getComputedStyle(a); if(ac.overflowX==='auto'||ac.overflowX==='scroll'){inScroller=true;break;} a=a.parentElement; }
            if (inScroller) continue;
            const t=(el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40);
            bleed.push({tag:el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/)[0]:''), right:Math.round(r.right), over:Math.round(r.right-de.clientWidth), text:t});
          }
          // headings
          const headings=[...document.querySelectorAll('h1,h2,h3')].map(h=>h.tagName+': '+h.textContent.trim().replace(/\\s+/g,' ').slice(0,44));
          // first meaningful action y-offset (search deal / card CTA / hero search)
          const firstDeal = document.querySelector('a[href^="/deals/"], a[href*="/deal/"]');
          const firstCTA = document.querySelector('a[href*="ebay"], a[data-analytics-affiliate], [class*="AffiliateLink"] a, a[rel*="sponsored"]');
          const heroSearch = document.querySelector('input[type="search"], input[placeholder*="earch"], input#pc-q');
          const y = (el)=> el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
          const stickyCta = document.querySelector('[class*="fixed"][class*="bottom-0"]');
          return {
            innerWidth: window.innerWidth, innerHeight: window.innerHeight,
            clientWidth: de.clientWidth, dpr: window.devicePixelRatio,
            pageScrollWidth: de.scrollWidth,
            pageOverflows: de.scrollWidth > de.clientWidth + 1,
            intentionalScrollers: scrollers.slice(0,6),
            bleedElements: bleed.slice(0,10),
            unlabeledControls: unlabeled,
            controlFontPx: controls.map(c=>({id:c.id||c.aria||c.tag, fontPx:c.fontPx})),
            minControlFontPx: controls.length ? Math.min(...controls.map(c=>c.fontPx)) : null,
            duplicateIds: dupIds,
            headingCount: headings.length,
            headings: headings.slice(0,16),
            firstDealY: y(firstDeal), firstCTAY: y(firstCTA), heroSearchY: y(heroSearch),
            docHeight: de.scrollHeight,
            filtersToggle: (()=>{ const b=[...document.querySelectorAll('button')].find(x=>/^Filters/.test(x.textContent.trim())); if(!b) return null; const r=b.getBoundingClientRect(); return {h:Math.round(r.height), w:Math.round(r.width), visible:r.height>0}; })(),
            filterPillHeights: [...document.querySelectorAll('a[href*="type="], a[href*="grader="], button[aria-pressed]')].slice(0,6).map(e=>Math.round(e.getBoundingClientRect().height)),
            chipHeights: [...document.querySelectorAll('[aria-label^="Remove filter"]')].map(e=>Math.round(e.getBoundingClientRect().height)),
            paginationRow: (()=>{ const p=[...document.querySelectorAll('button, a')].filter(e=>/Previous|Next|←|→/.test(e.textContent)); if(!p.length) return null; return p.slice(0,4).map(e=>{const r=e.getBoundingClientRect(); return {label:e.textContent.trim().slice(0,14), h:Math.round(r.height), w:Math.round(r.width), overflows:r.right>de.clientWidth+1};}); })(),
          };
        })()`,
      });
      const data = probe.result.value;

      // screenshot: collapsed
      const shot = async (name) => {
        const { data: b64 } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
        writeFileSync(path.join(OUT, String(vp.w), name + ".png"), Buffer.from(b64, "base64"));
      };
      await shot(route.slug);

      // filters open (search / pokemon / set)
      if (route.filters) {
        await send("Runtime.evaluate", {
          expression: `(() => { const b=[...document.querySelectorAll('button')].find(x=>/^Filters/.test(x.textContent.trim()) && x.getBoundingClientRect().height>0); if(b){b.click(); return 'clicked';} return 'no-toggle'; })()`,
          returnByValue: true,
        });
        await sleep(700);
        await shot(route.slug + "-filters-open");
      }

      // card page: scroll to bottom for the sticky CTA + footer
      if (route.card) {
        await send("Runtime.evaluate", { expression: "window.scrollTo(0, document.documentElement.scrollHeight)" });
        await sleep(900);
        await shot(route.slug + "-bottom");
        const bottomProbe = await send("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const de=document.documentElement;
            const sticky = document.querySelector('[class*="fixed"][class*="bottom-0"]');
            const sr = sticky ? sticky.getBoundingClientRect() : null;
            const footer = document.querySelector('footer, [role=contentinfo]');
            const fr = footer ? footer.getBoundingClientRect() : null;
            // is any footer link visually behind the sticky bar?
            let covered = [];
            if (sr) for (const a of document.querySelectorAll('footer a, [role=contentinfo] a')) {
              const r=a.getBoundingClientRect();
              if (r.bottom > sr.top && r.top < sr.bottom && r.height>0) covered.push(a.textContent.trim().slice(0,24));
            }
            return {
              stickyVisible: sr ? sr.height>0 && sr.top < window.innerHeight : false,
              stickyRect: sr ? {top:Math.round(sr.top), h:Math.round(sr.height)} : null,
              footerBottom: fr ? Math.round(fr.bottom) : null,
              viewportH: window.innerHeight,
              footerLinksCoveredBySticky: covered,
            };
          })()`,
        });
        data.cardBottom = bottomProbe.result.value;
        await send("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
      }

      vpEntry.routes.push({ slug: route.slug, url: route.url, ...data });
      process.stderr.write(`  [${vp.w}] ${route.slug}  inW=${data.innerWidth} overflow=${data.pageOverflows} minFont=${data.minControlFontPx}\n`);
    }
    report.viewports.push(vpEntry);
  }

  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  browser.close();
  chrome.kill();
  console.log("done -> _mobileqa/");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});

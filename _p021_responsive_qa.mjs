// P0.2.1 - dev-only TRUE responsive QA. Drives system Chrome over raw CDP
// (no npm deps) with real Emulation.setDeviceMetricsOverride, so the CSS
// viewport genuinely is 375 / 390 / 430 / 1280 - proven via window.innerWidth,
// not assumed via a resize_window call that doesn't actually change the
// rendered viewport.
//
// NO eBay API calls: this only navigates the production site in a browser
// and reads the DOM. Rendering a deal page never calls eBay at request time
// (verification is background/scanner-only - see app/api/verify-deals).
//
//   node _p021_responsive_qa.mjs [baseUrl]
//
// Output: _p021qa/<width>/<slug>.png  +  _p021qa/report.json

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] || "https://pokemondealfinder.com";
const CHROME =
  process.env.CHROME_BIN ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join(process.cwd(), "_p021qa");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// mobile:false + dpr:1 for the 1280 desktop check, matching real device
// characteristics rather than forcing every viewport into "mobile" mode.
const WIDTHS = [
  { w: 375, h: 812, mobile: true, dpr: 2 },
  { w: 390, h: 844, mobile: true, dpr: 2 },
  { w: 430, h: 932, mobile: true, dpr: 2 },
  { w: 1280, h: 900, mobile: false, dpr: 1 },
];

const ROUTES = [
  { slug: "home", url: "/", scrollAll: true },
  { slug: "best-finds", url: "/best-finds" },
  { slug: "deals", url: "/deals" },
  { slug: "deals-auctions", url: "/deals/auctions" },
  { slug: "expired-deal-29561", url: "/deals/29561", card: true },
  { slug: "live-deal", url: "/deals/32877", card: true }, // Lucario - confirmed ACTIVE this session, no new eBay call made by visiting
];

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
  const userDir = path.join(os.tmpdir(), "pdf-p021qa-" + Date.now());
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--remote-debugging-port=9334",
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
  await send("Log.enable");

  const report = { base: BASE, ranAt: new Date().toISOString(), viewports: [] };

  for (const vp of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: vp.dpr,
      mobile: vp.mobile,
      screenWidth: vp.w,
      screenHeight: vp.h,
    });
    if (vp.mobile) {
      await send("Emulation.setUserAgentOverride", {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
    } else {
      await send("Emulation.setUserAgentOverride", {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      });
    }
    mkdirSync(path.join(OUT, String(vp.w)), { recursive: true });
    const vpEntry = { requested: vp, routes: [] };

    for (const route of ROUTES) {
      const consoleErrors = [];
      const onConsole = (ev) => {
        const p = ev.params;
        if (p && p.type === "error") consoleErrors.push(p.args?.map((a) => a.value ?? a.description).join(" ") ?? "error");
      };
      const onException = (ev) => consoleErrors.push("exception: " + (ev.params?.exceptionDetails?.text ?? "unknown"));
      browser.addEventListener("message", (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.method === "Runtime.consoleAPICalled") onConsole(m);
        if (m.method === "Runtime.exceptionThrown") onException(m);
      });

      const url = BASE + route.url;
      await send("Page.navigate", { url });
      await sleep(route.card ? 4000 : 3500);

      const probe = await send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const de = document.documentElement;
          const ids = [...document.querySelectorAll('[id]')].map(e=>e.id);
          const dupIds = [...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
          const bleed = [];
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.right <= de.clientWidth + 1) continue;
            let a=el, inScroller=false;
            while (a && a!==document.body) { const ac=getComputedStyle(a); if(ac.overflowX==='auto'||ac.overflowX==='scroll'){inScroller=true;break;} a=a.parentElement; }
            if (inScroller) continue;
            const t=(el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,50);
            bleed.push({tag:el.tagName.toLowerCase(), right:Math.round(r.right), over:Math.round(r.right-de.clientWidth), text:t});
          }
          const bodyText = document.body.innerText;
          const staleWording = /\\bsold\\b|\\bended\\b|\\bexpired\\b/i.test(bodyText) && !/This deal has ended|This deal doesn.t exist|no longer available, sold/i.test(bodyText)
            ? bodyText.match(/.{0,30}(sold|ended|expired).{0,30}/i)?.[0] ?? null
            : null;
          const strikeGuarantee = [...document.querySelectorAll('del, s, [class*=line-through]')].some(e => /save|guarantee/i.test(e.parentElement?.textContent||''));
          const sticky = document.querySelector('[class*="fixed"][class*="bottom-0"]');
          const sr = sticky ? sticky.getBoundingClientRect() : null;
          const footer = document.querySelector('footer, [role=contentinfo]');
          const fr = footer ? footer.getBoundingClientRect() : null;
          let footerCovered = [];
          if (sr && fr) for (const a of document.querySelectorAll('footer a, [role=contentinfo] a')) {
            const r=a.getBoundingClientRect();
            if (r.bottom > sr.top && r.top < sr.bottom && r.height>0) footerCovered.push(a.textContent.trim().slice(0,24));
          }
          const controls = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].map(e=>({tag:e.tagName,fontPx:parseFloat(getComputedStyle(e).fontSize)}));
          const bodyLower = bodyText.toLowerCase();
          return {
            innerWidth: window.innerWidth, innerHeight: window.innerHeight,
            dpr: window.devicePixelRatio,
            pageScrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
            pageOverflows: de.scrollWidth > de.clientWidth + 1,
            bleedElements: bleed.slice(0,8),
            duplicateIds: dupIds,
            hasThisDealEnded: bodyLower.includes('this deal has ended'),
            hasSeeCurrentListings: bodyLower.includes('see current listings'),
            hasCurrentBid: bodyLower.includes('current bid'),
            hasCanRise: bodyLower.includes('can rise'),
            hasJustFound: bodyLower.includes('just found'),
            staleWordingContext: staleWording,
            strikeGuaranteeSuspect: strikeGuarantee,
            stickyVisible: sr ? sr.height>0 : false,
            stickyRect: sr ? {top:Math.round(sr.top), h:Math.round(sr.height)} : null,
            footerBottom: fr ? Math.round(fr.bottom) : null,
            footerLinksCoveredBySticky: footerCovered,
            minControlFontPx: controls.length ? Math.min(...controls.map(c=>c.fontPx)) : null,
            headingCount: document.querySelectorAll('h1,h2,h3').length,
            h1Text: document.querySelector('h1')?.textContent?.trim()?.slice(0,80) ?? null,
            filterControlsCount: document.querySelectorAll('a[href*="type="], a[href*="sort="], a[href*="country="], button[aria-pressed]').length,
          };
        })()`,
      });
      const data = probe.result.value;
      data.consoleErrors = consoleErrors.slice();

      const shotName = route.slug;
      const { data: b64 } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(path.join(OUT, String(vp.w), shotName + ".png"), Buffer.from(b64, "base64"));

      if (route.card) {
        await send("Runtime.evaluate", { expression: "window.scrollTo(0, document.documentElement.scrollHeight)" });
        await sleep(700);
        const { data: b64b } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        writeFileSync(path.join(OUT, String(vp.w), shotName + "-bottom.png"), Buffer.from(b64b, "base64"));
        await send("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
      }

      vpEntry.routes.push({ slug: route.slug, url: route.url, ...data });
      process.stderr.write(
        `  [${vp.w}] ${route.slug}  inW=${data.innerWidth} overflow=${data.pageOverflows} consoleErr=${data.consoleErrors.length} dupIds=${data.duplicateIds.length}\n`
      );
    }
    report.viewports.push(vpEntry);
  }

  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  browser.close();
  chrome.kill();
  console.log("done -> _p021qa/");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});

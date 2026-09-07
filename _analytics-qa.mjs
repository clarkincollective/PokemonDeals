// 13C.5 - genuine Chrome CDP homepage analytics verification. Wraps
// fetch/sendBeacon before any page script runs, decodes PostHog event
// batches (gzip / json / form), then drives the §5 interaction script and
// prints an event-count table per interaction.
//   node _analytics-qa.mjs [baseUrl] [width]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3141";
const WIDTH = Number(process.argv[3] || 390);
const CHROME = process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";

let _id = 0;
function cdp(ws, m, p = {}, s) {
  const id = ++_id;
  return new Promise((res, rej) => {
    const on = (ev) => { let x; try { x = JSON.parse(ev.data); } catch { return; } if (x.id === id) { ws.removeEventListener("message", on); x.error ? rej(new Error(m + ": " + x.error.message)) : res(x.result); } };
    ws.addEventListener("message", on);
    ws.send(JSON.stringify(s ? { id, method: m, params: p, sessionId: s } : { id, method: m, params: p }));
  });
}

// injected into every new document BEFORE page scripts
const WRAP = `(() => {
  window.__ph = [];
  const push = (o) => { try { window.__ph.push(o); } catch {} };
  const isPh = (u) => /i\\.posthog\\.com/.test(String(u));
  async function decode(body) {
    try {
      if (body == null) return null;
      if (typeof body === "string") return body;
      let buf;
      if (body instanceof Blob) buf = await body.arrayBuffer();
      else if (body instanceof ArrayBuffer) buf = body;
      else if (body && body.buffer) buf = body.buffer;
      else if (body instanceof FormData) { const d = body.get("data"); return typeof d === "string" ? d : "[formdata]"; }
      else return "[" + (body && body.constructor && body.constructor.name) + "]";
      try {
        const ds = new DecompressionStream("gzip");
        const s = new Blob([buf]).stream().pipeThrough(ds);
        return await new Response(s).text();
      } catch { return new TextDecoder().decode(buf); }
    } catch (e) { return "[decode-err " + e + "]"; }
  }
  const of = window.fetch;
  window.fetch = function(url, opts) {
    try { if (isPh(url) && opts && opts.body != null) decode(opts.body).then((t) => push({ via: "fetch", url: String(url), text: t })); } catch {}
    return of.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    const ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      try { if (isPh(url)) decode(data).then((t) => push({ via: "beacon", url: String(url), text: t })); } catch {}
      return ob(url, data);
    };
  }
})();`;

function extractEvents(entries) {
  const names = [];
  for (const e of entries) {
    let t = e.text;
    if (!t) continue;
    // form-encoded "data=<base64 or urlencoded json>"
    if (/^data=/.test(t)) {
      const v = decodeURIComponent(t.slice(5).replace(/\\+/g, " "));
      try { t = Buffer.from(v, "base64").toString("utf8"); } catch { t = v; }
    }
    let json;
    try { json = JSON.parse(t); } catch { continue; }
    const arr = Array.isArray(json) ? json : json.batch || (json.event ? [json] : []);
    for (const ev of arr) if (ev && ev.event) names.push(ev.event);
  }
  return names;
}

async function main() {
  const chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--hide-scrollbars","--remote-debugging-port=9343","--user-data-dir="+path.join(os.tmpdir(),"aq"+Date.now()),"about:blank"], { stdio: ["ignore","ignore","pipe"] });
  let ws = null; chrome.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !ws) ws = m[0]; });
  for (let i = 0; i < 100 && !ws; i++) await sleep(100);
  const B = new WebSocket(ws);
  await new Promise((r, j) => { B.addEventListener("open", r, { once: true }); B.addEventListener("error", j, { once: true }); });
  const { targetId } = await cdp(B, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp(B, "Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => cdp(B, m, p, sessionId);
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Console.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: WIDTH < 1024, screenWidth: WIDTH, screenHeight: 844 });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: WRAP });

  const consoleErrors = [];
  B.addEventListener("message", (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.method === "Log.entryAdded" && m.params?.entry?.level === "error") consoleErrors.push(m.params.entry.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") consoleErrors.push((m.params.args || []).map((a) => a.value || a.description).join(" "));
  });

  const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const readNew = async (label) => {
    const raw = await evalJs("JSON.stringify(window.__ph.splice(0))");
    const names = extractEvents(JSON.parse(raw || "[]"));
    const counts = {};
    for (const n of names) counts[n] = (counts[n] || 0) + 1;
    console.log(`\n[${label}]  ${names.length} events`);
    for (const [k, v] of Object.entries(counts).sort()) console.log(`   ${v}x  ${k}`);
    return counts;
  };

  await send("Page.navigate", { url: BASE + "/" });
  await sleep(9000); // deferred init (requestIdleCallback / 1.5s fallback) + flush
  await readNew("initial load (expect: 1x homepage_view, section/deal impressions for above-fold lanes)");

  // scroll through the lanes
  for (const y of [1200, 3200, 5200, 10200, 12200, 16000]) {
    await evalJs(`window.scrollTo(0, ${y})`); await sleep(1200);
  }
  await sleep(1500);
  await readNew("after scrolling through all lanes (expect: each section_impression once, deal_card_impression for best/ending/just cards)");

  // click a flagship deal card IMAGE (opens detail) - should fire best_deal_clicked, NOT affiliate_click
  await evalJs(`(() => { const s=document.querySelector('[data-analytics-section="best_deals"]'); const a=s && s.querySelector('a[href^="/deals/"]'); if(a){ a.addEventListener('click',e=>e.preventDefault(),{once:true}); a.click(); return 'clicked '+a.getAttribute('href'); } return 'no card'; })()`).then((r) => console.log("\n>>", r));
  await sleep(1500);
  await readNew("click flagship card image (expect: 1x best_deal_clicked, 0x affiliate_click)");

  // click a flagship AFFILIATE CTA - should fire affiliate_click, NOT best_deal_clicked (13C.5 disjoin)
  await evalJs(`(() => { const s=document.querySelector('[data-analytics-section="best_deals"]'); const a=s && s.querySelector('a[rel~="sponsored"]'); if(a){ a.addEventListener('click',e=>e.preventDefault(),{once:true}); a.click(); return 'clicked CTA '+a.getAttribute('href').slice(0,40); } return 'no CTA'; })()`).then((r) => console.log("\n>>", r));
  await sleep(1500);
  await readNew("click flagship affiliate CTA (expect: 1x affiliate_click, 0x best_deal_clicked)");

  // click an auction card image
  await evalJs(`(() => { const s=document.querySelector('[data-analytics-section="ending_soon"]'); const a=s && s.querySelector('a[href^="/deals/"]'); if(a){ a.addEventListener('click',e=>e.preventDefault(),{once:true}); a.click(); return 'clicked'; } return 'none'; })()`);
  await sleep(1200);
  await readNew("click auction card image (expect: 1x ending_soon_clicked)");

  // click a catalogue link
  await evalJs(`(() => { const a=document.querySelector('a[data-analytics-click="browse_pokemon_clicked"]') || document.querySelector('[data-analytics-section="browse"] a[href="/pokemon"]'); if(a){ a.addEventListener('click',e=>e.preventDefault(),{once:true}); a.click(); return 'clicked'; } return 'none'; })()`);
  await sleep(1200);
  await readNew("click Explore /pokemon link (expect: 1x browse_pokemon_clicked)");

  // Discover CTA (13C.5 fix - was silently dropped)
  await evalJs(`(() => { const a=document.querySelector('a[data-analytics-click="discover_deals_clicked"]'); if(a){ a.addEventListener('click',e=>e.preventDefault(),{once:true}); a.click(); return 'clicked'; } return 'none'; })()`);
  await sleep(1200);
  await readNew("click 'Browse today's deals' Discover CTA (expect: 1x discover_deals_clicked - FIXED in 13C.5)");

  // hero example query (13C.5 fix)
  await evalJs(`(() => { const a=document.querySelector('a[data-analytics-click="hero_example_clicked"]'); if(a){ a.addEventListener('click',e=>e.preventDefault(),{once:true}); a.click(); return 'clicked'; } return 'none'; })()`);
  await sleep(1200);
  await readNew("click a 'try a search:' example (expect: 1x hero_example_clicked - FIXED in 13C.5)");

  // hero search submit
  await evalJs(`(() => { const i=document.querySelector('header input[name="q"]'); if(!i) return 'no input'; const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i,'psa 10 pikachu'); i.dispatchEvent(new Event('input',{bubbles:true})); const f=i.closest('form'); f.addEventListener('submit',e=>e.preventDefault(),{once:true}); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return 'submitted'; })()`);
  await sleep(1800);
  await readNew("hero search submit (expect: search_started + search_submitted, source:hero)");

  console.log("\n=== console errors ===");
  console.log(consoleErrors.length ? consoleErrors.slice(0, 20).join("\n") : "  (none)");

  B.close(); chrome.kill();
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

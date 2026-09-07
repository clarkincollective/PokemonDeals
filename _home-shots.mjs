// 13C.1 - homepage viewport screenshots for visual QA.
//   node _home-shots.mjs <baseUrl> <label>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os"; import path from "node:path";
const BASE = process.argv[2] || "http://localhost:3141";
const LABEL = process.argv[3] || "run";
const CHROME = process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join(process.cwd(), "_homeshots", LABEL);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let _id = 0;
function cdp(ws, m, p = {}, s) {
  const id = ++_id;
  return new Promise((res, rej) => {
    const on = (ev) => { let x; try { x = JSON.parse(ev.data); } catch { return; } if (x.id === id) { ws.removeEventListener("message", on); x.error ? rej(new Error(m + ": " + x.error.message)) : res(x.result); } };
    ws.addEventListener("message", on);
    ws.send(JSON.stringify(s ? { id, method: m, params: p, sessionId: s } : { id, method: m, params: p }));
  });
}
const VPS = [
  { w: 375, h: 812, mobile: true, ys: [0, 700, 1400] },
  { w: 430, h: 932, mobile: true, ys: [0, 800] },
  { w: 1280, h: 900, mobile: false, ys: [0, 900] },
];
async function main() {
  const chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--hide-scrollbars","--remote-debugging-port=9336","--user-data-dir="+path.join(os.tmpdir(),"hs"+Date.now()),"about:blank"], { stdio: ["ignore","ignore","pipe"] });
  let ws = null; chrome.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !ws) ws = m[0]; });
  for (let i = 0; i < 100 && !ws; i++) await sleep(100);
  const B = new WebSocket(ws);
  await new Promise((r, j) => { B.addEventListener("open", r, { once: true }); B.addEventListener("error", j, { once: true }); });
  const { targetId } = await cdp(B, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp(B, "Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => cdp(B, m, p, sessionId);
  await send("Page.enable"); await send("Runtime.enable");
  for (const vp of VPS) {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile, screenWidth: vp.w, screenHeight: vp.h });
    await send("Emulation.setUserAgentOverride", { userAgent: vp.mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36" });
    await send("Page.navigate", { url: BASE + "/" });
    await sleep(4200);
    for (const y of vp.ys) {
      await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${y})` });
      await sleep(400);
      const { data: b64 } = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(path.join(OUT, `${vp.w}-y${y}.png`), Buffer.from(b64, "base64"));
    }
    process.stderr.write(`  ${LABEL} ${vp.w} done\n`);
  }
  B.close(); chrome.kill();
  console.log("-> _homeshots/" + LABEL);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });

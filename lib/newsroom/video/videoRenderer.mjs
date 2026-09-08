// Phase SOCIAL-CREATIVE-4C - MOTION-NATIVE RENDER ENGINE.
//
//   animated HTML (videoDocument.mjs)
//     -> headless Chrome over CDP
//     -> every animation seeked to an exact currentTime per frame via the
//        Web Animations API (document.getAnimations()) - fully deterministic
//     -> one PNG per frame  (fps * duration frames)
//     -> ffmpeg -> H.264 / yuv420p / +faststart MP4 (1080x1920)
//     -> one poster PNG at the plan's poster_frame.at_ms
//
// Reuses the proven ffmpeg-static / ffprobe path from
// lib/social/videoRender.mjs. NO OpenAI, NO network at render time (card
// art is a data: URI). Writes files only - there is no publish path.

import { spawn, execFile } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { FFMPEG, FFPROBE, probeMp4 } from "../../social/videoRender.mjs";
import { buildVideoDocument, SEEK_JS } from "./videoDocument.mjs";

export { probeMp4 } from "../../social/videoRender.mjs";
export const VIDEO_RENDERER_VERSION = "4c.1";

const execFileP = promisify(execFile);
const CHROME = process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";

let _id = 0;
function cdp(ws, method, params = {}, sessionId) {
  const id = ++_id;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id === id) {
        ws.removeEventListener("message", onMsg);
        m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

/**
 * renderVideoPlanToMp4(plan, outPath, { posterPath, keepFrames })
 *  -> { ok, path, poster, frames, fps, width, height, durationMs, probe }
 *     or { ok:false, ...failure-ish { state, reason } }
 */
export async function renderVideoPlanToMp4(plan, outPath, { posterPath = null, keepFrames = null } = {}) {
  const { html, total } = buildVideoDocument(plan);
  const fps = plan.fps || 30;
  const width = plan.width || 1080;
  const height = plan.height || 1920;
  const frameCount = Math.round((total / 1000) * fps);
  const posterAt = plan.poster_frame?.at_ms ?? Math.round(total * 0.25);

  const framesDir = keepFrames || path.join(os.tmpdir(), `nr-vid-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(path.dirname(outPath), { recursive: true });

  if (!existsSync(CHROME)) return { ok: false, state: "VIDEO_RENDER_FAILED", reason: `Chrome not found at ${CHROME} (set CHROME_BIN)` };

  const userDir = path.join(os.tmpdir(), "nr-vid-chrome-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--run-all-compositor-stages-before-draw",
    "--force-color-profile=srgb", "--remote-debugging-port=0", "--user-data-dir=" + userDir, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let wsUrl = null;
  chrome.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !wsUrl) wsUrl = m[0]; });
  for (let i = 0; i < 200 && !wsUrl; i++) await sleep(100);
  if (!wsUrl) { chrome.kill(); return { ok: false, state: "VIDEO_RENDER_FAILED", reason: "Chrome exposed no CDP endpoint" }; }

  const browser = new WebSocket(wsUrl);
  await new Promise((res, rej) => { browser.addEventListener("open", res, { once: true }); browser.addEventListener("error", rej, { once: true }); });

  let posterFrameIdx = Math.max(0, Math.min(frameCount - 1, Math.round((posterAt / 1000) * fps)));
  try {
    const { targetId } = await cdp(browser, "Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp(browser, "Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => cdp(browser, method, params, sessionId);

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });

    const { frameTree } = await send("Page.getFrameTree");
    await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
    await sleep(950); // font + image decode + first layout
    await send("Runtime.evaluate", { expression: SEEK_JS, returnByValue: true });

    const pad = (n) => String(n).padStart(5, "0");
    const frameMs = 1000 / fps;
    for (let f = 0; f < frameCount; f++) {
      const t = Math.round(f * frameMs);
      // eslint-disable-next-line no-await-in-loop
      await send("Runtime.evaluate", { expression: `__seek(${t})`, returnByValue: true });
      // eslint-disable-next-line no-await-in-loop
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: false, fromSurface: true });
      writeFileSync(path.join(framesDir, `frame_${pad(f)}.png`), Buffer.from(data, "base64"));
    }
  } catch (e) {
    browser.close(); chrome.kill();
    if (!keepFrames) rmSync(framesDir, { recursive: true, force: true });
    return { ok: false, state: "VIDEO_RENDER_FAILED", reason: String(e?.message ?? e).slice(0, 200) };
  } finally {
    browser.close(); chrome.kill();
  }

  // encode - social-safe H.264
  try {
    await execFileP(FFMPEG, [
      "-y", "-framerate", String(fps), "-i", path.join(framesDir, "frame_%05d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0",
      "-preset", "medium", "-crf", "20", "-r", String(fps), "-movflags", "+faststart", "-an", outPath,
    ]);
  } catch (e) {
    if (!keepFrames) rmSync(framesDir, { recursive: true, force: true });
    return { ok: false, state: "VIDEO_RENDER_FAILED", reason: `ffmpeg: ${String(e?.message ?? e).slice(0, 180)}` };
  }

  let poster = null;
  if (posterPath) {
    const src = path.join(framesDir, `frame_${String(posterFrameIdx).padStart(5, "0")}.png`);
    if (existsSync(src)) { mkdirSync(path.dirname(posterPath), { recursive: true }); copyFileSync(src, posterPath); poster = posterPath; }
  }

  const nFrames = readdirSync(framesDir).filter((x) => x.endsWith(".png")).length;
  if (!keepFrames) rmSync(framesDir, { recursive: true, force: true });

  let probe = null;
  try { probe = await probeMp4(outPath); } catch { /* probe is best-effort */ }

  return { ok: true, path: outPath, poster, frames: nFrames, fps, width, height, durationMs: total, poster_at_ms: posterAt, probe };
}

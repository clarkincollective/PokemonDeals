// Phase 13E.4 - the DETERMINISTIC MOTION RENDERER.
//
//   animated HTML (lib/social/videoDocument.mjs)
//     -> headless Chrome over CDP
//     -> every CSS animation PAUSED, then SEEKED to an exact time per
//        frame via the Web Animations API (document.getAnimations())
//     -> one PNG per frame (exactly fps * duration frames)
//     -> ffmpeg -> H.264 / yuv420p / +faststart MP4 (1080x1920, 30fps)
//
// Seeking paused animations with `Animation.currentTime` is fully
// deterministic: the same timeline always produces byte-identical motion,
// and it sidesteps the virtual-time protocol stalls that headless Chrome
// hits on heavier composited pages. There is NO OpenAI anywhere in this
// file and NO network at render time - fonts are embedded base64 and the
// card / background / screenshot are local file:// paths. It writes files
// and nothing else; there is no publish path.

import { spawn, execFile } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const execFileP = promisify(execFile);
export const FFMPEG = ffmpegPath;
export const FFPROBE = ffprobeStatic.path;
const CHROME = process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";

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

import { BAKE_JS } from "./videoDocument.mjs";

// The document carries its motion as CSS custom props, not @keyframes.
// BAKE_JS (from videoDocument.mjs) resolves every animated element's exact
// style for a given ms and writes it to element.style on the MAIN thread -
// so there is no compositor-thread animation for captureScreenshot to
// race. Injected once, then called per frame.

// Render every frame of `timeline` from `html` to PNGs, then encode.
// Returns { path, frames, fps, width, height, durationMs }.
export async function renderTimelineToMp4(timeline, html, outPath, { keepFrames = null } = {}) {
  const { width, height, fps, frameCount, durationMs } = timeline;
  const frameMs = 1000 / fps;
  const framesDir = keepFrames || path.join(os.tmpdir(), `pdf-vid-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(path.dirname(outPath), { recursive: true });

  const userDir = path.join(os.tmpdir(), "pdf-vid-chrome-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--run-all-compositor-stages-before-draw",
      "--force-color-profile=srgb",
      "--remote-debugging-port=0",
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
  for (let i = 0; i < 200 && !wsUrl; i++) await sleep(100);
  if (!wsUrl) {
    chrome.kill();
    throw new Error("videoRender: Chrome exposed no CDP endpoint (CHROME_BIN?)");
  }

  const browser = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    browser.addEventListener("open", res, { once: true });
    browser.addEventListener("error", rej, { once: true });
  });

  // wrap a CDP call so a stalled headless Chrome surfaces as an error the
  // caller can retry, instead of hanging the whole batch forever.
  const withTimeout = (p, ms, label) =>
    Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error(`videoRender: CDP timeout after ${ms}ms (${label})`)), ms).unref?.()),
    ]);

  try {
    const { targetId } = await cdp(browser, "Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp(browser, "Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => withTimeout(cdp(browser, method, params, sessionId), 30_000, method);

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    });

    // The HTML is fully self-contained: fonts are base64 @font-face and the
    // card artwork / approved background / site screenshot are inlined as
    // data: URIs by lib/social/videoDocument.mjs. So Page.setDocumentContent
    // (fast, no navigation) is safe - there are no file:// subresources for
    // an opaque-origin document to be blocked from loading.
    const { frameTree } = await send("Page.getFrameTree");
    await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
    // real wall-clock wait for off-thread font + image decode and first
    // layout. Then install the baker and render frame 0.
    await sleep(900);
    await send("Runtime.evaluate", { expression: `window.__vbake = ${BAKE_JS}; __vbake(0);`, returnByValue: true });

    const pad = (n) => String(n).padStart(5, "0");
    for (let f = 0; f < frameCount; f++) {
      const t = Math.round(f * frameMs);
      await send("Runtime.evaluate", { expression: `__vbake(${t})`, returnByValue: true });
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 0, y: 0, width, height, scale: 1 },
        captureBeyondViewport: false,
        fromSurface: true,
      });
      writeFileSync(path.join(framesDir, `frame_${pad(f)}.png`), Buffer.from(data, "base64"));
    }
  } finally {
    browser.close();
    chrome.kill();
  }

  // encode - social-safe H.264: yuv420p, high profile, even dims, faststart
  await execFileP(FFMPEG, [
    "-y",
    "-framerate", String(fps),
    "-i", path.join(framesDir, "frame_%05d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.0",
    "-preset", "medium",
    "-crf", "20",
    "-r", String(fps),
    "-movflags", "+faststart",
    "-an",
    outPath,
  ]);

  const nFrames = readdirSync(framesDir).filter((x) => x.endsWith(".png")).length;
  if (!keepFrames) rmSync(framesDir, { recursive: true, force: true });
  return { path: outPath, frames: nFrames, fps, width, height, durationMs };
}

// ffprobe -> a small normalised JSON summary
export async function probeMp4(mp4Path) {
  const { stdout } = await execFileP(FFPROBE, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    mp4Path,
  ]);
  const j = JSON.parse(stdout);
  const v = (j.streams || []).find((s) => s.codec_type === "video") || {};
  const num = (r) => {
    if (!r) return null;
    const [a, b] = String(r).split("/").map(Number);
    return b ? a / b : a;
  };
  return {
    ok: true,
    codec: v.codec_name || null,
    pix_fmt: v.pix_fmt || null,
    width: v.width || null,
    height: v.height || null,
    fps: num(v.r_frame_rate),
    avg_fps: num(v.avg_frame_rate),
    nb_frames: v.nb_frames ? Number(v.nb_frames) : null,
    duration_s: j.format?.duration ? Number(j.format.duration) : (v.duration ? Number(v.duration) : null),
    has_audio: (j.streams || []).some((s) => s.codec_type === "audio"),
    size_bytes: j.format?.size ? Number(j.format.size) : null,
  };
}

// SOCIAL-LIVE-3 - assemble the finished short from rendered 9:16 scene PNGs:
// slow push-in per scene, crossfades, original locally-synthesised audio bed
// (no third-party music), H.264 + AAC, 1080x1920, 24 fps. $0.
// Same pipeline as the first published TikTok / YouTube short.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { FFMPEG, probeMp4 } from "../videoRender.mjs";

const run = promisify(execFile);
export const XFADE_S = 0.4;

export async function assembleShort(scenePngs, outPath, { workDir }) {
  // scenePngs: [{ png, secs }]
  const segs = [];
  for (const [i, s] of scenePngs.entries()) {
    const frames = Math.round(s.secs * 24);
    const seg = path.join(workDir, `seg_${i}.mp4`);
    // eslint-disable-next-line no-await-in-loop
    await run(FFMPEG, ["-y", "-loop", "1", "-i", s.png, "-vf",
      `scale=1188:2112,zoompan=z='min(1+0.0008*on,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=24,format=yuv420p`,
      "-frames:v", String(frames), "-c:v", "libx264", "-preset", "medium", "-crf", "18", seg], { maxBuffer: 1 << 24 });
    segs.push({ seg, secs: s.secs });
  }
  const total = segs.reduce((t, s) => t + s.secs, 0) - XFADE_S * (segs.length - 1);
  const parts = segs.map((_, i) => `[${i}:v]settb=AVTB,fps=24,format=yuv420p[v${i}]`);
  let last = "v0";
  let offset = 0;
  for (let i = 1; i < segs.length; i++) {
    offset += segs[i - 1].secs - XFADE_S;
    const outL = i === segs.length - 1 ? "v" : `x${i}`;
    parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${XFADE_S}:offset=${offset.toFixed(2)}[${outL}]`);
    last = outL;
  }
  if (segs.length === 1) parts.push("[v0]null[v]");
  const tones = [220, 261.63, 329.63, 440].map((hz, i) => `sine=frequency=${hz}:sample_rate=48000:duration=${total.toFixed(2)}[s${i}]`);
  parts.push(...tones, `[s0][s1][s2][s3]amix=inputs=4:normalize=0,volume=0.07,tremolo=f=0.35:d=0.35,lowpass=f=1800,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2[a]`);
  await run(FFMPEG, ["-y", ...segs.flatMap((s) => ["-i", s.seg]), "-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", outPath], { maxBuffer: 1 << 24 });
  const probe = await probeMp4(outPath);
  const ok = probe.ok && probe.width === 1080 && probe.height === 1920 && probe.has_audio && probe.duration_s >= 8 && probe.duration_s <= 60 && probe.codec === "h264";
  return { ok, probe, total_s: total, reason: ok ? null : `video probe failed: ${JSON.stringify(probe)}` };
}

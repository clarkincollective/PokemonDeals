#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4C.5 (§37, §38) - PREMIUM TRUST-FIRST POLISH proof.
//
//   node scripts/socialCreativeVideo1gPack.mjs            plan + audits
//   node scripts/socialCreativeVideo1gPack.mjs --render    also render the MP4s
//
// OLD 4C.4 vs NEW 4C.5. Reuses the approved cached 5A.1 masters + REAL
// canonical cards (card-art cache). $0 incremental API. DEAL_DROP excluded
// (fact drift, §38). NOTHING published.

import { existsSync, mkdirSync, writeFileSync, copyFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const execFileP = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "video-1g-premium-polish");
const OLD = path.join(ROOT, ".social-preview", "video-1f-professional");
const RENDER = process.argv.slice(2).includes("--render");
const CACHE = path.join(OUT, "_cache");
const CARD_CACHE = path.join(ROOT, ".social-preview", "card-art-cache");

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { buildFactLock } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const { buildSemanticManifest } = await import("../lib/newsroom/hybrid/semanticManifest.mjs");
const V = await import("../lib/newsroom/video/index.mjs");
const { videoSemanticHash } = await import("../lib/newsroom/video/videoDirector.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { FFMPEG } = await import("../lib/social/videoRender.mjs");

const db = supabaseAdmin();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "media"), { recursive: true });
mkdirSync(CACHE, { recursive: true });

console.log(`=== SOCIAL-CREATIVE-4C.5  premium trust-first polish proof ===`);
console.log(`render: ${RENDER ? "ON" : "OFF"}   (approved cached masters + REAL canonical cards; $0 incremental API)\n`);

const MASTERS = {
  ASKING_VS_SOLD: ".social-preview/creative-5a1-final/full/A_asking_vs_sold.png",
  MARKET_SNAPSHOT: ".social-preview/creative-5a1-final/full/B_market_snapshot.png",
};

async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
function localCard(id) {
  const p = path.join(CARD_CACHE, `${id}.jpg`);
  if (id && existsSync(p)) return p;
  for (const c of V.EVERGREEN_CTA_CARDS) { const q = path.join(CARD_CACHE, `${c.id}.jpg`); if (existsSync(q)) return q; }
  return null;
}
async function frame(mp4, at, out) {
  try { await execFileP(FFMPEG, ["-y", "-ss", String(at), "-i", mp4, "-frames:v", "1", out]); return existsSync(out); } catch { return false; }
}
async function contactSheet(mp4, times, out) {
  const dir = path.join(OUT, "media", "_cs");
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  for (let i = 0; i < times.length; i++) await frame(mp4, times[i], path.join(dir, `${i}.png`));
  try { await execFileP(FFMPEG, ["-y", "-framerate", "1", "-i", path.join(dir, "%d.png"), "-vf", "scale=360:640,tile=3x2", out]); } catch { /* */ }
  rmSync(dir, { recursive: true, force: true });
}
async function mobilePreview(storyFrame, ctaFrame, out) {
  try {
    await execFileP(FFMPEG, ["-y", "-i", storyFrame, "-i", ctaFrame, "-filter_complex", "[0:v]scale=360:640[a];[1:v]scale=360:640[b];[a][b]hstack", out]);
  } catch { /* */ }
}

const aRes = await MD.resolveAskingVsSold().catch((e) => ({ ok: false, reason: e.message }));
const mRes = await MD.resolveMarketShape().catch((e) => ({ ok: false, reason: e.message }));

const stories = [];
if (aRes?.ok) stories.push({ id: "ASKING_VS_SOLD", family: "asking_vs_sold", series: "WHY_SOLD_PRICES_MATTER", resolved: aRes,
  facts: { card_name: aRes.data.card_name, card_set: aRes.data.card_set, card_tcgplayer_id: aRes.data.tcgplayerId, listed_price: aRes.data.asking_usd, market_price: aRes.data.market_ref_usd }, heroId: aRes.data.tcgplayerId });
if (mRes?.ok) stories.push({ id: "MARKET_SNAPSHOT", family: "market_shape", series: "MARKET_SNAPSHOT", resolved: mRes,
  facts: { tracked_count: mRes.data.priced_cards, percentages: [mRes.data.under_25_pct, mRes.data.over_100_pct], card_name: mRes.data.featured?.card_name }, heroId: mRes.data.featured?.tcgplayerId });

console.log("DEAL_DROP: EXCLUDED - the only cached master shows 45% for a true 44% (§38)\n");

const results = {};

for (const s of stories) {
  const { id, family, series, resolved } = s;
  const masterPath = MASTERS[id];
  if (!existsSync(masterPath)) { console.log(`${id}: SKIP - no approved master`); results[id] = { status: "NO_MASTER" }; continue; }

  const catRow = await catalogRow(s.heroId);
  const factLock = buildFactLock({ facts_json: s.facts ?? resolved.data });
  const contract = contractFor(series);
  const sem = buildSemanticManifest({ layout: family, factLock, resolved, contract, cardCatalogRow: catRow });
  const semanticHash = videoSemanticHash(sem);
  const heroCardPath = localCard(s.heroId);
  const ch = { story_id: id, semantic_hash: `cap-${id}`, image_artifact_id: `img-${id}` };

  V.registerExistingMaster({ storyId: id, semanticHash, family, imagePath: masterPath, dir: CACHE, brandInMaster: true, verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", note: "5A.1 BUFFER_READY" } });

  const r = V.runProfessionalSocialLoop({
    story: { story_id: id }, semanticManifest: sem, factLock, captionHandoff: ch, family,
    cardImagePaths: heroCardPath ? [heroCardPath] : [],
    heroCardId: /^\d+$/.test(String(s.heroId ?? "")) ? String(s.heroId) : null,
    heroCardName: sem.card_identity?.name ?? null,
    cacheDir: CACHE, ctaCacheDir: CARD_CACHE,
  });

  const rec = {
    id, family, status: r.state, ok: r.ok, revised: r.revised,
    duration_ms: r.duration_ms, story_ms: r.story_ms, cta_ms: r.cta_ms, transition_ms: r.timeline?.transition_ms,
    derivative: r.derivative ? { fits: r.derivative.fits, density: r.derivative.density, blocks: r.derivative.blocks.map((b) => `${b.id}:${b.role}:${b.font ?? "-"}${b.style?.panel ? "[panel]" : ""}${b.style?.spotlight ? "[spot]" : ""}`), atmosphere: r.derivative.atmosphere } : null,
    timeline: r.timeline ? r.timeline.events.map((e) => `${e.id}:${e.kind}@${e.at_ms}-${e.end_ms}${e.ease ? " " + e.ease.slice(13, 22) : ""}`) : null,
    end_screen: r.end_screen ? { cards: r.end_screen.cards.map((c) => c.id), value_points: r.end_screen.value_points, primary_cta: r.end_screen.primary_cta, domain: r.end_screen.domain, duration_ms: r.end_screen.duration_ms } : null,
    qa: r.qa?.verification ?? null,
    professional_brand: r.professional_brand ? { verdict: r.professional_brand.verdict, score: r.professional_brand.score, reasons: r.professional_brand.reasons } : null,
    cta_hold: r.cta_hold, cta_readability: r.cta_readability_audit, frame_density: r.frame_density_audit,
    dead_black: r.dead_black_audit, mobile_preview: r.mobile_preview_audit, replay_transition: r.replay_transition_audit,
    motion_salience: r.motion_salience, cost: r.cost,
  };

  writeFileSync(path.join(OUT, `${id}_professional_brand_audit.json`), JSON.stringify({ ...(r.professional_brand ?? {}), sub: r.qa?.sub, verification: r.qa?.verification }, null, 2));
  writeFileSync(path.join(OUT, `${id}_frame_density_audit.json`), JSON.stringify({ ...r.frame_density_audit, density: r.derivative?.density, blocks: r.derivative?.blocks?.map((b) => ({ id: b.id, h: b.zone?.h, role: b.role })) }, null, 2));
  writeFileSync(path.join(OUT, `${id}_motion_salience.json`), JSON.stringify({ ...r.motion_salience, events: r.timeline?.events, easing: r.timeline?.easing }, null, 2));
  writeFileSync(path.join(OUT, `${id}_cta_hold_audit.json`), JSON.stringify({ ...r.cta_hold, cta_content_start_ms: r.timeline?.cta_content_start_ms, sample_frames_ms: [r.timeline?.cta_content_start_ms + 200, r.timeline?.cta_content_start_ms + 1000, r.timeline?.cta_content_start_ms + 2200] }, null, 2));
  writeFileSync(path.join(OUT, `${id}_mobile_preview_audit.json`), JSON.stringify({ verdict: r.mobile_preview_audit, note: "structural check at ~360w; see media/MOBILE_PREVIEW.png" }, null, 2));
  writeFileSync(path.join(OUT, `${id}_readability.json`), JSON.stringify({ mobile_readability: r.qa?.verification?.mobile_readability, cta_readability: r.cta_readability_audit, fonts: r.derivative?.blocks?.map((b) => ({ id: b.id, role: b.role, font: b.font ?? null })) }, null, 2));
  writeFileSync(path.join(OUT, `${id}_fact_audit.json`), JSON.stringify(r.fact_audit, null, 2));
  writeFileSync(path.join(OUT, `${id}_canonical_card_audit.json`), JSON.stringify({ real_cards: r.qa?.verification?.real_cards, derivative_cards: r.derivative?.card_asset_paths, cta_fan: r.end_screen?.cards?.map((c) => ({ id: c.id, path: c.path, canonical: c.canonical })) }, null, 2));
  writeFileSync(path.join(OUT, `${id}_timeline.json`), JSON.stringify(r.timeline, null, 2));
  writeFileSync(path.join(OUT, `${id}_derivative.json`), JSON.stringify(r.derivative, null, 2));

  // copy the OLD 4C.4 references
  const oldDeriv = path.join(OLD, "media", `${id}_VIDEO_SAFE_DERIVATIVE.png`);
  const oldVid = path.join(OLD, "media", `${id}_NEW_VIDEO.mp4`);
  if (existsSync(oldDeriv)) copyFileSync(oldDeriv, path.join(OUT, "media", `${id}_CURRENT_4C4_DERIVATIVE.png`));
  if (existsSync(oldVid)) copyFileSync(oldVid, path.join(OUT, "media", `${id}_CURRENT_4C4_VIDEO.mp4`));
  copyFileSync(masterPath, path.join(OUT, "media", `${id}_STATIC_MASTER.png`));

  if (RENDER && r.ok) {
    const mp4 = path.join(OUT, "media", `${id}_NEW_4C5_VIDEO.mp4`);
    const rr = await V.renderProfessionalSocialLoopToMp4(r, mp4, {
      endScreenPngPath: path.join(OUT, "media", `${id}_END_SCREEN.png`),
    }).catch((e) => ({ ok: false, reason: e.message }));
    if (rr.ok) {
      rec.render = { size_kb: Math.round(statSync(mp4).size / 1024), frames: rr.frames, duration_s: rr.probe?.duration_s ?? null };
      const newDeriv = path.join(OUT, "media", `${id}_NEW_4C5_DERIVATIVE.png`);
      const storyFrame = path.join(OUT, "media", `${id}_story_mid.png`);
      await frame(mp4, Math.max(0.5, (r.story_ms - 350) / 1000), newDeriv);
      await frame(mp4, (r.story_ms / 1000) * 0.5, storyFrame);
      const cts = (r.timeline.cta_content_start_ms) / 1000;
      await frame(mp4, cts + 0.2, path.join(OUT, "media", `${id}_CTA_FRAME_0_2.png`));
      await frame(mp4, cts + 1.0, path.join(OUT, "media", `${id}_CTA_FRAME_1_0.png`));
      await frame(mp4, cts + 2.2, path.join(OUT, "media", `${id}_CTA_FRAME_2_2.png`));
      await contactSheet(mp4, [0.0, 0.5, 1.5, 3.0, 5.0, cts + 1.2], path.join(OUT, "media", `${id}_FRAME_CONTACT_SHEET.png`));
      await mobilePreview(storyFrame, path.join(OUT, "media", `${id}_CTA_FRAME_1_0.png`), path.join(OUT, "media", `${id}_MOBILE_PREVIEW.png`));
    } else rec.render = { fail: rr.reason };
  }
  results[id] = rec;
  console.log(`  ${id}: ${r.state} | ${r.duration_ms}ms (story ${r.story_ms} + t${r.timeline?.transition_ms} + cta ${r.cta_ms}) | fits ${r.derivative?.fits} dens ${r.derivative?.density?.content_ratio} | events ${r.timeline?.events.filter((e) => e.kind !== "cta_transition").length} sal ${r.motion_salience?.score} | brand ${rec.professional_brand?.verdict}(${rec.professional_brand?.score}) | ctaHold ${r.cta_hold?.verdict}(${r.cta_hold?.hold_ms}ms)${rec.render ? ` | MP4 ${rec.render.size_kb ?? rec.render.fail}kb ${rec.render.duration_s ?? "?"}s` : ""}`);
}

// ---- cost report (§35) ----
const cost = {
  incremental_api_cost_usd_per_video: 0,
  optional_one_time_cta_background_asset: "one brand-asset generation only, GATED (SOCIAL_CTA_BRAND_ASSET_GENERATE), owner-review, max 2 candidates - NOT used in this proof",
  local: "derivative + atmosphere + motion + CTA + render are all local",
  projected_10_videos_usd: 0, projected_30_videos_usd: 0, projected_100_videos_usd: 0, projected_300_videos_usd: 0,
};
writeFileSync(path.join(OUT, "cost.json"), JSON.stringify(cost, null, 2));

const escp = (x) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rows = stories.map((s) => {
  const r = results[s.id] ?? {};
  const m = (n) => existsSync(path.join(OUT, "media", n)) ? n : null;
  const im = (n, w = 150) => m(n) ? `<img src="media/${n}" width="${w}">` : "&mdash;";
  const vid = (n) => m(n) ? `<video src="media/${n}" controls muted loop playsinline width="170"></video>` : "&mdash;";
  return `<tr>
    <td>${s.id}<br><small>${escp(s.family)} · ${r.duration_ms ?? "?"}ms</small><br>brand ${escp(r.professional_brand?.verdict ?? "-")} ${r.professional_brand?.score ?? ""}<br>ctaHold ${escp(r.cta_hold?.verdict ?? "-")} ${r.cta_hold?.hold_ms ?? ""}ms<br>dens ${r.frame_density?.content_ratio ?? "-"}<br>sal ${r.motion_salience?.score ?? "-"}</td>
    <td>STATIC MASTER<br>${im(`${s.id}_STATIC_MASTER.png`, 130)}</td>
    <td>4C.4 derivative<br>${im(`${s.id}_CURRENT_4C4_DERIVATIVE.png`)}<br>4C.4 video<br>${vid(`${s.id}_CURRENT_4C4_VIDEO.mp4`)}</td>
    <td><b>4C.5 derivative</b><br>${im(`${s.id}_NEW_4C5_DERIVATIVE.png`)}<br><b>4C.5 video</b><br>${vid(`${s.id}_NEW_4C5_VIDEO.mp4`)}</td>
    <td>CTA +0.2 / +1.0 / +2.2s<br>${im(`${s.id}_CTA_FRAME_0_2.png`, 96)} ${im(`${s.id}_CTA_FRAME_1_0.png`, 96)} ${im(`${s.id}_CTA_FRAME_2_2.png`, 96)}<br>mobile<br>${im(`${s.id}_MOBILE_PREVIEW.png`, 200)}<br>contact sheet<br>${im(`${s.id}_FRAME_CONTACT_SHEET.png`, 200)}</td>
  </tr>`;
}).join("");
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>4C.5 premium polish proof</title>
<style>body{font:13px system-ui;background:#0b0b0d;color:#eee;margin:20px;max-width:1600px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:7px;vertical-align:top}video,img{border:1px solid #333;border-radius:6px}</style>
<h1>SOCIAL-CREATIVE-4C.5 — premium trust-first polish &nbsp; <small>OLD 4C.4 vs NEW 4C.5</small></h1>
<p>generated ${new Date().toISOString()} · render <b>${RENDER ? "ON" : "OFF"}</b> · incremental API <b>$0</b> · DEAL_DROP excluded (fact drift, §38)</p>
<p>Fixes: CTA hold ~1.5s → <b>2.6s</b>; atmosphere layer (no dead black); framed panels + red rule + spotlighting; premium text FX + easing; staggered CTA card fan; hero URL field with a light sweep; 400ms story→CTA transition (no fade-to-black).</p>
<table><tr><th>story / audits</th><th>static</th><th>4C.4 (old)</th><th>4C.5 (new)</th><th>CTA frames / mobile</th></tr>${rows}</table>
<h2>Cost (§35)</h2><pre>${escp(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b> — not self-certified.</p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ render: RENDER, results, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`cost: incremental API $0/video | 10/30/100/300 = $0 | optional one-time CTA bg asset only`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);

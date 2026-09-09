#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4C.4 (§47, §48, §49) - PROFESSIONAL SOCIAL VIDEO proof.
//
//   node scripts/socialCreativeVideo1fPack.mjs            plan + audits, no render
//   node scripts/socialCreativeVideo1fPack.mjs --render    also render the 8-10s MP4s
//
// HARD COST RULE (§49): reuse the approved cached 5A.1 masters. NO AI art
// generation for the proof. The universal CTA end screen is built
// programmatically from the approved brand mark + REAL canonical card
// PNGs (the local card-art cache). Families:
//   A. ASKING_VS_SOLD   <- 5A.1 approved artifact (exact-value correct)
//   B. MARKET_SNAPSHOT  <- 5A.1 approved artifact (exact-value correct)
//   DEAL_DROP is EXCLUDED - the only cached master shows an old 45% for a
//   true 44% (§42 / §48 - withheld).
// Read-only DB. NOTHING published.

import { existsSync, mkdirSync, writeFileSync, copyFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const execFileP = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "video-1f-professional");
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

console.log(`=== SOCIAL-CREATIVE-4C.4  professional 8-10s social video proof ===`);
console.log(`render: ${RENDER ? "ON" : "OFF"}   (NO image generation - approved cached masters + REAL canonical cards only)\n`);

const MASTERS = {
  ASKING_VS_SOLD: ".social-preview/creative-5a1-final/full/A_asking_vs_sold.png",
  MARKET_SNAPSHOT: ".social-preview/creative-5a1-final/full/B_market_snapshot.png",
};

async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
// a local canonical card PNG for this id, or an evergreen fallback that exists
function localCard(id) {
  const p = path.join(CARD_CACHE, `${id}.jpg`);
  if (id && existsSync(p)) return p;
  for (const c of V.EVERGREEN_CTA_CARDS) { const q = path.join(CARD_CACHE, `${c.id}.jpg`); if (existsSync(q)) return q; }
  return null;
}
async function frame(mp4, at, out) {
  try { await execFileP(FFMPEG, ["-y", "-ss", String(at), "-i", mp4, "-frames:v", "1", out]); return existsSync(out); } catch { return false; }
}

const aRes = await MD.resolveAskingVsSold().catch((e) => ({ ok: false, reason: e.message }));
const mRes = await MD.resolveMarketShape().catch((e) => ({ ok: false, reason: e.message }));

const stories = [];
if (aRes?.ok) stories.push({
  id: "ASKING_VS_SOLD", family: "asking_vs_sold", series: "WHY_SOLD_PRICES_MATTER", resolved: aRes,
  facts: { card_name: aRes.data.card_name, card_set: aRes.data.card_set, card_tcgplayer_id: aRes.data.tcgplayerId, listed_price: aRes.data.asking_usd, market_price: aRes.data.market_ref_usd },
  heroId: aRes.data.tcgplayerId,
});
if (mRes?.ok) stories.push({
  id: "MARKET_SNAPSHOT", family: "market_shape", series: "MARKET_SNAPSHOT", resolved: mRes,
  facts: { tracked_count: mRes.data.priced_cards, percentages: [mRes.data.under_25_pct, mRes.data.over_100_pct], card_name: mRes.data.featured?.card_name },
  heroId: mRes.data.featured?.tcgplayerId,
});

console.log("DEAL_DROP: EXCLUDED from proof - the only cached master shows 45% for a true 44% (§42/§48 - withheld)\n");

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

  // §6/§18 seed the cache from the pre-approved, fact-clean 5A.1 artifact
  const reg = V.registerExistingMaster({ storyId: id, semanticHash, family, imagePath: masterPath, dir: CACHE, brandInMaster: true, verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", note: "5A.1 BUFFER_READY, semantic/fact-sources/fidelity/quality PASS" } });

  // §2 run the professional social loop
  const r = V.runProfessionalSocialLoop({
    story: { story_id: id }, semanticManifest: sem, factLock, captionHandoff: ch, family,
    cardImagePaths: heroCardPath ? [heroCardPath] : [],
    heroCardId: /^\d+$/.test(String(s.heroId ?? "")) ? String(s.heroId) : null,
    heroCardName: sem.card_identity?.name ?? null,
    cacheDir: CACHE, ctaCacheDir: CARD_CACHE,
  });

  const rec = {
    id, family,
    master: { sha: r.master?.image_sha256?.slice(0, 12), from_cache: r.master?.from_cache, dims: `${reg.image_w}x${reg.image_h}` },
    status: r.state, ok: r.ok, revised: r.revised,
    duration_ms: r.duration_ms, story_ms: r.story_ms, cta_ms: r.cta_ms,
    derivative: r.derivative ? {
      fits: r.derivative.fits, blocks: r.derivative.blocks.map((b) => `${b.id}:${b.role}:${b.font ?? "-"}px`),
      removed: r.derivative.removed, dropped_from_master: r.derivative.dropped_from_master, shown_numbers: r.derivative.shown_numbers,
    } : null,
    timeline: r.timeline ? r.timeline.events.map((e) => `${e.id}:${e.kind}@${e.at_ms}-${e.end_ms}`) : null,
    end_screen: r.end_screen ? {
      cards: r.end_screen.cards.map((c) => `${c.id}${c.decorative ? "(evergreen)" : "(hero)"}`),
      value_points: r.end_screen.value_points, primary_cta: r.end_screen.primary_cta, domain: r.end_screen.domain,
      duration_ms: r.end_screen.duration_ms, background: r.end_screen.background?.kind,
    } : null,
    qa: r.qa?.verification ?? null,
    professional_brand: r.professional_brand ? { verdict: r.professional_brand.verdict, score: r.professional_brand.score, reasons: r.professional_brand.reasons } : null,
    cta_audit: r.cta_audit, fact_audit: r.fact_audit, motion_salience: r.motion_salience,
    caption_link: r.caption_link, dedupe_key: r.dedupe_key, poster_from: r.poster_from, cost: r.cost,
  };

  writeFileSync(path.join(OUT, `${id}_safe_zone_audit.json`), JSON.stringify({ safe_zone: r.safe_zone_audit, cutoff: r.cutoff_audit, centre_safe: r.derivative?.centre_safe, overflow: r.derivative?.overflow, blocks: r.derivative?.blocks?.map((b) => ({ id: b.id, zone: b.zone, inside: b.fully_inside_safe })) }, null, 2));
  writeFileSync(path.join(OUT, `${id}_cutoff_audit.json`), JSON.stringify({ cutoff_safe_zone: r.qa?.verification?.cutoff_safe_zone, fits: r.derivative?.fits, removed: r.derivative?.removed, findings: (r.qa?.findings ?? []) }, null, 2));
  writeFileSync(path.join(OUT, `${id}_mobile_readability.json`), JSON.stringify({ verdict: r.mobile_readability, fonts: r.derivative?.blocks?.map((b) => ({ id: b.id, role: b.role, font: b.font ?? null })) }, null, 2));
  writeFileSync(path.join(OUT, `${id}_motion_salience.json`), JSON.stringify({ ...r.motion_salience, events: r.timeline?.events, whole_image_push: r.timeline?.whole_image_push, camera: r.timeline?.camera }, null, 2));
  writeFileSync(path.join(OUT, `${id}_content_comprehension.json`), JSON.stringify({ verdict: r.comprehension, gist: r.derivative?.comprehension_line, priority1: r.derivative?.priority1_ids }, null, 2));
  writeFileSync(path.join(OUT, `${id}_professional_brand_audit.json`), JSON.stringify({ ...(r.professional_brand ?? {}), sub: r.qa?.sub, verification: r.qa?.verification }, null, 2));
  writeFileSync(path.join(OUT, `${id}_cta_audit.json`), JSON.stringify({ ...r.cta_audit, end_screen: r.end_screen }, null, 2));
  writeFileSync(path.join(OUT, `${id}_fact_audit.json`), JSON.stringify(r.fact_audit, null, 2));
  writeFileSync(path.join(OUT, `${id}_timeline.json`), JSON.stringify(r.timeline, null, 2));
  writeFileSync(path.join(OUT, `${id}_derivative.json`), JSON.stringify(r.derivative, null, 2));

  if (RENDER && r.ok) {
    const mp4 = path.join(OUT, "media", `${id}_NEW_VIDEO.mp4`);
    const poster = path.join(OUT, "media", `${id}_STATIC_MASTER.png`);
    const rr = await V.renderProfessionalSocialLoopToMp4(r, mp4, {
      posterPath: null, endScreenPngPath: path.join(OUT, "media", `${id}_END_SCREEN.png`),
    }).catch((e) => ({ ok: false, reason: e.message }));
    // §47 - the approved static master, verbatim, kept alongside
    copyFileSync(masterPath, poster);
    if (rr.ok) {
      rec.render = { size_kb: Math.round(statSync(mp4).size / 1024), frames: rr.frames, duration_s: rr.probe?.duration_s ?? null };
      // the complete video-safe composition, every block revealed, just before the CTA cross-dissolve (§47)
      await frame(mp4, Math.max(0.5, (r.story_ms - 350) / 1000), path.join(OUT, "media", `${id}_VIDEO_SAFE_DERIVATIVE.png`));
      await frame(mp4, (r.story_ms / 1000) * 0.55, path.join(OUT, "media", `${id}_story_mid.png`));
    } else rec.render = { fail: rr.reason };
  }
  results[id] = rec;
  console.log(`  ${id}: ${r.state} | ${r.duration_ms}ms (story ${r.story_ms} + cta ${r.cta_ms}) | fits ${r.derivative?.fits} | events ${r.timeline?.events.filter((e) => e.kind !== "cta_transition").length} | brand ${rec.professional_brand?.verdict}(${rec.professional_brand?.score}) | cta ${r.cta_audit?.website_first}/${r.cta_audit?.purpose}${rec.render ? ` | MP4 ${rec.render.size_kb ?? rec.render.fail}kb ${rec.render.duration_s ?? "?"}s` : ""}`);
}

// ---- UNIVERSAL_CTA_END_SCREEN.png (the reusable brand signature) -------
// Built programmatically from the approved brand mark + 3 REAL canonical
// evergreen cards. $0. The full 1080x1920 still comes from a rendered
// story's END_SCREEN frame (the exact same programmatic system); the JSON
// is the family-neutral spec.
try {
  const es = V.buildUniversalCtaEndScreen({ family: "deal_hero", heroCardId: null, cacheDir: CARD_CACHE });
  writeFileSync(path.join(OUT, "UNIVERSAL_CTA_END_SCREEN.json"), JSON.stringify(es.end_screen ?? es, null, 2));
  const src = ["ASKING_VS_SOLD", "MARKET_SNAPSHOT"].map((id) => path.join(OUT, "media", `${id}_END_SCREEN.png`)).find((p) => existsSync(p));
  if (src) copyFileSync(src, path.join(OUT, "media", "UNIVERSAL_CTA_END_SCREEN.png"));
} catch (e) { console.log(`  universal CTA still: ${e.message}`); }

// ---- cost report (§45) -----------------------------------------------
const cost = {
  incremental_api_cost_usd: 0,
  cta_end_screen_cost_usd: 0,
  local_render_cost_usd: 0,
  note: "the story master is the existing shared 5A.1 artifact ($0 here); the universal CTA end screen is built from the approved brand mark + REAL canonical card PNGs (no AI). Derivative, animation and rendering are all local.",
  projected_10_videos_usd: 0,
  projected_30_videos_usd: 0,
  projected_100_videos_usd: 0,
  projected_300_videos_usd: 0,
};
writeFileSync(path.join(OUT, "cost.json"), JSON.stringify(cost, null, 2));

const escp = (x) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rows = stories.map((s) => {
  const r = results[s.id] ?? {};
  const m = (n) => existsSync(path.join(OUT, "media", n)) ? n : null;
  const im = (n, w = 190) => m(n) ? `<img src="media/${n}" width="${w}">` : "&mdash;";
  const vid = m(`${s.id}_NEW_VIDEO.mp4`) ? `<video src="media/${s.id}_NEW_VIDEO.mp4" controls muted loop playsinline width="200"></video>` : "&mdash;";
  return `<tr><td>${s.id}<br><small>${escp(s.family)} · ${r.duration_ms ?? "?"}ms</small><br>brand ${escp(r.professional_brand?.verdict ?? "-")} ${r.professional_brand?.score ?? ""}<br>cta ${escp(r.cta_audit?.website_first ?? "-")}/${escp(r.cta_audit?.purpose ?? "-")}<br>$0</td>
    <td>STATIC MASTER<br>${im(`${s.id}_STATIC_MASTER.png`, 170)}</td>
    <td>VIDEO-SAFE DERIVATIVE<br>${im(`${s.id}_VIDEO_SAFE_DERIVATIVE.png`)}</td>
    <td>PROFESSIONAL VIDEO<br>${vid}</td>
    <td>UNIVERSAL CTA END SCREEN<br>${im(`${s.id}_END_SCREEN.png`)}</td></tr>`;
}).join("");
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>4C.4 professional social video proof</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:24px;max-width:1400px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px;vertical-align:top}video,img{border:1px solid #333;border-radius:6px}</style>
<h1>SOCIAL-CREATIVE-4C.4 — static master → video-safe derivative → professional 8-10s video → universal CTA end screen</h1>
<p>generated ${new Date().toISOString()} &nbsp; render: <b>${RENDER ? "ON" : "OFF"}</b> &nbsp; image generation: <b>$0</b> (approved cached master + REAL canonical cards)</p>
<p>DEAL_DROP excluded — its only cached master shows an old 45% for a true 44% (§42/§48).</p>
<table><tr><th>story</th><th>static</th><th>derivative</th><th>video</th><th>end screen</th></tr>${rows}</table>
<p>Per story: <code>_safe_zone_audit.json</code> · <code>_cutoff_audit.json</code> · <code>_mobile_readability.json</code> · <code>_motion_salience.json</code> · <code>_content_comprehension.json</code> · <code>_professional_brand_audit.json</code> · <code>_cta_audit.json</code> · <code>_fact_audit.json</code></p>
<p>Standalone: <code>media/UNIVERSAL_CTA_END_SCREEN.png</code> · <code>UNIVERSAL_CTA_END_SCREEN.json</code></p>
<h2>Cost (§45)</h2><pre>${escp(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b> — not self-certified.</p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ render: RENDER, results, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`cost: incremental API $0 | per 10/30/100/300 videos $0 (local render only)`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);

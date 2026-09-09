#!/usr/bin/env node
// Phase SOCIAL-AUTOPILOT-1 (§25) - DAILY STORY ENGINE DRY-RUN PROOF.
//
//   node scripts/socialAutopilot1Pack.mjs                 baseline (no generation, $0)
//   node scripts/socialAutopilot1Pack.mjs --seed-cache     also pre-seed a $0 cache hit
//                                                            for the two strongest
//                                                            single-card families so
//                                                            the full pipeline (creative
//                                                            -> caption -> video -> QA ->
//                                                            buffer dry-run) is
//                                                            demonstrated end to end
//
// Runs against the REAL current database (no fixtures). NOTHING is
// published, queued live, or scheduled - runSocialAutopilot()/
// bufferHandoff.mjs have no code path that reaches a real Buffer call.
// MANUAL_REVIEW mode only.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const SEED_CACHE = process.argv.slice(2).includes("--seed-cache");
const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-autopilot-1");
const CARD_CACHE = path.join(ROOT, ".social-preview", "card-art-cache");

const { runSocialAutopilot, resolvedShapeFor } = await import("../lib/autonomous/socialStoryEngine.mjs");
const { discoverCandidates } = await import("../lib/autonomous/storyDiscovery.mjs");
const { buildStorySnapshot } = await import("../lib/autonomous/storySnapshot.mjs");
const { makeStoryPackage } = await import("../lib/autonomous/storyPackage.mjs");
const { computeCreativeCacheKey } = await import("../lib/autonomous/creativeStage.mjs");
const { registerExistingMaster } = await import("../lib/newsroom/video/masterCreativeCache.mjs");
const { storyId: computeStoryId } = await import("../lib/social/newsroom/story.mjs");
const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "stories"), { recursive: true });

console.log("=== SOCIAL-AUTOPILOT-1  daily story engine dry-run proof ===");
console.log(`seed-cache: ${SEED_CACHE ? "ON (2 families get a $0 cache-seeded full run)" : "OFF (pure baseline - every family evaluated honestly, $0)"}\n`);

// ONE timestamp for the whole proof run. The seed step and the real
// orchestrator run both call discoverCandidates() independently (they are
// two separate invocations) - passing the SAME `now` through both keeps
// data_freshness.captured_at (and therefore the deterministic story_id
// and the creative cache key, both of which hash over it) identical
// between them, so the cache actually hits. Without this, two discovery
// calls a few milliseconds apart mint two different story ids for the
// same live deal purely from the timestamp - a real idempotency edge this
// proof surfaced and works around explicitly rather than silently.
const NOW = Date.now();

const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}

// §7/§8 - seed the exact-key cache for the two strongest single-card
// families using the ALREADY-APPROVED 5A.1 static masters (the same
// owner-approved artifacts the 4C.7 proof used) rather than spending a
// fresh OpenAI call. This demonstrates the "generate once, reuse
// everywhere" cache-hit path truthfully at $0 - it is NOT a fabricated
// pass, the images ARE the real owner-approved masters, just re-keyed to
// today's live snapshot hash (the same story, resolved fresh today).
async function seedCacheFor(candidate, imagePath) {
  if (!existsSync(imagePath)) return { seeded: false, reason: `${imagePath} not found - run the 4C.7 pack first` };
  const storyId = computeStoryId({ series: candidate.series, subjectType: "card_or_aggregate", subjectId: (candidate.facts.canonical_card_ids ?? [])[0] ?? candidate.family, capturedAt: candidate.facts.data_freshness.captured_at, factsJson: candidate.facts });
  let pkg = makeStoryPackage({ storyId, family: candidate.family, series: candidate.series, editorialAngle: candidate.editorialAngle, bucket: candidate.bucket, now: NOW });
  pkg.snapshot = buildStorySnapshot({ storyId, storyFamily: candidate.family, editorialAngle: candidate.editorialAngle, facts: candidate.facts, now: NOW });
  const heroId = (candidate.facts.canonical_card_ids ?? [])[0];
  const row = heroId ? await catalogRow(heroId) : null;
  const resolved = resolvedShapeFor(candidate);
  const keys = computeCreativeCacheKey(pkg, { resolved, cardCatalogRow: row });
  if (!keys) return { seeded: false, reason: "no cache key (unknown family contract)" };
  registerExistingMaster({
    storyId, semanticHash: keys.cacheKey, family: candidate.family, imagePath,
    cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: imagePath },
    brandInMaster: true, source: "autopilot1_seeded_from_approved_5a1_master",
  });
  return { seeded: true, storyId, cacheKey: keys.cacheKey, heroId, cardCatalogRow: row };
}

if (SEED_CACHE) {
  const { candidates } = await discoverCandidates({ now: NOW });
  const ask = candidates.find((c) => c.family === "asking_vs_sold");
  const mkt = candidates.find((c) => c.family === "market_snapshot");
  const heroFor = async (c) => {
    if (!c) return null;
    const id = (c.facts.canonical_card_ids ?? [])[0];
    if (!id) return null;
    const p = path.join(CARD_CACHE, `${id}.jpg`);
    if (existsSync(p)) return p;
    return null;
  };
  const askImg = ".social-preview/creative-5a1-final/full/A_asking_vs_sold.png";
  const mktImg = ".social-preview/creative-5a1-final/full/B_market_snapshot.png";
  if (ask) console.log("  seed asking_vs_sold:", JSON.stringify(await seedCacheFor(ask, askImg)));
  if (mkt) console.log("  seed market_snapshot:", JSON.stringify(await seedCacheFor(mkt, mktImg)));
  console.log();
  // ensure card art is present for caption/video stages (reuse the
  // existing card-art cache; download once if missing - $0 for a cached hit)
  for (const c of [ask, mkt].filter(Boolean)) {
    const id = (c.facts.canonical_card_ids ?? [])[0];
    if (!id) continue;
    const p = path.join(CARD_CACHE, `${id}.jpg`);
    if (!existsSync(p)) {
      const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
      const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");
      const row = await catalogRow(id);
      await resolveCardArtwork({ card_tcgplayer_id: String(id), card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null }, { rightsState: RIGHTS_STATE, catalogRow: row ?? null }).catch(() => null);
    }
  }
}

// ---- the real run --------------------------------------------------
const res = await runSocialAutopilot({ allowGenerate: false, persist: false, maxSelected: 6, revalidateStale: true, now: NOW });

writeFileSync(path.join(OUT, "run_summary.json"), JSON.stringify({ ok: res.ok, mode: res.mode, readiness: res.readiness, reconciliation: res.reconciliation, calendar: res.calendar, digest: res.digest }, null, 2));
writeFileSync(path.join(OUT, "candidate_ranking.json"), JSON.stringify(res.evaluated, null, 2));
writeFileSync(path.join(OUT, "content_calendar.json"), JSON.stringify({ lookback_rows: res.calendar.lookback, diversity_rejected: res.diversity_rejected }, null, 2));
writeFileSync(path.join(OUT, "selected_stories.json"), JSON.stringify(res.selected.map((p) => ({ story_id: p.story_id, family: p.family, status: p.status })), null, 2));

for (const pkg of res.selected) {
  const dir = path.join(OUT, "stories", pkg.story_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "snapshot.json"), JSON.stringify(pkg.snapshot, null, 2));
  writeFileSync(path.join(dir, "editorial.json"), JSON.stringify({ family: pkg.family, series: pkg.series, editorial_angle: pkg.editorial_angle, bucket: pkg.bucket, scoring: pkg.scoring, diversity: pkg.diversity, status: pkg.status, status_history: pkg.status_history }, null, 2));
  writeFileSync(path.join(dir, "fact_trace.json"), JSON.stringify(pkg.snapshot?.fact_trace ?? [], null, 2));
  writeFileSync(path.join(dir, "creative.json"), JSON.stringify(pkg.creative ? { source: pkg.creative.source, cost_usd: pkg.creative.cost_usd, master_image_path: pkg.creative.master_image_path, master_image_sha256: pkg.creative.master_image_sha256 } : null, null, 2));
  writeFileSync(path.join(dir, "captions.json"), JSON.stringify(pkg.captions ?? null, null, 2));
  writeFileSync(path.join(dir, "video.json"), JSON.stringify(pkg.video ?? { applicable: false }, null, 2));
  writeFileSync(path.join(dir, "platform_eligibility.json"), JSON.stringify(pkg.platform_variants ?? null, null, 2));
  writeFileSync(path.join(dir, "qa.json"), JSON.stringify(pkg.qa ?? null, null, 2));
  writeFileSync(path.join(dir, "buffer_handoff.json"), JSON.stringify(pkg.publishing ?? null, null, 2));
  writeFileSync(path.join(dir, "seo_handoff.json"), JSON.stringify(pkg.seo_handoff ?? null, null, 2));
  writeFileSync(path.join(dir, "reddit_handoff.json"), JSON.stringify(pkg.reddit_handoff ?? null, null, 2));
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const rows = res.selected.map((p) => `
  <tr>
    <td>${esc(p.story_id)}</td><td>${esc(p.family)}</td>
    <td><b>${esc(p.status)}</b></td>
    <td>${esc(p.creative?.source ?? "-")}</td>
    <td>$${(p.creative?.cost_usd ?? 0).toFixed(2)}</td>
    <td>${p.captions ? "ready" : "-"}</td>
    <td>${p.video?.ok ? "ready" : p.video === null ? "n/a" : "held"}</td>
    <td>${Object.entries(p.platform_variants ?? {}).filter(([, v]) => v.eligible).map(([k]) => k).join(", ") || "-"}</td>
    <td>${p.publishing?.placements?.length ?? 0}</td>
  </tr>`).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-AUTOPILOT-1 dry-run</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px 10px;font-size:13px}
th{background:#1a1a1f;text-align:left}h1{color:#e8493d}code{background:#1a1a1f;padding:2px 6px;border-radius:4px}
.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px}</style>
</head><body>
<h1>SOCIAL-AUTOPILOT-1 - Daily Story Engine Dry-Run</h1>
<p>${esc(res.digest.headline)}</p>
<div class="pill">Candidates discovered: ${res.discovery.discovered}</div>
<div class="pill">Selected: ${res.selected.length}</div>
<div class="pill">API spend: $${res.digest.api_spend_usd.toFixed(2)}</div>
<div class="pill">Masters reused: ${res.digest.master_reused}</div>
<div class="pill">Masters generated: ${res.digest.master_generated}</div>
<div class="pill">Buffer placements (SIMULATED - nothing sent): ${res.digest.buffer_placements_queued}</div>
<div class="pill"><b>Readiness: ${esc(res.readiness)}</b></div>
<h2>Selected stories</h2>
<table><tr><th>story_id</th><th>family</th><th>status</th><th>creative</th><th>cost</th><th>captions</th><th>video</th><th>eligible platforms</th><th>placements</th></tr>${rows}</table>
<h2>Candidate ranking (all ${res.evaluated.length} that cleared diversity + quality floor)</h2>
<table><tr><th>family</th><th>score</th><th>why</th></tr>${res.evaluated.map((c) => `<tr><td>${esc(c.family)}</td><td>${c.score.toFixed(3)}</td><td>${esc(c.why.join(", "))}</td></tr>`).join("")}</table>
<h2>Rejected at discovery</h2>
<table><tr><th>family</th><th>reason</th><th>detail</th></tr>${res.discovery.rejected.map((r) => `<tr><td>${esc(r.family)}</td><td>${esc(r.reason)}</td><td>${esc(r.detail)}</td></tr>`).join("") || "<tr><td colspan=3>none</td></tr>"}</table>
<h2>Rejected for diversity / quality floor</h2>
<table><tr><th>family</th><th>reasons</th></tr>${res.diversity_rejected.map((r) => `<tr><td>${esc(r.family)}</td><td>${esc(r.reasons.join("; "))}</td></tr>`).join("") || "<tr><td colspan=2>none</td></tr>"}</table>
<p style="color:#888;margin-top:32px">MANUAL_REVIEW mode. Nothing published, nothing scheduled, no real Buffer call made. Per-story detail JSON is under <code>stories/&lt;story_id&gt;/</code>.</p>
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`  discovered ${res.discovery.discovered} candidates | evaluated ${res.evaluated.length} | selected ${res.selected.length}`);
for (const p of res.selected) console.log(`    ${p.family.padEnd(18)} ${p.status.padEnd(14)} creative=${p.creative?.source ?? "-"} cost=$${(p.creative?.cost_usd ?? 0).toFixed(2)} platforms=${Object.entries(p.platform_variants ?? {}).filter(([, v]) => v.eligible).map(([k]) => k).join(",") || "-"}`);
console.log(`\ncost: $${res.digest.api_spend_usd.toFixed(2)} this run`);
console.log(`Wrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`READINESS: ${res.readiness}`);

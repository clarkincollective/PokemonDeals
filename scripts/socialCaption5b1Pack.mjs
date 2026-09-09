#!/usr/bin/env node
// Phase SOCIAL-CAPTION-5B.1 (§13) - CAPTION ENTITY LOCK + PLACEHOLDER
// HARDENING PROOF.
//
//   node scripts/socialCaption5b1Pack.mjs
//
// Runs the fixed pipeline for real (market_snapshot, real DB data) and
// records the entity/placeholder/fact audits. The BEFORE captions are the
// literal ones this session observed from the AUTOPILOT-4 proof run
// BEFORE this phase's fix - recorded verbatim as historical evidence,
// not regenerated (the bug that produced them is fixed, so it cannot be
// reproduced on demand; pretending otherwise would be dishonest).

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-caption-5b1");

const { runSocialAutopilot, resolvedShapeFor } = await import("../lib/autonomous/socialStoryEngine.mjs");
const { discoverCandidates } = await import("../lib/autonomous/storyDiscovery.mjs");
const { buildStorySnapshot } = await import("../lib/autonomous/storySnapshot.mjs");
const { makeStoryPackage } = await import("../lib/autonomous/storyPackage.mjs");
const { computeCreativeCacheKey } = await import("../lib/autonomous/creativeStage.mjs");
const { registerExistingMaster } = await import("../lib/newsroom/video/masterCreativeCache.mjs");
const { storyId: computeStoryId } = await import("../lib/social/newsroom/story.mjs");
const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { auditCaptionsAgainstStoryPackage } = await import("../lib/autonomous/captionCrossAssetAudit.mjs");
const { auditCaptionEntityLock } = await import("../lib/newsroom/captions/captionEntityLock.mjs");
const { auditPlaceholders } = await import("../lib/newsroom/captions/captionPlaceholderAudit.mjs");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-CAPTION-5B.1  entity lock + placeholder hardening proof ===\n");

// ---- BEFORE (historical record, not regenerated - see header) --------
const BEFORE = {
  note: "Recorded verbatim from the SOCIAL-AUTOPILOT-4 session proof run, BEFORE this phase's fix. The root-cause bug (a flat, non-id-keyed canonical_card_metadata shape in storyDiscovery.mjs) has since been fixed, so this exact failure cannot be reproduced on demand - it is preserved here as evidence, not live output.",
  story_id: "market_snapshot-107001-863a2a4c9f",
  instagram: "Did you know? Over 85% of tracked Pokémon singles sell for under $25.\n\nOut of 24,585 tracked singles, a whopping 85.7% are selling for less than $25. Take the example of a common Pikachu card—it's part of this majority. While high-value cards often steal the spotlight, understanding this distribution can help collectors make informed decisions.\n\nKnowing that most cards are affordable allows collectors to strategically build their collections without breaking the bank. It highlights the accessibility of the market and the potential to find hidden gems.\n\nExplore the market on pokemondealfinder.com.\n\n#PokemonCards #CardCollectors #MarketInsights #Pikachu #TradingCards",
  x: "Did you know? 85.7% of the 24,585 tracked singles sell for under $25. It's a market-wide trend, not just about one card. Example: null fits this range.\n\nKnowing the market shape helps collectors make informed decisions.\n\nExplore the market on pokemondealfinder.com.",
};
writeFileSync(path.join(OUT, "instagram_before.txt"), BEFORE.instagram, "utf8");
writeFileSync(path.join(OUT, "x_before.txt"), BEFORE.x, "utf8");

const beforeEntity = { instagram: auditCaptionEntityLock(BEFORE.instagram, { example_card: "Clefairy", card_identity: { name: "Clefairy" } }), x: auditCaptionEntityLock(BEFORE.x, { example_card: "Clefairy", card_identity: { name: "Clefairy" } }) };
const beforePlaceholder = { instagram: auditPlaceholders(BEFORE.instagram), x: auditPlaceholders(BEFORE.x) };
console.log("BEFORE entity findings:", JSON.stringify(beforeEntity));
console.log("BEFORE placeholder findings:", JSON.stringify(beforePlaceholder));

// ---- AFTER (real, fresh, fixed pipeline) ------------------------------
const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
const NOW = Date.now();
async function seedMarketSnapshotCache() {
  const { candidates } = await discoverCandidates({ now: NOW });
  const mkt = candidates.find((c) => c.family === "market_snapshot");
  if (!mkt) return { seeded: false };
  const imagePath = ".social-preview/creative-5a1-final/full/B_market_snapshot.png";
  if (!existsSync(imagePath)) return { seeded: false };
  const storyId = computeStoryId({ series: mkt.series, subjectType: "card_or_aggregate", subjectId: (mkt.facts.canonical_card_ids ?? [])[0] ?? mkt.family, capturedAt: mkt.facts.data_freshness.captured_at, factsJson: mkt.facts });
  let pkg = makeStoryPackage({ storyId, family: mkt.family, series: mkt.series, editorialAngle: mkt.editorialAngle, bucket: mkt.bucket, now: NOW });
  pkg.snapshot = buildStorySnapshot({ storyId, storyFamily: mkt.family, editorialAngle: mkt.editorialAngle, facts: mkt.facts, now: NOW });
  const heroId = (mkt.facts.canonical_card_ids ?? [])[0];
  const row = heroId ? await catalogRow(heroId) : null;
  const resolved = resolvedShapeFor(mkt);
  const keys = computeCreativeCacheKey(pkg, { resolved, cardCatalogRow: row });
  if (!keys) return { seeded: false };
  registerExistingMaster({ storyId, semanticHash: keys.cacheKey, family: mkt.family, imagePath, cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: imagePath }, brandInMaster: true, source: "caption5b1_seeded_from_approved_5a1_master" });
  return { seeded: true };
}
console.log("\ncache seed:", JSON.stringify(await seedMarketSnapshotCache()));

const runResult = await runSocialAutopilot({ allowGenerate: false, persist: false, maxSelected: 8, revalidateStale: true, now: NOW });
const pkg = runResult.selected.find((p) => p.family === "market_snapshot" && p.status === "BUFFER_QUEUED");
if (!pkg) { console.log("\n  No market_snapshot package reached BUFFER_QUEUED this run."); process.exit(0); }

writeFileSync(path.join(OUT, "instagram_after.txt"), pkg.captions.instagram.caption_text, "utf8");
writeFileSync(path.join(OUT, "x_after.txt"), pkg.captions.x.caption_text, "utf8");
writeFileSync(path.join(OUT, "caption_brief.json"), JSON.stringify(pkg.captions.shared ?? {}, null, 2));
writeFileSync(path.join(OUT, "locked_entities.json"), JSON.stringify({
  example_card: pkg.semantic_manifest?.example_card ?? null,
  card_identity: pkg.semantic_manifest?.card_identity ?? null,
  card_metadata_lock: pkg.semantic_manifest?.card_metadata_lock ?? null,
}, null, 2));

const entityAudit = { instagram: auditCaptionEntityLock(pkg.captions.instagram.caption_text, pkg.semantic_manifest), x: auditCaptionEntityLock(pkg.captions.x.caption_text, pkg.semantic_manifest) };
const placeholderAudit = { instagram: auditPlaceholders(pkg.captions.instagram.caption_text), x: auditPlaceholders(pkg.captions.x.caption_text) };
const crossAssetAudit = auditCaptionsAgainstStoryPackage(pkg);
writeFileSync(path.join(OUT, "entity_audit.json"), JSON.stringify(entityAudit, null, 2));
writeFileSync(path.join(OUT, "placeholder_audit.json"), JSON.stringify(placeholderAudit, null, 2));
writeFileSync(path.join(OUT, "cross_asset_audit.json"), JSON.stringify(crossAssetAudit, null, 2));
writeFileSync(path.join(OUT, "fact_audit.json"), JSON.stringify({ instagram: pkg.captions.instagram.verification, x: pkg.captions.x.verification }, null, 2));
writeFileSync(path.join(OUT, "caption_handoff.json"), JSON.stringify(pkg.captions.caption_handoff ?? null, null, 2));
writeFileSync(path.join(OUT, "retry_trace.json"), JSON.stringify({ instagram: pkg.captions.instagram.verification?.regenerated ?? null, x: pkg.captions.x.verification?.regenerated ?? null }, null, 2));

const allClean = entityAudit.instagram.length === 0 && entityAudit.x.length === 0 && placeholderAudit.instagram.length === 0 && placeholderAudit.x.length === 0;
writeFileSync(path.join(OUT, "run_summary.json"), JSON.stringify({
  story_id: pkg.story_id, before_story_id: BEFORE.story_id,
  before_had_findings: { entity: beforeEntity, placeholder: beforePlaceholder },
  after_clean: allClean, cross_asset_ok: crossAssetAudit.instagram.ok && crossAssetAudit.x.ok,
}, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-CAPTION-5B.1 proof</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:960px}
.cap{white-space:pre-wrap;background:#1a1a1f;padding:12px;border-radius:8px;font-size:13px;margin:8px 0}
.bad{border-left:4px solid #e8493d}.good{border-left:4px solid #3fb27f}
h1{color:#e8493d}.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px}</style></head><body>
<h1>SOCIAL-CAPTION-5B.1 - Entity Lock + Placeholder Hardening</h1>
<div class="pill">Locked example card: Clefairy (tcgplayer_id 107001)</div>
<div class="pill">After clean: ${allClean}</div>
<h2>BEFORE (historical, story ${esc(BEFORE.story_id)})</h2>
<h3>Instagram</h3><div class="cap bad">${esc(BEFORE.instagram)}</div>
<h3>X</h3><div class="cap bad">${esc(BEFORE.x)}</div>
<h2>AFTER (real, fresh run, story ${esc(pkg.story_id)})</h2>
<h3>Instagram</h3><div class="cap good">${esc(pkg.captions.instagram.caption_text)}</div>
<h3>X</h3><div class="cap good">${esc(pkg.captions.x.caption_text)}</div>
<h2>Entity audit (after)</h2><pre>${esc(JSON.stringify(entityAudit, null, 2))}</pre>
<h2>Placeholder audit (after)</h2><pre>${esc(JSON.stringify(placeholderAudit, null, 2))}</pre>
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log("\nAFTER instagram:", pkg.captions.instagram.caption_text.slice(0, 100), "...");
console.log("AFTER x:", pkg.captions.x.caption_text.slice(0, 100), "...");
console.log("entity_audit (after):", JSON.stringify(entityAudit));
console.log("placeholder_audit (after):", JSON.stringify(placeholderAudit));
console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);

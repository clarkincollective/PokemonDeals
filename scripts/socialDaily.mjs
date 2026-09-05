#!/usr/bin/env node
// Phase 13E.1 - the DAILY SOCIAL CONTENT PRODUCTION WORKFLOW.
//
//   npm run social:daily                 generate today's review queue
//   npm run social:daily -- record <family> [<family> ...]
//                                        after you MANUALLY publish a post,
//                                        record it so cooldowns advance
//
// `social:daily` does exactly this and nothing else:
//   1. read the current eligible deal pool (database only - NO eBay call,
//      NO PokemonPriceTracker API call; one Supabase read for the run)
//   2. rank candidates with the EXISTING flagship ranking / eligibility
//      gates (lib/social/candidates.mjs, lib/social/eligibility.mjs -
//      unchanged truth contracts)
//   3. apply the rights/compliance gate (lib/social/rights.mjs)
//   4. apply deterministic cooldowns (lib/social/cooldown.mjs) against the
//      local post-history file
//   5. choose the daily mix - at most one of each family, 3-5 posts,
//      FEWER when inventory is thin (never fabricated to hit a quota)
//   6. render Mode-B 1080x1350 PNG creatives (one reused Chrome session)
//   7. assemble deterministic Instagram + TikTok captions + a small
//      hashtag set
//   8. build the local review gallery
//   9. print its path
//
// It CANNOT publish anything. There is no Instagram/TikTok/Buffer/Meta
// API client imported anywhere in this file or in lib/social/. "Approve"
// in the gallery is local browser state only.

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { fetchActiveDealPool } from "../lib/social/db.mjs";
import { buildDailyBatch, DAILY_FAMILIES } from "../lib/social/dailyMix.mjs";
import { assemblePlatformCaptions } from "../lib/social/caption.mjs";
import { buildHashtags } from "../lib/social/hashtags.mjs";
import { buildSlideContent, renderHtml } from "../lib/social/templates.mjs";
import { createRenderer } from "../lib/social/render.mjs";
import { buildReviewChecklist, formatReviewSummary } from "../lib/social/reviewSummary.mjs";
import { buildDailyGalleryHtml } from "../lib/social/gallery.mjs";
import { loadPostHistory, savePostHistory, buildCooldownKeys } from "../lib/social/cooldown.mjs";
// Phase 13E.2 - approved generated-background support. This import chain
// touches NO network and NO OpenAI: assets.mjs only reads the local
// manifest + PNG files that `npm run social:assets` produced and a human
// approved earlier. `social:daily` makes zero image-generation calls.
import { loadAssetManifest, resolveBackgroundForPost } from "../lib/social/assets.mjs";

const OUT_ROOT = path.join(process.cwd(), ".social-preview");
const DAILY_DIR = path.join(OUT_ROOT, "daily");

async function renderCandidate(entry, renderer, assetManifest) {
  const outDir = path.join(DAILY_DIR, entry.family);
  mkdirSync(outDir, { recursive: true });
  const slide = buildSlideContent(entry.payload);

  // Version A: the current deterministic Mode-B creative (unchanged).
  const pngFiles = [];
  for (const variant of ["A", "B"]) {
    const p = path.join(outDir, `creative-${variant}.png`);
    await renderer.renderToPng(renderHtml(slide, { variant }), p);
    pngFiles.push(path.relative(OUT_ROOT, p).replace(/\\/g, "/"));
  }

  // Version B: the SAME deterministic overlay over an approved, evergreen,
  // data-free generated background - ONLY if one is approved & on disk
  // for this family. No approved asset -> nothing extra, Mode B stands
  // (SS15 fallback). The background image never carried any real fact.
  let enhanced = null;
  const bg = assetManifest ? resolveBackgroundForPost(entry.payload, { manifest: assetManifest }) : null;
  if (bg && existsSync(bg.absFile)) {
    const files = [];
    for (const variant of ["A", "B"]) {
      const p = path.join(outDir, `creative-enhanced-${variant}.png`);
      await renderer.renderToPng(renderHtml(slide, { variant, background: bg }), p);
      files.push(path.relative(OUT_ROOT, p).replace(/\\/g, "/"));
    }
    enhanced = { assetId: bg.assetId, category: bg.category, style: bg.style, zone: bg.zone, sourceFile: bg.file, rotationKey: bg.rotationKey, pngFiles: files, thumb: files[0] };
    writeFileSync(path.join(outDir, "asset.json"), JSON.stringify(enhanced, null, 2), "utf8");
  }

  const captions = assemblePlatformCaptions(entry.payload);
  const hashtags = buildHashtags(entry.payload);
  writeFileSync(path.join(outDir, "caption-instagram.txt"), captions.instagram, "utf8");
  writeFileSync(path.join(outDir, "caption-tiktok.txt"), captions.tiktok, "utf8");
  writeFileSync(path.join(outDir, "hashtags.txt"), hashtags.join(" "), "utf8");
  writeFileSync(path.join(outDir, "payload.json"), JSON.stringify(entry.payload, null, 2), "utf8");
  return { ...entry, captions, hashtags, pngFiles, thumb: pngFiles[0], enhanced };
}

async function generate() {
  const { rows, error } = await fetchActiveDealPool();
  if (error) throw new Error(error);
  const history = loadPostHistory();
  const now = Date.now();

  const batch = buildDailyBatch(rows, { history, now });

  // fresh daily dir each run - deterministic, no stale artifacts
  rmSync(DAILY_DIR, { recursive: true, force: true });
  mkdirSync(DAILY_DIR, { recursive: true });

  // Load the approved generated-asset manifest ONCE (local file read; no
  // network, no OpenAI). A missing/invalid manifest is fine - every post
  // just falls back to Mode B.
  const { manifest: assetManifest } = loadAssetManifest();

  const rendered = [];
  if (batch.selected.length) {
    const renderer = await createRenderer();
    try {
      for (const entry of batch.selected) {
        rendered.push(await renderCandidate(entry, renderer, assetManifest));
      }
    } finally {
      await renderer.close();
    }
  }

  const html = buildDailyGalleryHtml(
    rendered.map((r) => ({
      family: r.family,
      payload: r.payload,
      thumb: r.thumb,
      enhanced: r.enhanced, // null unless an approved generated background was used
      captions: r.captions,
      hashtags: r.hashtags,
      reasonSelected: r.reasonSelected,
    })),
    {
      warnings: batch.warnings,
      rejected: batch.rejected,
      considered: batch.considered,
      generatedAt: batch.generatedAt,
    }
  );
  const galleryPath = path.join(OUT_ROOT, "index.html");
  writeFileSync(galleryPath, html, "utf8");

  // --- console summary ---------------------------------------------------
  console.log("=== PokemonDealFinder — daily social batch ===\n");
  console.log(`Pool read:        ${rows.length} active English deals`);
  console.log(`Families tried:   ${batch.considered}`);
  console.log(`Posts selected:   ${batch.selected.length}\n`);

  for (const r of rendered) {
    console.log(`  [${r.family}] ${r.payload.content_type}`);
    console.log(`     why: ${r.reasonSelected}`);
    console.log(`     hashtags: ${r.hashtags.join(" ")}`);
    console.log(`     creative A: deterministic Mode B`);
    console.log(
      r.enhanced
        ? `     creative B: background-enhanced (asset ${r.enhanced.assetId}) — owner picks A or B in the gallery`
        : `     creative B: none (no approved generated background for this family — Mode B stands)`
    );
    const fails = buildReviewChecklist(r.payload).filter((c) => c.auto === false);
    if (fails.length) console.log(`     ⚠ auto-check FAILS: ${fails.map((c) => c.item).join("; ")}`);
    console.log("");
  }

  const enhancedCount = rendered.filter((r) => r.enhanced).length;
  console.log(
    enhancedCount
      ? `Generated backgrounds used on ${enhancedCount}/${rendered.length} post(s). The AI-enhanced version is never auto-preferred — compare A vs B in the gallery.`
      : `No approved generated backgrounds in rotation yet — every post is deterministic Mode B. Run "npm run social:assets" to build the library.`
  );
  console.log("");

  if (batch.rejected.length) {
    console.log(`Families with no post today (${batch.rejected.length}):`);
    for (const r of batch.rejected) console.log(`  - ${r.family}: ${r.reason}`);
    console.log("");
  }

  if (batch.warnings.length) {
    console.log("DAILY MIX WARNINGS:");
    for (const w of batch.warnings) console.log(`  ⚠ ${w}`);
    console.log("");
  } else if (batch.selected.length) {
    console.log("Daily mix looks balanced.\n");
  }

  console.log(`Review queue: ${galleryPath}`);
  console.log("Open it, approve/reject locally, then publish selected posts to Instagram/TikTok by hand.");
  console.log("Nothing above was published, scheduled, or sent anywhere.");
  console.log("After you publish one, run:  npm run social:daily -- record <family>  (so cooldowns advance)");
}

// Record families the owner has ACTUALLY published, so their cooldown
// keys enter the local history and tomorrow's run respects them.
function record(families) {
  const unknown = families.filter((f) => !DAILY_FAMILIES.includes(f));
  if (unknown.length) {
    console.error(`Unknown family/families: ${unknown.join(", ")}. Valid: ${DAILY_FAMILIES.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const history = loadPostHistory();
  const nowIso = new Date().toISOString();
  let added = 0;
  for (const family of families) {
    const payloadPath = path.join(DAILY_DIR, family, "payload.json");
    if (!existsSync(payloadPath)) {
      console.error(`No generated payload for "${family}" - run "npm run social:daily" first.`);
      continue;
    }
    const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
    const keys = buildCooldownKeys(payload);
    for (const key of Object.values(keys)) {
      if (key) {
        history.push({ key, postedAt: nowIso, contentType: payload.content_type });
        added++;
      }
    }
    console.log(`Recorded ${family} (${payload.content_type}) as published.`);
  }
  savePostHistory(history);
  console.log(`\n${added} cooldown key(s) written to the local post history.`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "record") {
    if (!rest.length) {
      console.error("Usage: npm run social:daily -- record <family> [<family> ...]");
      process.exitCode = 1;
      return;
    }
    record(rest);
    return;
  }
  await generate();
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e) => {
    console.error(`social:daily failed: ${e && e.message ? e.message : e}`);
    process.exitCode = 1;
  });
}

export { generate, record };

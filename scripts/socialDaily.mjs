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

import { fetchActiveDealPool, fetchCatalogRows } from "../lib/social/db.mjs";
import { buildDailyBatch, DAILY_FAMILIES } from "../lib/social/dailyMix.mjs";
import { assemblePlatformCaptions } from "../lib/social/caption.mjs";
import { buildHashtags } from "../lib/social/hashtags.mjs";
import { buildSlideContent, renderHtml, pathToFileUrl } from "../lib/social/templates.mjs";
import { createRenderer } from "../lib/social/render.mjs";
import { buildReviewChecklist, formatReviewSummary } from "../lib/social/reviewSummary.mjs";
import { buildDailyGalleryHtml } from "../lib/social/gallery.mjs";
import { loadPostHistory, savePostHistory, buildCooldownKeys } from "../lib/social/cooldown.mjs";
// Phase 13E.2 - approved generated-background support. This import chain
// touches NO network and NO OpenAI: assets.mjs only reads the local
// manifest + PNG files that `npm run social:assets` produced and a human
// approved earlier. `social:daily` makes zero image-generation calls.
import { loadAssetManifest, resolveBackgroundForPost } from "../lib/social/assets.mjs";
// Phase 13E.2.1 - LAYER 2 (real canonical card artwork) + Version D
// (brand-ad architecture). cardArtwork.mjs may make ONE kind of network
// call - a GET to the TCGplayer product CDN, host-locked, cached by id -
// and nothing else; it never touches OpenAI or eBay.
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { resolveCardArtwork, resolveMultiCardArtwork, CARD_ART_CACHE_DIR } from "../lib/social/cardArtwork.mjs";
import { resolveBrandScreenshot } from "../lib/social/brandAd.mjs";
// Phase 13E.3 - MARKET MOVER: one real card's real, confident price
// movement, resolved here (needs a price_history read) and appended to
// the batch. Fails closed - no confident window -> no mover post.
import { pickMarketMover } from "../lib/social/priceMovement.mjs";
import { buildMoverPayload } from "../lib/social/payload.mjs";
import { socialBinPool } from "../lib/social/candidates.mjs";
import { rankFlagshipDeals } from "../lib/flagshipRanking.js";
import { dealFreshness } from "../lib/dealQuality.js";

// Deterministic Version-C presentation per family (docs/social-card-artwork.md SS8).
const CARD_PRESENTATION_FOR = {
  deal_of_day: "card_metric_panel",
  just_found: "center_card",
  market_mover: "hero_left",
  pokemon_spotlight: "multi_card",
  set_spotlight: "multi_card",
};

// tcgplayer ids a candidate needs for its Version C (single or multi).
function candidateTcgIds(payload) {
  const dd = payload.deal_data;
  const arr = Array.isArray(dd) ? dd : dd ? [dd] : [];
  return arr.map((d) => d?.card_tcgplayer_id).filter((v) => v != null && String(v).trim() !== "").map(String);
}

const OUT_ROOT = path.join(process.cwd(), ".social-preview");
const DAILY_DIR = path.join(OUT_ROOT, "daily");

async function renderCandidate(entry, renderer, assetManifest, catalogById = {}) {
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

  // Version C: the SAME deterministic overlay + the REAL canonical card
  // artwork (Layer 2). Only when card_image is CLEARED AND the exact
  // printing verifies. Any doubt -> fail closed, C is simply not produced
  // and A/B stand (SS4, SS19).
  let cardVersion = null;
  let cardVersionFailed = null;
  if (RIGHTS_STATE.card_image === "CLEARED") {
    const family = entry.payload.content_type;
    const dd = entry.payload.deal_data;
    const bgForC = bg && existsSync(bg.absFile) ? bg : null;
    if (family === "pokemon_spotlight" || family === "set_spotlight") {
      const res = await resolveMultiCardArtwork(Array.isArray(dd) ? dd : [], {
        rightsState: RIGHTS_STATE,
        catalogRowFor: (id) => catalogById[String(id)] ?? null,
        cacheDir: CARD_ART_CACHE_DIR,
        min: 2,
        max: 4,
      });
      if (res.status === "ready") {
        const cardArtwork = { presentation: "multi_card", cards: res.cards.map((c) => ({ fileUrl: pathToFileUrl(c.localPath) })) };
        const files = [];
        for (const variant of ["A", "B"]) {
          const p = path.join(outDir, `creative-card-${variant}.png`);
          await renderer.renderToPng(renderHtml(slide, { variant, background: bgForC, cardArtwork }), p);
          files.push(path.relative(OUT_ROOT, p).replace(/\\/g, "/"));
        }
        cardVersion = {
          presentation: "multi_card",
          provider: res.provider,
          cards: res.cards.map((c) => ({ tcgplayerId: c.tcgplayerId, sourceUrl: c.sourceUrl, printingMatch: c.printingMatch })),
          printingMatch: { ok: true, reason: `${res.cards.length} distinct exact printings verified` },
          background: bgForC ? bgForC.assetId : null,
          pngFiles: files,
          thumb: files[0],
        };
      } else {
        cardVersionFailed = { reason: res.reason, provider: res.provider, skipped: res.skipped };
      }
    } else if (family === "deal_of_day" || family === "just_found" || family === "market_mover") {
      const deal = Array.isArray(dd) ? dd[0] : dd;
      const res = await resolveCardArtwork(deal, {
        rightsState: RIGHTS_STATE,
        catalogRow: catalogById[String(deal?.card_tcgplayer_id)] ?? null,
        cacheDir: CARD_ART_CACHE_DIR,
      });
      if (res.status === "ready") {
        const cardArtwork = { presentation: CARD_PRESENTATION_FOR[family] || "center_card", card: { fileUrl: pathToFileUrl(res.localPath) } };
        const files = [];
        for (const variant of ["A", "B"]) {
          const p = path.join(outDir, `creative-card-${variant}.png`);
          await renderer.renderToPng(renderHtml(slide, { variant, background: bgForC, cardArtwork }), p);
          files.push(path.relative(OUT_ROOT, p).replace(/\\/g, "/"));
        }
        cardVersion = {
          presentation: cardArtwork.presentation,
          provider: res.provider,
          tcgplayerId: res.printingMatch.tcgplayerId,
          sourceUrl: res.sourceUrl,
          cardNumber: res.printingMatch.cardNumber ?? null,
          printingMatch: { ok: res.printingMatch.ok, reason: res.printingMatch.reason },
          cached: res.cached,
          background: bgForC ? bgForC.assetId : null,
          pngFiles: files,
          thumb: files[0],
        };
      } else {
        cardVersionFailed = { reason: res.reason, provider: res.provider };
      }
    } else {
      // market_snapshot is an AGGREGATE - no single exact printing to
      // show (SS13). Version C is intentionally not produced for it.
      cardVersionFailed = { reason: "market_snapshot is an aggregate view - no single exact printing; Version C not applicable", provider: "n/a" };
    }
    if (cardVersion) writeFileSync(path.join(outDir, "card-version.json"), JSON.stringify(cardVersion, null, 2), "utf8");
  } else {
    cardVersionFailed = { reason: `card_image rights = ${RIGHTS_STATE.card_image} (not CLEARED)`, provider: "n/a" };
  }

  // Version D: brand ad = OpenAI/Mode-B background + a REAL site
  // screenshot + deterministic frame. NEVER captured in the daily loop -
  // only wired if a real screenshot is already cached (SS17).
  let brandAd = null;
  const shot = resolveBrandScreenshot({ route: "/" });
  if (shot.status === "ready") {
    const cardArtworkNone = null;
    const p = path.join(outDir, "creative-brandad.png");
    await renderer.renderToPng(
      renderHtml(slide, {
        variant: "A",
        background: bg && existsSync(bg.absFile) ? bg : null,
        brandAd: {
          screenshot: { fileUrl: pathToFileUrl(shot.screenshotPath) },
          headline: "Compare every Pokemon card deal against real market pricing",
          sub: "Live eBay listings, checked against a real reference. Free.",
          urlLabel: "pokemondealfinder.com",
        },
      }),
      p
    );
    brandAd = { status: "ready", route: shot.route, origin: shot.origin, pngFiles: [path.relative(OUT_ROOT, p).replace(/\\/g, "/")], thumb: path.relative(OUT_ROOT, p).replace(/\\/g, "/") };
  } else {
    brandAd = { status: "unavailable", reason: shot.reason };
  }

  const captions = assemblePlatformCaptions(entry.payload);
  const hashtags = buildHashtags(entry.payload);
  writeFileSync(path.join(outDir, "caption-instagram.txt"), captions.instagram, "utf8");
  writeFileSync(path.join(outDir, "caption-tiktok.txt"), captions.tiktok, "utf8");
  writeFileSync(path.join(outDir, "hashtags.txt"), hashtags.join(" "), "utf8");
  writeFileSync(path.join(outDir, "payload.json"), JSON.stringify(entry.payload, null, 2), "utf8");
  return { ...entry, captions, hashtags, pngFiles, thumb: pngFiles[0], enhanced, cardVersion, cardVersionFailed, brandAd };
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

  // Phase 13E.2.1 - resolve card_catalog rows for ONLY the ids the day's
  // selected candidates need (never a catalogue-wide read), so
  // cardArtwork.mjs can verify each Version C is the exact matched
  // printing. One batched read.
  let catalogById = {};
  if (RIGHTS_STATE.card_image === "CLEARED" && batch.selected.length) {
    const ids = [...new Set(batch.selected.flatMap((e) => candidateTcgIds(e.payload)))];
    try {
      const { byId, error: catErr } = await fetchCatalogRows(ids);
      if (!catErr) catalogById = byId;
    } catch {
      /* a failed catalogue read just means Version C falls back to URL self-consistency only */
    }
  }

  // Phase 13E.3 - resolve a Market Mover BEFORE rendering (one bounded
  // price_history probe over the top flagship cards). Fails closed.
  let moverEntry = null;
  try {
    const ranked = rankFlagshipDeals(socialBinPool(rows, now), { freshnessOf: (r) => dealFreshness(r), limit: 12 });
    const { candidate } = await pickMarketMover(ranked, { maxProbe: 8 });
    if (candidate) {
      const payload = buildMoverPayload({ row: candidate.row, movement: candidate.movement, now });
      moverEntry = {
        family: "market-mover",
        payload,
        reasonSelected: `Real ${candidate.movement.direction} movement ${Math.round(candidate.movement.pct * 100)}% over ${candidate.movement.windowLabel} - ${payload.subject.display_name}.`,
        cooldownKeys: buildCooldownKeys(payload),
      };
    }
  } catch (e) {
    console.warn(`market-mover probe skipped: ${e && e.message ? e.message : e}`);
  }

  const toRender = moverEntry ? [...batch.selected, moverEntry] : batch.selected;
  const rendered = [];
  if (toRender.length) {
    const renderer = await createRenderer();
    try {
      for (const entry of toRender) {
        rendered.push(await renderCandidate(entry, renderer, assetManifest, catalogById));
      }
    } finally {
      await renderer.close();
    }
  }
  if (moverEntry && !batch.considered) batch.considered = 0;

  const html = buildDailyGalleryHtml(
    rendered.map((r) => ({
      family: r.family,
      payload: r.payload,
      thumb: r.thumb,
      enhanced: r.enhanced, // null unless an approved generated background was used
      cardVersion: r.cardVersion, // Version C: real canonical card artwork
      cardVersionFailed: r.cardVersionFailed, // why C is unavailable (fail-closed reason)
      brandAd: r.brandAd, // Version D
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
        ? `     creative B: background-enhanced (asset ${r.enhanced.assetId}) — owner picks A/B/C in the gallery`
        : `     creative B: none (no approved generated background for this family — Mode B stands)`
    );
    if (r.cardVersion) {
      const c = r.cardVersion;
      console.log(
        `     creative C: REAL canonical card artwork — ${c.presentation}, ${c.provider}` +
          (c.tcgplayerId ? `, tcgplayer #${c.tcgplayerId}` : c.cards ? `, ${c.cards.length} cards` : "") +
          ` — printing match: ${c.printingMatch.ok ? "PASS" : "FAIL"}`
      );
    } else {
      console.log(`     creative C: not produced — ${r.cardVersionFailed?.reason ?? "unavailable"} (fail closed, A/B stand)`);
    }
    console.log(
      r.brandAd?.status === "ready"
        ? `     creative D: brand ad with real ${r.brandAd.origin} screenshot`
        : `     creative D: architecture ready — ${r.brandAd?.reason ?? "no cached screenshot"} (capture step is separate)`
    );
    const fails = buildReviewChecklist(r.payload).filter((c) => c.auto === false);
    if (fails.length) console.log(`     ⚠ auto-check FAILS: ${fails.map((c) => c.item).join("; ")}`);
    console.log("");
  }

  const enhancedCount = rendered.filter((r) => r.enhanced).length;
  const cardCount = rendered.filter((r) => r.cardVersion).length;
  console.log(
    enhancedCount
      ? `Generated backgrounds used on ${enhancedCount}/${rendered.length} post(s). The AI-enhanced version is never auto-preferred — compare A vs B vs C in the gallery.`
      : `No approved generated backgrounds in rotation yet — every post is deterministic Mode B. Run "npm run social:assets" to build the library.`
  );
  console.log(
    RIGHTS_STATE.card_image === "CLEARED"
      ? `Real canonical card artwork (Version C) rendered for ${cardCount}/${rendered.length} post(s); the rest fell back closed to Mode B.`
      : `card_image rights are ${RIGHTS_STATE.card_image} — no Version C.`
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

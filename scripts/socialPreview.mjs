#!/usr/bin/env node
// Phase 13D.4 / 13D.4.1 - LOCAL-ONLY social content preview CLI.
//
//   node scripts/socialPreview.mjs <family>     one family
//   node scripts/socialPreview.mjs all          all five families + gallery
//   node scripts/socialPreview.mjs gallery       rebuild .social-preview/index.html only
//
//   family: deal-of-day | best-deals | just-found | pokemon-spotlight | set-spotlight
//
// Pipeline: fetch current candidate data (database only, no eBay call,
// fetched ONCE per run and shared across every family - SS23) -> validate
// eligibility (lib/social/eligibility.mjs, unchanged truth contracts) ->
// build a structured payload (lib/social/payload.mjs) -> render local
// Mode-B PNG previews with ONE reused Chrome session (lib/social/render.mjs,
// no card image, no network) -> write caption previews -> print a human
// review summary -> (for "all") rebuild the local static review gallery.
//
// This script CANNOT publish anything: there is no Instagram/TikTok/
// Buffer API client imported anywhere in this file or in lib/social/,
// and no function named publish/schedulePost/sendToBuffer/postToInstagram
// exists in this codebase. See tests/scanner/social-preview-system.test.mjs.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { fetchActiveDealPool } from "../lib/social/db.mjs";
import {
  pickDealOfTheDay,
  pickBestDealsFoundToday,
  pickJustFound,
  pickPokemonSpotlight,
  pickSetSpotlight,
} from "../lib/social/candidates.mjs";
import { buildDealPayload, buildBestDealsPayload, buildSpotlightPayload } from "../lib/social/payload.mjs";
import { assembleCaption } from "../lib/social/caption.mjs";
import { buildSlideContent, buildCoverSlideContent, renderHtml } from "../lib/social/templates.mjs";
import { createRenderer } from "../lib/social/render.mjs";
import { buildReviewChecklist, formatReviewSummary } from "../lib/social/reviewSummary.mjs";
import { buildCooldownKeys, checkCooldowns } from "../lib/social/cooldown.mjs";
import { buildGalleryHtml } from "../lib/social/gallery.mjs";

const OUT_ROOT = path.join(process.cwd(), ".social-preview");
const ALL_FAMILIES = ["deal-of-day", "best-deals", "just-found", "pokemon-spotlight", "set-spotlight"];

const ORIGINALITY_NOTES = {
  deal_of_day: "A single-item spotlight format neither reference account centers as a recurring daily format; framed as a live opportunity, not a market-tracking entry.",
  just_found: "Recency-as-hook, built around PokemonDealFinder's own scanning/verification cadence (P0.2) - not a generic 'new listing' alert style.",
  best_deals_found_today: "Framed as 'we found these live opportunities today', not a recap of price movement.",
  pokemon_spotlight: "Anchored to a real, already-built site destination (/pokemon/[slug]) neither reference account has an equivalent of.",
  set_spotlight: "Same reasoning as Pokemon Spotlight, anchored to /sets/[slug].",
};

// Deterministic carousel file naming, factored out to a pure function so
// the numbering scheme (cover is always 01, deal slides are 02.. in pool
// order, A/B variant suffix) is independently testable without spinning
// up Chrome or a database - see tests/scanner/social-preview-system.test.mjs.
export function carouselFileName(position, variant) {
  return `${String(position).padStart(2, "0")}-${variant}.png`;
}

// Builds ONE family's payload from an ALREADY-FETCHED rows array (no I/O
// here) - the "all" path fetches the pool exactly once and shares it
// across every family; the single-family path fetches it once for that
// one family. Either way, one Supabase read per CLI invocation.
export function buildFamilyPayload(family, rows) {
  switch (family) {
    case "deal-of-day": {
      const { candidate, poolSize } = pickDealOfTheDay(rows);
      if (!candidate) return { payload: null, poolSize };
      return { payload: buildDealPayload({ contentType: "deal_of_day", row: candidate, utmCampaign: "deal_of_day" }), poolSize };
    }
    case "just-found": {
      const { candidate, poolSize } = pickJustFound(rows);
      if (!candidate) return { payload: null, poolSize };
      return { payload: buildDealPayload({ contentType: "just_found", row: candidate, utmCampaign: "just_found" }), poolSize };
    }
    case "best-deals": {
      const { candidates, poolSize } = pickBestDealsFoundToday(rows);
      if (!candidates.length) return { payload: null, poolSize };
      return { payload: buildBestDealsPayload({ rows: candidates }), poolSize };
    }
    case "pokemon-spotlight": {
      const { candidate, poolSize } = pickPokemonSpotlight(rows);
      if (!candidate) return { payload: null, poolSize };
      return {
        payload: buildSpotlightPayload({
          contentType: "pokemon_spotlight",
          displayName: candidate.pokemon_display_name,
          dealCount: candidate.deal_count,
          topDeals: candidate.top_deals,
          destinationRoute: candidate.destination_url,
        }),
        poolSize,
      };
    }
    case "set-spotlight": {
      const { candidate, poolSize } = pickSetSpotlight(rows);
      if (!candidate) return { payload: null, poolSize };
      return {
        payload: buildSpotlightPayload({
          contentType: "set_spotlight",
          displayName: candidate.set_display_name,
          dealCount: candidate.deal_count,
          topDeals: candidate.top_deals,
          destinationRoute: candidate.destination_url,
        }),
        poolSize,
      };
    }
    default:
      throw new Error(`Unknown family "${family}". Use one of: ${ALL_FAMILIES.join(", ")}, all, gallery`);
  }
}

// Renders one family's slide(s) via the shared renderer session.
// best-deals is a real carousel: 01-cover.png + one numbered slide per
// deal, each reusing the same single-deal card shape (dealSlideData) so
// the carousel reads as one consistent design, not a different template
// bolted on.
async function renderFamily(family, payload, renderer, outDir) {
  mkdirSync(outDir, { recursive: true });
  const pngPaths = [];

  if (family === "best-deals") {
    const cover = buildCoverSlideContent(payload);
    for (const variant of ["A", "B"]) {
      const p = path.join(outDir, `01-cover-${variant}.png`);
      await renderer.renderToPng(renderHtml(cover, { variant }), p);
      pngPaths.push(p);
    }
    const total = payload.deal_data.length + 1;
    for (let i = 0; i < payload.deal_data.length; i++) {
      const dealPayload = { ...payload, content_type: "deal_of_day", deal_data: payload.deal_data[i] };
      const slide = buildSlideContent(dealPayload, { eyebrow: "TODAY'S FINDS", cta: "Find the deal", carousel: { position: i + 2, total } });
      for (const variant of ["A", "B"]) {
        const p = path.join(outDir, carouselFileName(i + 2, variant));
        await renderer.renderToPng(renderHtml(slide, { variant }), p);
        pngPaths.push(p);
      }
    }
    return pngPaths;
  }

  const slide = buildSlideContent(payload);
  for (const variant of ["A", "B"]) {
    const p = path.join(outDir, `preview-${variant}.png`);
    await renderer.renderToPng(renderHtml(slide, { variant }), p);
    pngPaths.push(p);
  }
  return pngPaths;
}

async function processFamily(family, rows, renderer) {
  const { payload, poolSize } = buildFamilyPayload(family, rows);
  const outDir = path.join(OUT_ROOT, family);
  if (!payload) {
    console.log(`No eligible candidate found for "${family}" (pool size: ${poolSize}). This is expected behavior, not an error.`);
    return null;
  }
  mkdirSync(outDir, { recursive: true });
  const pngPaths = await renderFamily(family, payload, renderer, outDir);

  const shortCaption = assembleCaption(payload, { variant: "short" });
  const standardCaption = assembleCaption(payload, { variant: "standard" });
  writeFileSync(path.join(outDir, "caption-short.txt"), shortCaption, "utf8");
  writeFileSync(path.join(outDir, "caption-standard.txt"), standardCaption, "utf8");
  writeFileSync(path.join(outDir, "payload.json"), JSON.stringify(payload, null, 2), "utf8");

  const cooldownKeys = buildCooldownKeys(payload);
  const cooldowns = checkCooldowns(cooldownKeys, []); // no posting history exists yet
  const checklist = buildReviewChecklist(payload);

  console.log(formatReviewSummary(payload, checklist));
  console.log("");
  console.log(`ORIGINALITY NOTE: ${ORIGINALITY_NOTES[payload.content_type] ?? "n/a"}`);
  console.log(`Local preview files written to: ${outDir}`);
  for (const p of pngPaths) console.log(`  ${p}`);
  console.log("");

  return { family, payload, checklist, pngPaths, standardCaption, shortCaption, cooldownKeys, cooldowns };
}

function rebuildGallery() {
  const families = ALL_FAMILIES.filter((f) => existsSync(path.join(OUT_ROOT, f, "payload.json")));
  const entries = families.map((family) => {
    const dir = path.join(OUT_ROOT, family);
    const payload = JSON.parse(readFileSync(path.join(dir, "payload.json"), "utf8"));
    return { family, dir, payload };
  });
  const html = buildGalleryHtml(entries, OUT_ROOT);
  writeFileSync(path.join(OUT_ROOT, "index.html"), html, "utf8");
  console.log(`Gallery written to: ${path.join(OUT_ROOT, "index.html")}`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log(`Usage: node scripts/socialPreview.mjs <${ALL_FAMILIES.join("|")}|all|gallery>`);
    process.exitCode = 1;
    return;
  }

  if (arg === "gallery") {
    rebuildGallery();
    return;
  }

  const families = arg === "all" ? ALL_FAMILIES : [arg];
  const { rows, error } = await fetchActiveDealPool(); // ONE Supabase read, shared across every requested family
  if (error) throw new Error(error);

  const renderer = await createRenderer(); // ONE Chrome process/tab, reused across every requested family
  try {
    for (const family of families) {
      await processFamily(family, rows, renderer);
    }
  } finally {
    await renderer.close(); // never leave an orphaned Chrome process
  }

  if (arg === "all") rebuildGallery();

  console.log("Nothing above was published, scheduled, or sent anywhere.");
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
    console.error(`Preview failed: ${e && e.message ? e.message : e}`);
    process.exitCode = 1;
  });
}

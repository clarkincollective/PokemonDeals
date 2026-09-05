#!/usr/bin/env node
// Phase 13D.4 - LOCAL-ONLY social content preview CLI.
//
//   node scripts/socialPreview.mjs <family>
//   family: deal-of-day | best-deals | just-found | pokemon-spotlight | set-spotlight
//
// Pipeline: fetch current candidate data (database only, no eBay call)
// -> validate eligibility (lib/social/eligibility.mjs, unchanged truth
// contracts) -> build a structured payload (lib/social/payload.mjs) ->
// render a local Mode-B PNG preview (lib/social/render.mjs, no card
// image, no network) -> write a caption preview -> print a human review
// summary.
//
// This script CANNOT publish anything: there is no Instagram/TikTok/
// Buffer API client imported anywhere in this file or in lib/social/,
// and no function named publish/schedulePost/sendToBuffer/postToInstagram
// exists in this codebase. See tests/scanner/social-no-publishing.test.mjs.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import {
  selectDealOfTheDay,
  selectBestDealsFoundToday,
  selectJustFound,
  selectPokemonSpotlight,
  selectSetSpotlight,
} from "../lib/social/candidates.mjs";
import { buildDealPayload, buildBestDealsPayload, buildSpotlightPayload } from "../lib/social/payload.mjs";
import { assembleCaption } from "../lib/social/caption.mjs";
import { buildSlideContent, renderHtml } from "../lib/social/templates.mjs";
import { renderHtmlToPng } from "../lib/social/render.mjs";
import { buildReviewChecklist, formatReviewSummary } from "../lib/social/reviewSummary.mjs";
import { buildCooldownKeys, checkCooldowns } from "../lib/social/cooldown.mjs";

const OUT_ROOT = path.join(process.cwd(), ".social-preview");

const ORIGINALITY_NOTES = {
  deal_of_day: "A single-item spotlight format neither reference account centers as a recurring daily format; framed as a live opportunity, not a market-tracking entry.",
  just_found: "Recency-as-hook, built around PokemonDealFinder's own scanning/verification cadence (P0.2) - not a generic 'new listing' alert style.",
  best_deals_found_today: "Framed as 'we found these live opportunities today', not a recap of price movement.",
  pokemon_spotlight: "Anchored to a real, already-built site destination (/pokemon/[slug]) neither reference account has an equivalent of.",
  set_spotlight: "Same reasoning as Pokemon Spotlight, anchored to /sets/[slug].",
};

async function loadFamily(family) {
  switch (family) {
    case "deal-of-day": {
      const { candidate, poolSize, error } = await selectDealOfTheDay();
      if (error) throw new Error(error);
      if (!candidate) return { payload: null, poolSize };
      return { payload: buildDealPayload({ contentType: "deal_of_day", row: candidate, utmCampaign: "deal_of_day" }), poolSize };
    }
    case "just-found": {
      const { candidate, poolSize, error } = await selectJustFound();
      if (error) throw new Error(error);
      if (!candidate) return { payload: null, poolSize };
      return { payload: buildDealPayload({ contentType: "just_found", row: candidate, utmCampaign: "just_found" }), poolSize };
    }
    case "best-deals": {
      const { candidates, poolSize, error } = await selectBestDealsFoundToday();
      if (error) throw new Error(error);
      if (!candidates.length) return { payload: null, poolSize };
      return { payload: buildBestDealsPayload({ rows: candidates }), poolSize };
    }
    case "pokemon-spotlight": {
      const { candidate, poolSize, error } = await selectPokemonSpotlight();
      if (error) throw new Error(error);
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
      const { candidate, poolSize, error } = await selectSetSpotlight();
      if (error) throw new Error(error);
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
      throw new Error(`Unknown family "${family}". Use one of: deal-of-day, best-deals, just-found, pokemon-spotlight, set-spotlight`);
  }
}

async function main() {
  const family = process.argv[2];
  if (!family) {
    console.log("Usage: node scripts/socialPreview.mjs <deal-of-day|best-deals|just-found|pokemon-spotlight|set-spotlight>");
    process.exitCode = 1;
    return;
  }

  const { payload, poolSize } = await loadFamily(family);
  if (!payload) {
    console.log(`No eligible candidate found for "${family}" (pool size: ${poolSize}). This is expected behavior, not an error - a truthful empty result beats a padded/fabricated one.`);
    return;
  }

  const outDir = path.join(OUT_ROOT, family);
  mkdirSync(outDir, { recursive: true });

  // Two deterministic layout variants (SS20) - never more for this spike.
  const slide = buildSlideContent(payload);
  const pngPaths = [];
  for (const variant of ["A", "B"]) {
    const html = renderHtml(slide, { variant });
    const outPath = path.join(outDir, `preview-${variant}.png`);
    await renderHtmlToPng(html, outPath);
    pngPaths.push(outPath);
  }

  const shortCaption = assembleCaption(payload, { variant: "short" });
  const standardCaption = assembleCaption(payload, { variant: "standard" });
  writeFileSync(path.join(outDir, "caption-short.txt"), shortCaption, "utf8");
  writeFileSync(path.join(outDir, "caption-standard.txt"), standardCaption, "utf8");
  writeFileSync(path.join(outDir, "payload.json"), JSON.stringify(payload, null, 2), "utf8");

  const cooldownKeys = buildCooldownKeys(payload);
  const cooldowns = checkCooldowns(cooldownKeys, []); // no posting history exists yet - see lib/social/cooldown.mjs

  const checklist = buildReviewChecklist(payload);
  console.log(formatReviewSummary(payload, checklist));
  console.log("");
  console.log("COOLDOWN KEYS (data model only - no posting history exists to check against yet):");
  console.log(`  ${JSON.stringify(cooldownKeys)}`);
  console.log(`  current cooldown state: ${JSON.stringify(cooldowns)}`);
  console.log("");
  console.log(`ORIGINALITY NOTE: ${ORIGINALITY_NOTES[payload.content_type] ?? "n/a"}`);
  console.log("");
  console.log("STANDARD CAPTION:\n" + standardCaption);
  console.log("");
  console.log(`Local preview files written to: ${outDir}`);
  for (const p of pngPaths) console.log(`  ${p}`);
  console.log("");
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

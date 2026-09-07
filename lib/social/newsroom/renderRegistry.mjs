// Phase SOCIAL-NEWSROOM-2C - NEWSROOM SERIES -> RENDERER REGISTRY (SS3).
//
// Maps each renderable newsroom series to ONE editorial layout family
// (lib/social/newsroom/editorialTemplates) plus a deterministic
// content-prop builder from a persisted story's facts_json. Series not in
// the map are simply not rendered (SS3: do not force unsupported formats).
//
// No card artwork, no OpenAI redraw, no seller imagery (SS5). Editorial
// series carry our own words + our own aggregate data only.
//
// Pure. No I/O.

import { renderEditorialHtml } from "./editorialTemplates.mjs";

// frozen rights_state for a newsroom editorial artifact. Nothing here
// depends on an eBay seller photo or a GenAI redraw; the market data
// shown is the same PokemonPriceTracker-derived aggregate the site's
// /market-data pages and the 13E social system already publish, so
// ppt_social_data is CLEARED. publishing stays DISABLED - HOSTING IS NOT
// PUBLISHING (lib/social/storage/hostedAssets.canHost).
export function newsroomRights() {
  return {
    ppt_social_data: "CLEARED",
    card_image: "CLEARED", // no card image is used; nothing to clear
    ebay_seller_images: "NOT_CLEARED",
    ebay_genai: "NOT_ALLOWED",
    publishing: "DISABLED",
  };
}

// series -> { layout, platforms:[4:5 targets], short: bool (9:16 allowed),
//   cta: intensity the renderer should honour, build: (story) -> props }
export const SERIES_RENDER = Object.freeze({
  PRICE_STORY: {
    layout: "story_reveal",
    platforms: ["instagram", "x"],
    short: true, // a genuine narrative -> a Short is materially varied (SS4/SS40)
    cta: "NONE",
    // SOCIAL-NEWSROOM-2D: story_reveal Layer-5 verdict is FLAKY (3/6 PASS
    // in the temperature:0 stability run) -> renders for manual review but
    // is NOT auto-queued.
    autonomous_safe: false,
    build: (story) => {
      const f = story.facts_json ?? {};
      return {
        quote: f.headline_fact || "We thought this was the cheapest listing.",
        reveal: f.reveal || "Then shipping, printing and currency changed the order. Exact matching is the whole job.",
        mark: "01",
      };
    },
  },
  BIGGEST_MOVERS: {
    layout: "data_ranking",
    // SOCIAL-NEWSROOM-2D: data_ranking still verdicts WATCH under
    // temperature:0 Layer-5 after a bounded redesign (no blockers, just
    // "not quite premium") -> NOT autonomous-safe. It still renders for
    // manual review; it just cannot be auto-queued.
    autonomous_safe: false,
    platforms: ["instagram", "x"],
    short: false, // a bare ranking is not enough substance for a Short
    cta: "BRAND_ONLY",
    build: (story) => {
      const f = story.facts_json ?? {};
      const rows = Array.isArray(f.rows) && f.rows.length
        ? f.rows
        : [
            { name: "(no observed movers)", deltaPct: 0 },
          ];
      return {
        eyebrow: "7-day movers",
        headline: f.headline_fact || "Biggest 7-day price moves",
        rows,
        footnote: f.observation_note || "Movement vs the prior 7-day median. Observations only, not advice.",
      };
    },
  },
  MARKET_SNAPSHOT: {
    layout: "editorial_dashboard",
    platforms: ["instagram", "x"],
    short: true,
    cta: "BRAND_ONLY",
    build: (story) => {
      const f = story.facts_json ?? {};
      const stats = Array.isArray(f.stats) && f.stats.length
        ? f.stats
        : [
            { label: "Priced cards", value: "—" },
            { label: "Median value", value: "—" },
            { label: "Under $25", value: "—" },
            { label: "$100+", value: "—" },
          ];
      return {
        eyebrow: "Market snapshot",
        headline: f.headline_fact || "What the Pokemon single-card market looks like right now",
        stats,
        source: f.source || "PokemonDealFinder catalogue, market references via PokemonPriceTracker.",
      };
    },
  },
  HOW_WE_FIND_DEALS: {
    layout: "process_explainer",
    platforms: ["instagram", "x"],
    short: true,
    cta: "BRAND_ONLY",
    build: () => ({
      eyebrow: "Behind the finder",
      headline: "How a listing becomes a deal",
      steps: [
        { title: "Match the exact printing", detail: "Set, number, language, grade - not just the card name." },
        { title: "Price the landed total", detail: "Item + shipping, converted to USD, against a real market reference." },
        { title: "Verify it is still live", detail: "A single-item check before we ever show it - stale listings are dropped." },
      ],
      cta: "Full method at pokemondealfinder.com/methodology",
    }),
  },
  METHODOLOGY: {
    layout: "trust_editorial",
    platforms: ["instagram", "x"],
    short: true,
    cta: "BRAND_ONLY",
    build: () => ({
      eyebrow: "Methodology",
      thesis: "A deal is only a deal against an honest reference price.",
      support: "We compare the landed total to a real sold-price market reference for the exact printing - and say so on every card.",
      cta: "pokemondealfinder.com/methodology",
    }),
  },
  WHY_SOLD_PRICES_MATTER: {
    layout: "compare_split",
    platforms: ["instagram", "x"],
    short: true,
    cta: "NONE",
    build: () => ({
      eyebrow: "Education",
      headline: "Asking price vs sold price",
      left: { label: "Asking price", value: "What a seller wants", note: "The number on the listing. It can be anything." },
      right: { label: "Sold price", value: "What it's worth", note: "What comparable copies actually changed hands for." },
      takeaway: "A card 40% under the highest ask can still be over the going rate. We reference sold data, not aspirations.",
    }),
  },
  EXACT_PRINTING_MATTERS: {
    layout: "compare_split",
    platforms: ["instagram", "x"],
    short: true,
    cta: "NONE",
    build: () => ({
      eyebrow: "Education",
      headline: "Same card name, different card",
      left: { label: "The name", value: "“Charizard”", note: "Matches hundreds of printings across 25 years." },
      right: { label: "The printing", value: "Set · number · edition", note: "1st ed vs unlimited, holo, language, grade." },
      takeaway: "A match on the name alone is not a match. We match the exact printing before pricing anything.",
    }),
  },
  AUCTION_BID_VS_TOTAL: {
    layout: "compare_split",
    platforms: ["instagram", "x"],
    short: true,
    cta: "NONE",
    build: () => ({
      eyebrow: "Education",
      headline: "The bid is not the price",
      left: { label: "Current bid", value: "$42", note: "What the auction shows right now." },
      right: { label: "Landed total", value: "$61", note: "Bid + shipping + import + currency conversion." },
      takeaway: "We reprice every auction on the landed total before it can count as a deal.",
    }),
  },
  PRODUCT_EXPLAINER: {
    layout: "trust_editorial",
    platforms: ["instagram", "x"],
    short: true,
    cta: "BRAND_ONLY",
    build: () => ({
      eyebrow: "What we do",
      thesis: "PokemonDealFinder watches the market so you can check one page instead of ten tabs.",
      support: "Exact-printing matches, landed totals, live-verified listings, an honest reference price on every one.",
      cta: "pokemondealfinder.com",
    }),
  },
});

export function seriesRenderable(series) {
  return Boolean(SERIES_RENDER[String(series || "").toUpperCase()]);
}

export function layoutFamilyFor(series) {
  return SERIES_RENDER[String(series || "").toUpperCase()]?.layout ?? null;
}

// Which of a story's platform placements can actually be rendered as a
// static editorial asset. TikTok is motion-only -> never; YouTube only
// when the series allows a Short.
export function renderablePlatformsFor(series) {
  const def = SERIES_RENDER[String(series || "").toUpperCase()];
  if (!def) return [];
  const out = new Set(def.platforms);
  if (def.short) out.add("youtube");
  return [...out].filter((p) => ["instagram", "x", "youtube"].includes(p));
}

// target key for a platform: 4:5 for IG/X, 9:16 for YouTube Short.
export function targetFor(platform) {
  return platform === "youtube" ? "short_916" : "ig_45";
}

// where each layout family places its wordmark / CTA - used by the
// feed-level review so "identical CTA placement" reflects reality.
export const LAYOUT_CTA_ZONE = Object.freeze({
  story_reveal: "bottom_right",
  data_ranking: "bottom_split",
  editorial_dashboard: "foot_split",
  process_explainer: "left_bar",
  trust_editorial: "masthead_top",
  compare_split: "bottom_left",
});

// SOCIAL-NEWSROOM-2D SS7: a series is autonomous-queue-eligible only if
// its layout family has proven a RELIABLE Layer-5 PASS (see the
// stability report). data_ranking is excluded (WATCH-prone).
export function seriesAutonomousSafe(series) {
  const def = SERIES_RENDER[String(series || "").toUpperCase()];
  return Boolean(def) && def.autonomous_safe !== false;
}
// Proven RELIABLE (>= 80% Layer-5 PASS across 6 samples, temperature:0,
// 2026-09-08 stability run). story_reveal (50%) and data_ranking
// (WATCH-prone) are excluded and marked autonomous_safe:false on their
// series.
export const AUTONOMOUS_SAFE_LAYOUTS = Object.freeze([
  "editorial_dashboard", "trust_editorial", "process_explainer", "compare_split",
]);

// Build the final HTML for one (story, platform).
export function buildEditorialAsset(story, platform) {
  const def = SERIES_RENDER[String(story.series || "").toUpperCase()];
  if (!def) return null;
  const target = targetFor(platform);
  const props = { ...def.build(story), target };
  return {
    html: renderEditorialHtml(def.layout, props),
    layout_family: def.layout,
    target,
    cta_intensity: def.cta,
    cta_zone: LAYOUT_CTA_ZONE[def.layout] ?? "bottom",
  };
}

// Phase SOCIAL-NEWSROOM-2C - PLATFORM-NATIVE EDITORIAL CAPTIONS
// (SS4, SS12, SS19, SS42, SS43).
//
// Deterministic. One STORY -> a distinct caption per platform (never a
// literal copy). CTA intensity is honoured: education = NONE / BRAND_ONLY
// (no website pitch), authority = SOFT, brand = BRAND_ONLY. Restrained,
// per-series hashtag sets - no identical block on every post.
//
// The link (when present) uses the EXISTING deterministic UTM scheme
// (attribution.attributedCtaUrl) - utm_source=<platform>,
// utm_medium=social, utm_campaign=<goal>, utm_content=<content_id>.
//
// Pure. No I/O.

import { attributedCtaUrl } from "../distribution/attribution.mjs";
import { CAPTION_STYLE } from "./placements.mjs";

const HASHTAGS = Object.freeze({
  PRICE_STORY: ["#pokemontcg", "#tcgcollecting"],
  BIGGEST_MOVERS: ["#pokemontcg", "#tcgmarket"],
  MARKET_SNAPSHOT: ["#pokemontcg", "#tcgmarket", "#cardcollecting"],
  HOW_WE_FIND_DEALS: ["#pokemontcg", "#tcgdeals"],
  METHODOLOGY: ["#pokemontcg"],
  WHY_SOLD_PRICES_MATTER: ["#pokemontcg", "#tcgcollecting"],
  EXACT_PRINTING_MATTERS: ["#pokemontcg", "#tcgcollecting"],
  AUCTION_BID_VS_TOTAL: ["#pokemontcg", "#tcgauctions"],
  PRODUCT_EXPLAINER: ["#pokemontcg", "#tcgdeals"],
});

// short editorial "body" per series - one honest sentence, no hype.
function bodyFor(series, f = {}) {
  switch (series) {
    case "PRICE_STORY":
      return f.headline_fact
        ? `${f.headline_fact} Then the details moved the ranking. Exact matching is the whole job.`
        : "A cheaper sticker price is not always the cheaper card. The printing, shipping and currency decide it.";
    case "BIGGEST_MOVERS":
      return "The biggest 7-day moves in single-card market references. Observations, not advice.";
    case "MARKET_SNAPSHOT":
      return "A read on the Pokemon single-card market from our catalogue and sold-price references.";
    case "HOW_WE_FIND_DEALS":
      return "Match the exact printing, price the landed total, verify it is still live. In that order.";
    case "METHODOLOGY":
      return "A deal is only a deal against an honest reference price. Here is how we set one.";
    case "WHY_SOLD_PRICES_MATTER":
      return "Asking prices say what a seller wants. Sold prices say what a card is worth.";
    case "EXACT_PRINTING_MATTERS":
      return "1st edition vs unlimited, holo vs non-holo, language, set number, grade - the same card, five prices.";
    case "AUCTION_BID_VS_TOTAL":
      return "The bid is not the price. Bid + shipping + import + currency is what you actually pay.";
    case "PRODUCT_EXPLAINER":
      return "We watch the market so you can check one page instead of ten tabs.";
    default:
      return "";
  }
}

// hook line (first line) - platform-dependent per CAPTION_STYLE.
function hookFor(series, f = {}) {
  const H = {
    PRICE_STORY: "The cheapest listing wasn't the cheapest card.",
    BIGGEST_MOVERS: f.headline_fact || "This week's biggest price moves",
    MARKET_SNAPSHOT: f.headline_fact || "The Pokemon card market, in four numbers",
    HOW_WE_FIND_DEALS: "How a listing actually becomes a deal",
    METHODOLOGY: "What counts as a deal here",
    WHY_SOLD_PRICES_MATTER: "40% off the highest asking price can still be overpaying",
    EXACT_PRINTING_MATTERS: "The same card can be five different prices",
    AUCTION_BID_VS_TOTAL: "The bid is not the price",
    PRODUCT_EXPLAINER: "Check one page instead of ten tabs",
  };
  return H[series] || "";
}

function linkFor({ platform, goal, contentId, family }) {
  return attributedCtaUrl({
    baseUrl: "https://pokemondealfinder.com",
    platform,
    contentGoal: goal,
    contentId,
    contentFamily: family ?? null,
  });
}

// story: a persisted social_stories row (or the in-memory story).
// Returns { platform: { text, hook, hashtags, link, cta_intensity } }.
export function platformCaptions(story, { cta = story.cta_intensity ?? "BRAND_ONLY" } = {}) {
  const series = String(story.series || "").toUpperCase();
  const f = story.facts_json ?? {};
  const tags = HASHTAGS[series] ?? ["#pokemontcg"];
  const body = bodyFor(series, f);
  const goal = story.content_goal ?? "TRUST";
  const contentId = story.story_id;

  const out = {};
  for (const platform of ["instagram", "x", "youtube"]) {
    const style = CAPTION_STYLE[platform === "youtube" ? "youtube" : platform] ?? CAPTION_STYLE.x;
    const hook = hookFor(series, f);
    // link ONLY for SOFT/HARD; education (NONE) and BRAND_ONLY carry a
    // plain domain mention at most, never a tracked pitch footer (SS12).
    const link = cta === "SOFT" || cta === "HARD" ? linkFor({ platform, goal, contentId, family: story.pillar?.toLowerCase() }) : null;
    const brandLine = cta === "BRAND_ONLY" ? "pokemondealfinder.com" : null;

    let text;
    if (platform === "instagram") {
      text = [hook, "", body, brandLine ? `\n${brandLine}` : "", link ? `\n${link}` : "", "", tags.join(" ")]
        .filter((x) => x !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    } else if (platform === "x") {
      // concise observation + commentary; 0-2 tags
      text = [body, link ? link : brandLine ? brandLine : null, tags.slice(0, 2).join(" ")].filter(Boolean).join("\n\n");
      if (text.length > 270) text = text.slice(0, 267).trimEnd() + "…";
    } else {
      // youtube: title + structured description
      const title = hook.slice(0, 90) || `${series.replace(/_/g, " ")}`;
      text = [title, "", body, brandLine ? brandLine : "", "", tags.slice(0, 3).join(" ")].filter((x) => x !== undefined).join("\n").trim();
    }
    out[platform] = { text, hook, hashtags: tags, link: link ?? brandLine, cta_intensity: cta };
  }
  return out;
}

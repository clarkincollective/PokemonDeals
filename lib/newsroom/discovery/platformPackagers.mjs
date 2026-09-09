// Phase SOCIAL-DISCOVERY-1 SS5-SS19/SS21/SS30 - PLATFORM PACKAGERS.
//
// Instagram/X reuse the EXISTING 5B/5B.1 caption text (already fact-
// locked, entity-locked, encoding-verified, length-gated) as their base -
// this layer only ADDS discovery metadata around it (keywords, hashtags,
// emoji audit, alt text, audience, route). TikTok/YouTube have no
// existing caption/title generator in this pipeline, so this module
// builds their platform-native text deterministically from the SAME
// locked facts/entities every other stage already uses - never a new AI
// call, never an invented fact. SS21: each platform gets genuinely
// different packaging of the same underlying facts, not one caption
// truncated four ways.

import { selectHashtags } from "./hashtagPools.mjs";
import { emojiPlanFor, auditEmojiUsage } from "./emojiPlans.mjs";
import { checkXLength, X_CAPTION_HARD_LIMIT } from "../captions/captionAudit.mjs";
import { entityArrays } from "./entities.mjs";

const money = (n) => (n == null ? null : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);
const HOOK_EMOJI = "\u{1F440}"; // 👀
const INSIGHT_EMOJI = "\u{1F4CA}"; // 📊
const CTA_EMOJI = "\u{1F50E}"; // 🔎

function factsOf(pkg) {
  const sem = pkg?.semantic_manifest ?? {};
  const snap = pkg?.snapshot ?? {};
  return {
    pct: sem.claim_value ?? snap.derived_percentages?.under_25_pct ?? null,
    population: snap.tracked_population ?? null,
    asking: sem.comparison_left?.value ?? null,
    market: sem.comparison_right?.value ?? null,
    gapPct: sem.comparison_pct ?? null,
    example: sem.example_card ?? null,
  };
}

function altTextFor(pkg, family) {
  const f = factsOf(pkg);
  const { card_entities } = entityArrays(pkg);
  const card = card_entities[0] ?? null;
  if (family === "market_snapshot" || family === "price_band_insight") {
    return `PokemonDealFinder market graphic${card ? ` showing ${card} and` : " showing"} a price distribution indicating that ${f.pct}% of ${f.population?.toLocaleString("en-US")} tracked Pokemon singles are under $25.`;
  }
  if (family === "asking_vs_sold") {
    return `PokemonDealFinder graphic comparing${card ? ` ${card}'s` : " a card's"} asking price of ${money(f.asking)} against a market reference of ${money(f.market)}.`;
  }
  return `PokemonDealFinder graphic${card ? ` for ${card}` : ""} showing real Pokemon card market data.`;
}

// ============================== INSTAGRAM (SS5/SS6/SS7) ==============================
export function packageInstagram(pkg, { keywords, route, audience, recentTags = [] } = {}) {
  const captionText = pkg?.captions?.instagram?.caption_text ?? "";
  const hook = captionText.split(/\n/)[0] ?? "";
  const { card_entities } = entityArrays(pkg);
  const entityTerm = card_entities[0] ?? null;
  const hashtags = selectHashtags("instagram", pkg?.family, { entityTerm, recentTags, lockedEntityTerms: card_entities });
  const emojiAudit = auditEmojiUsage(captionText, "instagram");
  const isEmpty = captionText.trim().length === 0;
  return {
    hook, caption: captionText,
    caption_keywords: keywords?.caption_keywords ?? [],
    emoji_plan: emojiPlanFor("instagram"),
    hashtags: hashtags.tags,
    alt_text: altTextFor(pkg, pkg?.family),
    target_audience: audience?.primary_audience ?? null,
    related_site_route: route?.route ?? null,
    audit: { ok: !isEmpty && hashtags.ok && emojiAudit.ok, hashtag_result: hashtags, emoji_result: emojiAudit, caption_length: captionText.length, empty_caption: isEmpty },
  };
}

// ================================== X (SS8/SS9/SS10) ==================================
export function packageX(pkg, { keywords, route, audience, recentTags = [] } = {}) {
  const captionText = pkg?.captions?.x?.caption_text ?? "";
  const { card_entities } = entityArrays(pkg);
  const entityTerm = card_entities[0] ?? null;
  const hashtags = selectHashtags("x", pkg?.family, { entityTerm, recentTags, lockedEntityTerms: card_entities });
  const emojiAudit = auditEmojiUsage(captionText, "x");
  const lengthFindings = checkXLength(captionText, "x");
  const len = [...captionText].length;
  const preferredMax = 240;
  const isEmpty = captionText.trim().length === 0;
  if (isEmpty) lengthFindings.push({ code: "CAPTION_GENERATION_HOLD", detail: "X caption is empty - the underlying caption pipeline HELD this platform (a rare, pre-existing, platform-independent outcome, not something this discovery layer can fix); never package/submit an empty caption as ready" });
  return {
    caption: captionText,
    caption_keywords: keywords?.caption_keywords ?? [],
    hashtags: hashtags.tags,
    emoji_plan: emojiPlanFor("x"),
    target_audience: audience?.primary_audience ?? null,
    related_site_route: route?.route ?? null,
    audit: {
      ok: !isEmpty && lengthFindings.length === 0 && hashtags.ok && emojiAudit.ok,
      length_chars: len, hard_limit: X_CAPTION_HARD_LIMIT, preferred_max: preferredMax,
      within_preferred: len <= preferredMax, empty_caption: isEmpty,
      length_findings: lengthFindings, hashtag_result: hashtags, emoji_result: emojiAudit,
    },
  };
}

// ================================ TIKTOK (SS11-14) ================================
export function packageTikTok(pkg, { keywords, route, audience, hook, recentTags = [], onScreenAlignment = null } = {}) {
  const f = factsOf(pkg);
  const { card_entities } = entityArrays(pkg);
  const entityTerm = card_entities[0] ?? null;
  const hookLine = hook?.text ?? keywords?.on_screen_keywords?.[0] ?? "Pokemon card market update";
  const body = f.example ? `${entityTerm ?? f.example} is one example of how much of the hobby still sits at the affordable end.` : "Here's what real Pokemon card market data shows.";
  const caption = `${hookLine} ${HOOK_EMOJI}\n\n${body}\n\n${CTA_EMOJI} PokemonDealFinder.com`;
  const hashtags = selectHashtags("tiktok", pkg?.family, { entityTerm, recentTags, lockedEntityTerms: card_entities });
  const emojiAudit = auditEmojiUsage(caption, "tiktok");
  const len = caption.length;
  return {
    primary_search_query: keywords?.primary_search_query ?? null,
    secondary_search_queries: keywords?.secondary_search_queries ?? [],
    caption, caption_keywords: keywords?.caption_keywords ?? [],
    on_screen_keywords: keywords?.on_screen_keywords ?? [],
    hashtags: hashtags.tags,
    target_audience: audience?.primary_audience ?? null,
    trend_candidates: [], // SS0 - no lazy trend-hashtag strategy; empty until a real, deterministic relevance rule exists
    related_site_route: route?.route ?? null,
    audit: {
      ok: len >= 40 && len <= 500 && hashtags.ok && emojiAudit.ok && (!onScreenAlignment || onScreenAlignment.verdict !== "FAIL"),
      length_chars: len, target: [100, 350],
      hashtag_result: hashtags, emoji_result: emojiAudit,
      on_screen_alignment: onScreenAlignment?.verdict ?? null,
    },
  };
}

// =============================== YOUTUBE SHORTS (SS15-19) ===============================
function youtubeTitle(pkg, hook) {
  const f = factsOf(pkg);
  if (f.pct != null) return `${f.pct}% of Pokemon Cards Cost Less Than $25`;
  if (f.asking != null && f.market != null) return `Asking ${money(f.asking)} vs Market ${money(f.market)} - Worth It?`;
  return hook?.text?.slice(0, 70) ?? "Pokemon Card Market Update";
}

export function packageYouTubeShorts(pkg, { keywords, route, audience, hook, recentTags = [] } = {}) {
  const f = factsOf(pkg);
  const { card_entities } = entityArrays(pkg);
  const entityTerm = card_entities[0] ?? null;
  const title = youtubeTitle(pkg, hook).slice(0, 100);
  const summary = f.pct != null
    ? `${f.pct}% of the ${f.population?.toLocaleString("en-US")} Pokemon singles tracked in this market snapshot sell for under $25.${entityTerm ? ` ${entityTerm} is one example of how much of the hobby remains affordable.` : ""}`
    : f.asking != null
      ? `This card is asking ${money(f.asking)} against a recent market reference of ${money(f.market)}.${entityTerm ? ` ${entityTerm} shows how asking price and market value can differ.` : ""}`
      : "Real Pokemon card market data, tracked and explained.";
  const hashtags = selectHashtags("youtube_shorts", pkg?.family, { entityTerm, recentTags, lockedEntityTerms: card_entities });
  const description = `${summary}\n\n${CTA_EMOJI} Track Pokemon card prices and deals at PokemonDealFinder.com.\n\n${hashtags.tags.join(" ")}`.trim();
  const videoTags = [...new Set([
    "pokemon cards", keywords?.primary_search_query, ...(keywords?.secondary_search_queries ?? []),
    entityTerm ? `${entityTerm.toLowerCase()} card` : null, entityTerm ? `${entityTerm.toLowerCase()} pokemon card` : null,
    "pokemon deal finder",
  ].filter(Boolean))].slice(0, 12);
  const emojiAudit = auditEmojiUsage(`${title} ${description}`, "youtube_shorts");
  return {
    primary_query: keywords?.primary_search_query ?? null,
    title, description,
    hashtags: hashtags.tags, video_tags: videoTags,
    topic_keywords: keywords?.caption_keywords ?? [],
    target_audience: audience?.primary_audience ?? null,
    related_site_route: route?.route ?? null,
    related_video_candidate: null, // no cross-video linking system exists yet - never invented
    audit: {
      ok: title.length <= 100 && description.length <= 5000 && videoTags.length <= 12 && hashtags.ok && emojiAudit.ok,
      title_length: title.length, title_target: [40, 70], title_hard_max: 100,
      description_length: description.length, description_target: [150, 500],
      video_tag_count: videoTags.length, hashtag_result: hashtags, emoji_result: emojiAudit,
    },
  };
}

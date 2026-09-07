// Phase 13E.5B - PLATFORM-SPECIFIC DETERMINISTIC COPY.
//
// One core content piece -> platform-appropriate copy, all from the SAME
// frozen deterministic facts. No LLM, no regenerated numbers, no fake
// urgency / scarcity, website-first CTA, affiliate disclosure where the
// budget allows. Instagram + TikTok reuse lib/social/caption.mjs
// unchanged; this module adds X post text and YouTube Shorts title +
// description.
//
// `facts` is a frozen object the caller assembles once (from the daily
// payload snapshot, or by parsing the 13E.4 video manifest's own frozen
// fact sentence - see lib/social/distribution/artifacts.mjs):
//   { family, contentGoal, cardName?, listedUsd?, marketRefUsd?,
//     discountPct?, movementPct?, movementDirection?, movementWindow?,
//     ctaUrl }
// Any missing number -> the richer template is skipped and a hook-only
// (still deterministic) form is used; if even that can't be built inside
// the char budget, { ok:false } is returned and the gate blocks THAT
// placement only.

import { DISCLOSURE_LINE } from "../caption.mjs";

const X_MAX = 280;
const YT_TITLE_MAX = 100;
const YT_DESC_MAX = 5000;

// Short, unambiguous affiliate marker that fits X's budget. "Ad" is on
// EPN's approved-phrases list (docs/social-compliance-readiness.md SS7).
const X_DISCLOSURE = "Ad · eBay Partner Network affiliate";
const X_DISCLOSURE_SHORT = "(Ad)";

const money = (n) => `$${Number(n).toFixed(2)}`;
const money0 = (n) => `$${Math.round(Number(n)).toLocaleString("en-US")}`;
const pct = (n) => `${Math.round(Number(n) * 100)}%`;

function clampName(name, max = 44) {
  const s = String(name ?? "").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

const hasDealFacts = (f) =>
  f && Number.isFinite(Number(f.listedUsd)) && Number(f.listedUsd) > 0 &&
  Number.isFinite(Number(f.marketRefUsd)) && Number(f.marketRefUsd) > 0 &&
  Number.isFinite(Number(f.discountPct)) && Number(f.discountPct) > 0;

const hasMoverFacts = (f) =>
  f && Number.isFinite(Number(f.movementPct)) &&
  (f.movementDirection === "up" || f.movementDirection === "down") &&
  typeof f.movementWindow === "string" && f.movementWindow.length > 0;

// --- X (Twitter) ---------------------------------------------------
// Returns { ok, text, chars } or { ok:false, reason }.
export function xPostText(facts = {}) {
  const url = String(facts.ctaUrl ?? "").replace(/^https?:\/\//, "");
  if (!url) return { ok: false, reason: "no ctaUrl for X post" };
  const name = clampName(facts.cardName);

  const build = (lines, disc) => `${lines.join("\n")}\n\n${url}${disc ? `\n\n${disc}` : ""}`;

  let candidates = [];
  if (facts.family === "market_mover" && hasMoverFacts(facts)) {
    const dir = facts.movementDirection === "up" ? "up" : "down";
    const body = [
      `${name}: market reference moved ${dir} ${pct(Math.abs(facts.movementPct))} over ${facts.movementWindow}.`,
      ``,
      `Price history:`,
    ];
    candidates = [build(body, X_DISCLOSURE), build(body, X_DISCLOSURE_SHORT), build(body, "")];
  } else if ((facts.family === "deal_drop" || facts.family === "market_snapshot") && hasDealFacts(facts)) {
    const full = [
      `Just found: ${name}`,
      `Listed: ${money(facts.listedUsd)}`,
      `Recent market ref: ${money(facts.marketRefUsd)}`,
      `${pct(facts.discountPct)} below reference`,
    ];
    const tight = [
      `Just found: ${name} listed ${money0(facts.listedUsd)}`,
      `${pct(facts.discountPct)} below a ${money0(facts.marketRefUsd)} market reference`,
    ];
    candidates = [
      build(full, X_DISCLOSURE),
      build(full, X_DISCLOSURE_SHORT),
      build(tight, X_DISCLOSURE_SHORT),
      build(tight, ""),
    ];
  } else {
    // hook-only fallback: use the frozen hook string if present
    const hook = String(facts.hook ?? "").trim();
    if (!hook) return { ok: false, reason: "no deal/mover facts and no frozen hook for an X post" };
    const body = [hook.replace(/\s+/g, " ")];
    candidates = [build(body, X_DISCLOSURE), build(body, X_DISCLOSURE_SHORT), build(body, "")];
  }

  const pick = candidates.find((t) => t.length <= X_MAX);
  if (!pick) return { ok: false, reason: `every X variant exceeds ${X_MAX} chars (shortest ${Math.min(...candidates.map((c) => c.length))})` };
  return { ok: true, text: pick, chars: pick.length };
}

// --- YouTube Shorts ----------------------------------------------
// Returns { ok, title, description } or { ok:false, reason }.
export function youtubeShortsMeta(facts = {}) {
  const ctaUrl = String(facts.ctaUrl ?? "");
  if (!ctaUrl) return { ok: false, reason: "no ctaUrl for YouTube Short" };
  const cta = ctaUrl.replace(/^https?:\/\//, "");
  const name = clampName(facts.cardName, 40);

  let title;
  let factLine;
  if (facts.family === "market_mover" && hasMoverFacts(facts)) {
    const dir = facts.movementDirection === "up" ? "Up" : "Down";
    title = `${name || "This Pokemon Card"}: Market Reference ${dir} ${pct(Math.abs(facts.movementPct))} (${facts.movementWindow})`;
    factLine = `${name}: recent market reference is ${dir.toLowerCase()} ${pct(Math.abs(facts.movementPct))} over ${facts.movementWindow}, based on our canonical price history for this exact printing.`;
  } else if ((facts.family === "deal_drop" || facts.family === "market_snapshot") && hasDealFacts(facts)) {
    title = `${money0(facts.marketRefUsd)} Pokemon Card Listed for ${money0(facts.listedUsd)}`;
    factLine = `${name} — live eBay listing at ${money(facts.listedUsd)} vs. a recent market reference of ${money(facts.marketRefUsd)} (${pct(facts.discountPct)} below reference).`;
  } else if (facts.family === "brand_ad") {
    title = `How to Find Underpriced Pokemon Cards on eBay`;
    factLine = `PokemonDealFinder scans live eBay listings and compares each one to a real market reference, so you can see the ones priced below it.`;
  } else {
    const hook = String(facts.hook ?? "").replace(/\s+/g, " ").trim();
    if (!hook) return { ok: false, reason: "no facts and no frozen hook for a YouTube Short" };
    title = hook.length > YT_TITLE_MAX ? hook.slice(0, YT_TITLE_MAX - 1).trimEnd() + "…" : hook;
    factLine = hook;
  }
  if (title.length > YT_TITLE_MAX) title = title.slice(0, YT_TITLE_MAX - 1).trimEnd() + "…";

  const description = [
    factLine,
    ``,
    `See current Pokemon card deals:`,
    `${cta}`,
    ``,
    `Prices and availability can change.`,
    ``,
    DISCLOSURE_LINE,
    ``,
    `#PokemonCards #PokemonTCG`,
  ].join("\n");
  if (description.length > YT_DESC_MAX) return { ok: false, reason: `description ${description.length} > ${YT_DESC_MAX}` };

  return { ok: true, title, description, titleChars: title.length, descChars: description.length };
}

export const COPY_LIMITS = Object.freeze({ X_MAX, YT_TITLE_MAX, YT_DESC_MAX });

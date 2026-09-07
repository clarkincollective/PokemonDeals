// Phase SOCIAL-NEWSROOM-2 - FEED-LEVEL PROFESSIONAL REVIEW +
// AI-SPAM VISUAL-SIGNATURE CHECK (§33, §34, §35).
//
// Individually-fine posts can still form a mass-produced-looking feed.
// This inspects the next N planned posts AS A SEQUENCE for composition
// repetition, colour/branding overload, and commercial feel.
//
// Deterministic. Operates on story + a small render `signature`
// (layout family + coordinates the deterministic renderer used); it does
// NOT need pixels. A vision pass (scripts/socialVisualReview) can
// corroborate but this gate stands alone.
//
// Pure. No I/O.

import { originalityKeys } from "./originalityScore.mjs";
import { bucketFor } from "./pillars.mjs";

export const FEED_VERDICTS = Object.freeze(["FEED_PASS", "FEED_WATCH", "FEED_FAIL"]);

// ceilings over a window of N (default 9-12) planned posts.
export const FEED_CEILINGS = Object.freeze({
  same_layout_family: 0.5, // >50% same layout family -> WATCH
  same_layout_family_fail: 0.7, // >70% -> FAIL
  same_species: 0.34,
  same_hook_grammar: 0.4,
  price_card_share: 0.6, // "here is a discounted card" compositions
  price_card_share_fail: 0.8,
  commercial_share: 0.6, // CONVERSION-bucket pillars
  red_accent_share: 0.5, // market-down / loss framing
  identical_cta_placement: 0.75, // same CTA zone dominating
  branding_share: 0.9, // every post carrying a loud wordmark
});

function feedItems(planned = []) {
  return planned.map((p) => {
    const story = p.story ?? p;
    const sig = p.signature ?? story.facts_json ?? {};
    return {
      keys: originalityKeys(story),
      bucket: story.bucket ?? bucketFor(story.pillar),
      pillar: story.pillar,
      layout_family: sig.layout_family ?? story.series ?? null,
      is_price_card: story.pillar === "DEALS" || story.pillar === "BUDGET",
      red_accent: Boolean(sig.red_accent ?? (story.series === "BIGGEST_MOVERS" && sig.movement_pct < 0)),
      cta_zone: sig.cta_zone ?? "bottom",
      hook_grammar: originalityKeys(story).hook_grammar,
      loud_brand: sig.loud_brand !== false, // default: assume a wordmark lockup is present
    };
  });
}

function topShare(items, fn) {
  const c = {};
  for (const it of items) {
    const k = fn(it);
    if (k != null) c[k] = (c[k] ?? 0) + 1;
  }
  const vals = Object.values(c);
  return items.length ? Math.max(0, ...vals) / items.length : 0;
}

// planned: [{ story, signature? }] in feed order (newest last). windowN
// defaults to min(12, planned.length).
export function feedReview(planned = [], { windowN = null } = {}) {
  const all = feedItems(planned);
  const N = windowN ?? Math.min(12, all.length);
  const items = all.slice(-Math.max(1, N));
  if (items.length < 3) {
    return { verdict: "FEED_PASS", sample: items.length, metrics: {}, warnings: ["feed too short to assess"], blockers: [] };
  }

  const metrics = {
    same_layout_family: Number(topShare(items, (i) => i.layout_family).toFixed(3)),
    same_species: Number(topShare(items, (i) => i.keys.pokemon).toFixed(3)),
    same_hook_grammar: Number(topShare(items, (i) => i.hook_grammar).toFixed(3)),
    price_card_share: Number((items.filter((i) => i.is_price_card).length / items.length).toFixed(3)),
    commercial_share: Number((items.filter((i) => i.bucket === "CONVERSION").length / items.length).toFixed(3)),
    red_accent_share: Number((items.filter((i) => i.red_accent).length / items.length).toFixed(3)),
    identical_cta_placement: Number(topShare(items, (i) => i.cta_zone).toFixed(3)),
    branding_share: Number((items.filter((i) => i.loud_brand).length / items.length).toFixed(3)),
  };

  const warnings = [];
  const blockers = [];
  const check = (key, warnCeil, failCeil) => {
    const v = metrics[key];
    if (failCeil != null && v > failCeil + 1e-9) blockers.push(`${key} = ${(v * 100).toFixed(0)}% > ${failCeil * 100}% (FAIL)`);
    else if (v > warnCeil + 1e-9) warnings.push(`${key} = ${(v * 100).toFixed(0)}% > ${warnCeil * 100}%`);
  };
  check("same_layout_family", FEED_CEILINGS.same_layout_family, FEED_CEILINGS.same_layout_family_fail);
  check("same_species", FEED_CEILINGS.same_species, null);
  check("same_hook_grammar", FEED_CEILINGS.same_hook_grammar, null);
  check("price_card_share", FEED_CEILINGS.price_card_share, FEED_CEILINGS.price_card_share_fail);
  check("commercial_share", FEED_CEILINGS.commercial_share, null);
  check("red_accent_share", FEED_CEILINGS.red_accent_share, null);
  check("identical_cta_placement", FEED_CEILINGS.identical_cta_placement, null);
  check("branding_share", FEED_CEILINGS.branding_share, null);

  const verdict = blockers.length ? "FEED_FAIL" : warnings.length ? "FEED_WATCH" : "FEED_PASS";
  return { verdict, sample: items.length, metrics, warnings, blockers };
}

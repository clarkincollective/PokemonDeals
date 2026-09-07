// Phase 13E.10A - THE HOOK VARIANT LIBRARY (§2, §3, §23).
//
// A bounded, deterministic registry. Each hook has:
//   render(facts)   -> the exact display string (no LLM, no randomness)
//   eligible(facts) -> { ok, reason }   - explicit fact-safety per hook
//
// It BUILDS ON the existing hook engine in lib/social/creativeSpec.mjs
// (DEAL_HOOK_VARIANTS + the shared PRICE_CONTRAST_* / ABS_SAVING_MIN
// thresholds) - never a parallel truth model. New families (QUESTION,
// COLLECTION, MARKET_MOVEMENT, UNDER_PRICE) are added with the same
// "gate on the data actually supporting it" discipline.
//
// `facts` is the frozen deterministic fact object the distribution layer
// already assembles (lib/social/distribution/artifacts.factsFromPayload):
//   { family, cardName?, listedUsd?, marketRefUsd?, discountPct?,
//     movementPct?, movementDirection?, movementWindow?, movementConfidence?,
//     freshnessState?, itemCount?, allUnderThreshold?, underPriceThresholdUsd? }
//
// NO hook infers or invents urgency. NO hook may use a banned phrase (§23).

import { PRICE_CONTRAST_MIN_REF, PRICE_CONTRAST_MIN_RATIO, ABS_SAVING_MIN } from "../creativeSpec.mjs";
import { MOVER_MIN_ABS_CHANGE_PCT } from "../priceMovement.mjs";

// §23 - phrases an experimental hook may NEVER contain (default: never).
export const BANNED_HOOK_PHRASES = Object.freeze([
  /you won'?t believe/i,
  /\bbuy now\b/i,
  /last chance/i,
  /selling fast/i,
  /going fast/i,
  /act now/i,
  /don'?t miss/i,
  /guaranteed (profit|savings|return)/i,
  /easy money/i,
  /\binvest now\b/i,
  /\bmust buy\b/i,
  /once in a lifetime/i,
  /limited (time|stock)/i,
  /only \d+ left/i,
]);

export function hookIsSafe(text) {
  const s = String(text ?? "");
  return !BANNED_HOOK_PHRASES.some((re) => re.test(s));
}

const num = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const money0 = (n) => `$${Math.round(Number(n)).toLocaleString("en-US")}`;
const pctTxt = (frac) => `${Math.round(Math.abs(Number(frac)) * 100)}%`;

function dealBase(f) {
  const listed = num(f.listedUsd);
  const ref = num(f.marketRefUsd);
  const disc = num(f.discountPct);
  return {
    listed,
    ref,
    disc,
    ok: listed != null && listed > 0 && ref != null && ref > 0 && disc != null && disc > 0,
    gap: listed != null && ref != null ? ref - listed : null,
  };
}

// The registry. Keys are the stable hook_variant ids used everywhere
// (planner, batch freeze, dashboard, metrics join).
export const HOOK_VARIANTS = Object.freeze({
  PRICE_CONTRAST: {
    label: "Price contrast",
    requires: ["listedUsd", "marketRefUsd", "meaningful contrast"],
    eligible(f) {
      const b = dealBase(f);
      if (!b.ok) return { ok: false, reason: "needs a valid listed price, market reference and discount" };
      if (!(b.ref >= PRICE_CONTRAST_MIN_REF)) return { ok: false, reason: `market reference ${money0(b.ref)} < ${money0(PRICE_CONTRAST_MIN_REF)} minimum` };
      if (!(b.ref / b.listed >= PRICE_CONTRAST_MIN_RATIO)) return { ok: false, reason: `reference/listed ${(b.ref / b.listed).toFixed(2)} < ${PRICE_CONTRAST_MIN_RATIO} minimum contrast` };
      return { ok: true, reason: "" };
    },
    render(f) {
      const b = dealBase(f);
      return `${money0(b.ref)} CARD. LISTED FOR ${money0(b.listed)}.`;
    },
  },

  DOLLAR_SAVING: {
    label: "Dollar saving",
    requires: ["positive absolute saving", `>= ${money0(ABS_SAVING_MIN)}`],
    eligible(f) {
      const b = dealBase(f);
      if (!b.ok) return { ok: false, reason: "needs a valid listed price and market reference" };
      if (!(b.gap >= ABS_SAVING_MIN)) return { ok: false, reason: `saving ${money0(b.gap ?? 0)} < ${money0(ABS_SAVING_MIN)} minimum` };
      return { ok: true, reason: "" };
    },
    render(f) {
      const b = dealBase(f);
      const name = String(f.cardName ?? "THIS CARD").toUpperCase();
      return `SAVE ${money0(b.gap)} ON ${name}`;
    },
  },

  PERCENT_GAP: {
    label: "Percent gap",
    requires: ["valid discount %", "existing deal qualification"],
    eligible(f) {
      const b = dealBase(f);
      if (!b.ok) return { ok: false, reason: "needs a valid, positive discount %" };
      if (!(b.disc >= 0.1)) return { ok: false, reason: `discount ${pctTxt(b.disc)} below the 10% deal-qualification floor` };
      return { ok: true, reason: "" };
    },
    render(f) {
      const b = dealBase(f);
      return `${pctTxt(b.disc)} BELOW RECENT MARKET`;
    },
  },

  DISCOVERY: {
    label: "Discovery / just found",
    requires: ["freshnessState === JUST_FOUND (the real just-found rule)"],
    eligible(f) {
      if (f.freshnessState !== "JUST_FOUND") return { ok: false, reason: `freshness state is ${f.freshnessState ?? "null"}, not JUST_FOUND` };
      if (!dealBase(f).ok) return { ok: false, reason: "needs a valid discount to state" };
      return { ok: true, reason: "" };
    },
    render(f) {
      const b = dealBase(f);
      return `JUST FOUND: ${pctTxt(b.disc)} BELOW RECENT MARKET`;
    },
  },

  QUESTION: {
    label: "Question (factual, non-manipulative)",
    requires: ["listedUsd", "marketRefUsd"],
    eligible(f) {
      const b = dealBase(f);
      if (!b.ok) return { ok: false, reason: "needs a real listed price and market reference for the question to be factual" };
      return { ok: true, reason: "" };
    },
    render(f) {
      const b = dealBase(f);
      // a plain, single question - no "?!", no "you won't believe"
      return `WOULD YOU PAY ${money0(b.listed)} FOR THIS?`;
    },
  },

  COLLECTION: {
    label: "Collection - found today",
    requires: ["itemCount >= 3", "rendered count == itemCount"],
    eligible(f) {
      const n = num(f.itemCount);
      if (!(n != null && n >= 3)) return { ok: false, reason: `only ${n ?? 0} distinct cards (need >= 3)` };
      return { ok: true, reason: "" };
    },
    render(f) {
      const n = num(f.itemCount);
      return `${n} DEALS WE FOUND TODAY`;
    },
  },

  COLLECTION_BELOW_MARKET: {
    label: "Collection - below market",
    requires: ["itemCount >= 3", "rendered count == itemCount"],
    eligible(f) {
      const n = num(f.itemCount);
      if (!(n != null && n >= 3)) return { ok: false, reason: `only ${n ?? 0} distinct cards (need >= 3)` };
      return { ok: true, reason: "" };
    },
    render(f) {
      const n = num(f.itemCount);
      return `${n} POKEMON CARDS BELOW RECENT MARKET`;
    },
  },

  UNDER_PRICE: {
    label: "Under a price threshold",
    requires: ["itemCount >= 3", "every item <= threshold"],
    eligible(f) {
      const n = num(f.itemCount);
      const t = num(f.underPriceThresholdUsd);
      if (!(n != null && n >= 3)) return { ok: false, reason: `only ${n ?? 0} distinct cards (need >= 3)` };
      if (t == null || t <= 0) return { ok: false, reason: "no price threshold on the candidate" };
      if (f.allUnderThreshold !== true) return { ok: false, reason: "not every item is confirmed under the threshold" };
      return { ok: true, reason: "" };
    },
    render(f) {
      const n = num(f.itemCount);
      const t = num(f.underPriceThresholdUsd);
      return `${n} POKEMON CARDS UNDER ${money0(t)}`;
    },
  },

  MARKET_MOVEMENT: {
    label: "Market movement",
    requires: ["family === market_mover", `|movement| >= ${MOVER_MIN_ABS_CHANGE_PCT}%`, "confident trend (not low)"],
    eligible(f) {
      if (f.family !== "market_mover") return { ok: false, reason: `family is ${f.family}, not market_mover` };
      const m = num(f.movementPct);
      if (m == null) return { ok: false, reason: "no movement % on the candidate" };
      if (Math.abs(m) * 100 < MOVER_MIN_ABS_CHANGE_PCT) return { ok: false, reason: `movement ${pctTxt(m)} < ${MOVER_MIN_ABS_CHANGE_PCT}% minimum` };
      if (f.movementConfidence === "low") return { ok: false, reason: "trend confidence is low - fail closed" };
      if (f.movementDirection !== "up" && f.movementDirection !== "down") return { ok: false, reason: "no confident movement direction" };
      return { ok: true, reason: "" };
    },
    render(f) {
      const m = num(f.movementPct);
      const dir = f.movementDirection === "up" ? "UP" : "DOWN";
      const win = f.movementWindow ? ` OVER ${String(f.movementWindow).toUpperCase()}` : "";
      return `THIS CARD IS ${dir} ${pctTxt(m)}${win}`;
    },
  },
});

export const HOOK_IDS = Object.freeze(Object.keys(HOOK_VARIANTS));

// Render a hook, refusing an ineligible or unsafe result.
// Returns { ok, text, reason }.
export function renderHook(hookId, facts = {}) {
  const h = HOOK_VARIANTS[hookId];
  if (!h) return { ok: false, text: null, reason: `unknown hook "${hookId}"` };
  const elig = h.eligible(facts);
  if (!elig.ok) return { ok: false, text: null, reason: elig.reason };
  const text = h.render(facts);
  if (!hookIsSafe(text)) return { ok: false, text: null, reason: "rendered hook contains a banned phrase (§23)" };
  return { ok: true, text, reason: "" };
}

export function hookEligible(hookId, facts = {}) {
  const h = HOOK_VARIANTS[hookId];
  return h ? h.eligible(facts) : { ok: false, reason: `unknown hook "${hookId}"` };
}

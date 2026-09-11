// Phase 17B - the card page "How much is <exact card> worth?" answer, and
// the printing identity it states. Pure and dependency-light (relative
// imports only) so `node --test` can exercise it directly.
//
// The rule for every statement produced here: it comes from a stored or
// provider-supplied field for THIS printing, or it is not made.
//   * the value is the SAME raw Near Mint market reference the page's
//     "Price & value" box shows (PokemonPriceTracker, recent sold data) -
//     never a re-derived, averaged or guessed figure;
//   * no value -> an explicit "no reliable price" answer, never a number;
//   * printing details come from the catalogue name / set / rarity /
//     collector number, or from the provider's printing list - a variant
//     is never inferred from artwork, a nickname or the card's era.

import { catalogCardIdentity } from "./cardSlug.js";

// PokemonPriceTracker's "no data" repdigit placeholders (identical to
// lib/pokemonPriceTracker.js SENTINEL_PRICES; a test pins the two).
export const WORTH_SENTINEL_PRICES = Object.freeze([999, 999.99, 9999, 9999.99, 99999, 99999.99]);

export function isUsableUsdPrice(v) {
  if (v == null || v === "" || typeof v === "boolean") return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && !WORTH_SENTINEL_PRICES.includes(n);
}

// Rarity values the catalogue uses for "unknown" - not an attribute.
const NON_RARITIES = new Set(["none", "unconfirmed", ""]);

// A catalogue name carries its printing notes as parentheticals / square
// brackets - "Charizard GX (Shiny)", "Pikachu (Cosmos Holo)", "Buddy-Buddy
// Poffin - 144/162 (North America International Championship) [Staff]".
// The "(#NN)" / "(123)" collector-number parenthetical is identity, not a
// printing note, and is excluded.
function nameNotes(name) {
  const out = [];
  for (const m of String(name ?? "").matchAll(/\(([^()]+)\)|\[([^\[\]]+)\]/g)) {
    const note = (m[1] ?? m[2] ?? "").trim();
    if (!note || /^#?\s*[A-Za-z]{0,3}\d+(\/[A-Za-z]{0,3}\d+)?$/.test(note)) continue;
    out.push(note);
  }
  return out;
}

// The printing attributes this page can PROVE for the card:
//   notes       - printing notes from the catalogue name, plus "Shadowless"
//                 when the catalogue SET is the Shadowless print run
//                 (TCGplayer models Shadowless as its own set, e.g.
//                 "Base Set (Shadowless)")
//   rarity      - the stored rarity (unknown placeholders dropped)
//   promo       - stored rarity "Promo" or a promo set
//   cardNumber  - the stored collector number
// No "1st Edition", "Unlimited", "Reverse Holo" or year is ever produced
// here: the catalogue does not store them per product (verified Phase
// 17B: 0 of 29,343 English rows contain "1st Edition").
export function printingDetails({ name, set, rarity = null, cardNumber = null } = {}) {
  const notes = nameNotes(name);
  if (/\(shadowless\)/i.test(String(set ?? "")) && !notes.some((n) => /shadowless/i.test(n))) notes.push("Shadowless");
  const r = rarity == null ? "" : String(rarity).trim();
  const cleanRarity = NON_RARITIES.has(r.toLowerCase()) ? null : r;
  const promo = (cleanRarity != null && /^promo$/i.test(cleanRarity)) || /\bpromo/i.test(String(set ?? ""));
  const num = cardNumber != null && String(cardNumber).trim() ? String(cardNumber).trim() : null;
  return { notes: [...new Set(notes)], rarity: cleanRarity, promo, cardNumber: num };
}

// "2026-09-11T04:12:00Z" -> "September 11, 2026" (UTC), or null when the
// value is not a real past-or-present timestamp (a future "last updated"
// is a provider clock error, not freshness - it is dropped, not shown).
export function formatUpdatedOn(value, nowMs) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (Number.isFinite(nowMs) && d.getTime() > nowMs + 86_400_000) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function formatUsd(n) {
  const v = Number(n);
  const digits = v >= 100 ? 0 : 2;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// Does the page's Price & value box show at least one graded tier? Mirrors
// components/CardPriceSummary's own filter exactly (real price, >= 1
// recorded sale, not below the raw Near Mint reference), so the answer
// never points at graded prices the page doesn't display.
export function pageShowsGraded(analysis) {
  const raw = analysis?.raw?.currentPrice;
  const rawNm = isUsableUsdPrice(raw) ? Number(raw) : null;
  return (analysis?.graded ?? []).some(
    (g) => isUsableUsdPrice(g?.currentPrice) && g.saleCount > 0 && (rawNm == null || Number(g.currentPrice) >= rawNm)
  );
}

// Build the answer. Inputs are exactly what the page already rendered:
//   marketUsd          - the raw NM reference the Price & value box shows
//                        (null when the page shows none)
//   priceSource        - "analysis" (live PokemonPriceTracker record) or
//                        "catalog" (the daily-synced catalogue copy of it,
//                        used by the page only when the live call failed)
//   priceUpdatedAt     - provider's prices.lastUpdated (analysis only)
//   firstEditionExcluded - provider lists a 1st Edition printing and the
//                        figure is the non-1st-Edition one
//   gradedAvailable    - the page shows at least one graded tier
//   liveListings       - { count, lowUsd } of active listings, or null
//                        (no live-deal hub for this card)
// Returns a plain object; the component only renders it.
export function cardWorthAnswer({
  name,
  set,
  cardNumber = null,
  rarity = null,
  marketUsd = null,
  priceSource = null,
  priceUpdatedAt = null,
  firstEditionExcluded = false,
  gradedAvailable = false,
  liveListings = null,
  nowMs = null,
} = {}) {
  const identity = catalogCardIdentity(name, cardNumber);
  const setName = String(set ?? "").trim();
  const subject = setName ? `${identity} from ${setName}` : identity;
  const printing = printingDetails({ name, set, rarity, cardNumber });
  const question = `How much is ${subject} worth?`;

  const live =
    liveListings && Number(liveListings.count) > 0
      ? { count: Number(liveListings.count), lowUsd: isUsableUsdPrice(liveListings.lowUsd) ? Number(liveListings.lowUsd) : null }
      : null;

  if (!isUsableUsdPrice(marketUsd)) {
    return { status: "unavailable", question, subject, identity, set: setName, printing, gradedAvailable: Boolean(gradedAvailable), live };
  }

  const value = Number(marketUsd);
  return {
    status: "priced",
    question,
    subject,
    identity,
    set: setName,
    printing,
    marketUsd: value,
    marketText: `${formatUsd(value)} USD`,
    condition: "raw (ungraded), Near Mint",
    source: priceSource === "catalog" ? "catalog" : "analysis",
    // freshness only from the live provider record; the catalogue copy
    // carries no trustworthy "changed on" date, so none is claimed for it
    updatedOn: priceSource === "catalog" ? null : formatUpdatedOn(priceUpdatedAt, nowMs),
    firstEditionExcluded: Boolean(firstEditionExcluded),
    gradedAvailable: Boolean(gradedAvailable),
    live,
  };
}

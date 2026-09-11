// PRICE-CONDITION PROVENANCE (2026-09-11) - the one place that turns a
// reference's real condition into public wording.
//
// A raw market reference is not always a Near Mint figure (see
// pickMarketReference in lib/pokemonPriceTracker.js): for some printings
// the provider prices only a played condition, and for a headline
// aggregate it does not state the condition at all. Every label the site
// prints must therefore come from the reference's recorded condition:
//   known    -> "raw, Lightly Played" / "raw (ungraded), Lightly Played"
//   Near Mint-> "raw, Near Mint"      / "raw (ungraded), Near Mint"
//   unknown  -> "raw market reference"/ "raw (ungraded)" and the figure is
//               called a "market reference price", never a Near Mint one.
// Dependency-free (relative imports only) so `node --test` runs it as-is.

export const REFERENCE_CONDITION_TIERS = Object.freeze([
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
]);

// A stored / provider condition string -> one of the five tiers, or null.
// Substring match on purpose ("Lightly Played Unlimited Holofoil").
export function normalizeReferenceCondition(value) {
  const s = String(value ?? "").toLowerCase();
  if (!s) return null;
  return REFERENCE_CONDITION_TIERS.find((t) => s.includes(t.toLowerCase())) ?? null;
}

export function referenceConditionLabels(condition) {
  const tier = normalizeReferenceCondition(condition);
  if (tier) {
    return {
      condition: tier,
      known: true,
      isNearMint: tier === "Near Mint",
      short: tier, // badge text
      raw: `raw, ${tier}`, // "Market value · raw, Near Mint"
      worth: `raw (ungraded), ${tier}`, // "for a raw (ungraded), Near Mint copy"
      noun: "market price",
    };
  }
  return {
    condition: null,
    known: false,
    isNearMint: false,
    short: "Market reference",
    raw: "raw market reference",
    worth: "raw (ungraded)",
    noun: "market reference price",
  };
}

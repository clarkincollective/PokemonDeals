// ONE shared deal-quality gate. "Cheap != good deal" - before a listing
// gets green deal treatment / a savings % / Top-Deal or country / species /
// set ranking, it must be COMPARABLE to the market reference: right card
// (lib/dealMatching listingMatchesCard) + compatible CONDITION + compatible
// LANGUAGE. This module owns the condition + language halves and the single
// isDisplayableDeal() predicate every prominent surface runs.
//
// CJS: imported by the scanner (app/api/refresh-deals), the external feed
// (app/api/ingest-feed) AND lib/deals.js display funnels - defense in
// depth, so a row accepted before these rules existed still fails at
// display time.

const {
  CONDITION_TIERS,
  detectListingCondition,
  worseCondition,
} = require("./dealMatching");
const { cardConditionToTier } = require("./ebay");

// ---------------------------------------------------------------------------
// CONDITION
// ---------------------------------------------------------------------------

// Strong physical-damage vocabulary that a normal/raw market reference must
// never be advertised against. These are ON TOP OF dealMatching's
// CONDITION_SIGNALS (which already covers damaged/dmg/water damage/bent/
// creased/torn/stained/poor condition and the [LP]/[MP]/HP-tag forms).
// Token/whole-word anchored - NOT naive substring - so "altered" matches
// but "altared"/"salt" don't, and the card's own "200HP" hit-points stat
// is never read as a condition (that's dealMatching's job and it already
// excludes bare HP).
const DAMAGE_TITLE_PATTERNS = [
  /\baltered\b/i,
  /\bpin\s?holes?\b/i,
  /\bhole[\s-]?punch(?:ed)?\b/i,
  /\bpunch(?:ed)?\s?holes?\b/i,
  /\bwater[\s-]?damaged?\b/i,
  /\bwarp(?:ed|ing)?\b/i,
  /\bpeel(?:ing|ed)?\b/i,
  /\brip(?:ped)?\b/i,
  /\btorn\b/i,
  /\btear\b/i,
  /\bdent(?:ed|s)?\b/i,
  /\bwrit(?:ten|ing)\b/i,
  /\binked\b/i,
  /\bmarker\b/i,
  /\bfor\s+parts\b/i,
  /\bdestroyed\b/i,
  /\bmajor\s+creas/i,
  /\bheav(?:y|ily)\s*(?:crease|damage|wear)/i,
  // "poor" as a stated grade, not "poor centering" as a passing remark:
  // trailing "... POOR", "(Poor)", "- Poor", "condition: poor".
  /\bpoor\s*condition\b/i,
  /\(\s*poor\s*\)/i,
  /[-–—:]\s*poor\b/i,
  /\bpoor\s*$/i,
];

// eBay's flat item.condition string, per marketplace, when it actually
// carries a played/damaged tier (rare for singles - usually just
// "Ungraded"/"Non gradata"/... which say nothing). Maps to a TCG tier or
// null. Kept small + explicit; the authoritative signal is the structured
// "Card Condition" conditionDescriptor, handled by cardConditionToTier.
function ebayFlatConditionTier(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s) return null;
  if (/damaged|daman|endommag|beschädigt|danneggiat|dañad/.test(s)) return "Damaged";
  if (/heavily played|stark gespielt|molto giocat/.test(s)) return "Heavily Played";
  if (/moderately played|mäßig gespielt|mediamente giocat/.test(s)) return "Moderately Played";
  if (/lightly played|leicht gespielt|poco giocat|played|gespielt|giocat|jugad/.test(s)) return "Lightly Played";
  if (/near mint|nm|neuwertig|quasi nuov|nuovo di zecca/.test(s)) return "Near Mint";
  return null;
}

// The single normalized condition for a listing, worst-wins across every
// available signal. `descriptorContent` is the eBay structured "Card
// Condition" conditionDescriptor value (STRONGEST - only present from a
// getItem/legacy-id fetch, never from search). `ebayCondition` is the flat
// item.condition. `title` is the listing title. Returns a CONDITION_TIERS
// string, or "Unknown" when nothing gives a real signal AND the flat
// condition is an uninformative "ungraded"-style value.
function classifyListingCondition({ title = "", ebayCondition = null, descriptorContent = null } = {}) {
  const signals = [];

  const structured = cardConditionToTier(descriptorContent);
  if (structured) signals.push(structured);

  const flat = ebayFlatConditionTier(ebayCondition);
  if (flat) signals.push(flat);

  if (DAMAGE_TITLE_PATTERNS.some((re) => re.test(title))) signals.push("Damaged");

  // dealMatching's existing title parser (CONDITION_PAIR + CONDITION_SIGNALS
  // + the collector-number-then-HP tag). Returns "Near Mint" when it finds
  // nothing - only treat that as a real signal if the parser actually
  // matched something worse.
  const titleTier = detectListingCondition(title);
  if (titleTier !== "Near Mint") signals.push(titleTier);

  if (signals.length === 0) {
    // No wear signal anywhere. If eBay's flat value is a real "this is a
    // near mint listing" we can say so; otherwise it's genuinely unknown
    // (do not invent "Near Mint" - that's the caller's conservative
    // default, made explicitly).
    return "Unknown";
  }

  return signals.reduce((worst, t) => worseCondition(worst, t), "Near Mint");
}

// Tiers we will advertise a listing against a NORMAL / raw / Near-Mint
// market reference. NM always; LP only because methodology already prices
// LP-tagged listings against real LP data when it exists (selectConditionPrice)
// - callers that have NO condition-specific reference should pass
// requireExactRef=true to drop LP too. MP / HP / Damaged: never against a
// normal-market reference. "Unknown": allowed (conservative - we don't
// retroactively brand every unmarked listing as played), the ingestion-side
// structured check is what tightens genuine unknowns going forward.
const PROMOTABLE_TIERS = new Set(["Near Mint", "Lightly Played", "Unknown"]);

function conditionAllowsPromotion(tier, { requireExactRef = false } = {}) {
  if (tier == null) return true;
  if (requireExactRef) return tier === "Near Mint" || tier === "Unknown";
  return PROMOTABLE_TIERS.has(tier);
}

// ---------------------------------------------------------------------------
// LANGUAGE
// ---------------------------------------------------------------------------

// Strong, whole-word language evidence in a listing title / item-specific.
// Marketplace does NOT imply language (a Japanese card sells fine on
// ebay.com / ebay.com.au). Order: most specific first. "en"/"jp" 2-letter
// tokens are deliberately NOT here - too noisy.
const LANGUAGE_PATTERNS = [
  ["japanese", /\bjapan(?:ese)?\b|\bjpn?\b|日本語|ポケモン/i],
  ["korean", /\bkorean?\b|\bkor\b|한국어|포켓몬/i],
  ["chinese", /\bchinese\b|simplified chinese|traditional chinese|\bcht\b|\bchs\b|中文|寶可夢|宝可梦/i],
  ["german", /\bgerman\b|\bdeutsch\b/i],
  ["french", /\bfrench\b|\bfran[çc]ais\b/i],
  ["spanish", /\bspanish\b|\bespa[ñn]ol\b/i],
  ["italian", /\bitalian\b|\bitaliano\b/i],
  ["portuguese", /\bportuguese\b|\bportugu[êe]s\b/i],
  ["english", /\benglish\b|\beng\b/i],
];

// The listing's language if the title/specifics state one strongly, else
// "unknown". `itemSpecificLanguage` (eBay "Language" item-specific) wins
// when present.
function classifyListingLanguage({ title = "", itemSpecificLanguage = null } = {}) {
  if (itemSpecificLanguage) {
    for (const [lang, re] of LANGUAGE_PATTERNS) {
      if (re.test(String(itemSpecificLanguage))) return lang;
    }
  }
  for (const [lang, re] of LANGUAGE_PATTERNS) {
    if (re.test(title)) return lang;
  }
  return "unknown";
}

// Is a listing in `listingLang` allowed to be a deal for a catalogue row in
// `cardLang`? Rule is MATCH, not "english only": a Japanese listing is a
// legitimate deal for a Japanese catalogue row. "unknown" listing language
// is allowed (don't invent a foreign-language status with no evidence).
function languageCompatible(listingLang, cardLang) {
  const card = String(cardLang || "english").toLowerCase();
  if (!listingLang || listingLang === "unknown") return true;
  return listingLang === card;
}

// ---------------------------------------------------------------------------
// THE SHARED DISPLAY / RANKING GATE
// ---------------------------------------------------------------------------

// Runs on a raw `deals` row (before withCard()). Cheap, no I/O - a pure
// re-derivation from fields already stored, so a historically-accepted row
// that would fail today's rules is excluded from every prominent surface
// even though it's still is_active. Graded deals are priced against
// grade-specific sold data, so the raw-condition gate does not apply to
// them (their own grade string is the "condition").
function isDisplayableDeal(row) {
  if (!row) return false;
  if (row.is_active === false) return false;
  // An explicit disqualification (backfill / future scanner writes) - honour
  // it if the column exists; absent column -> undefined -> ignored.
  if (row.disqualified_reason) return false;

  if (row.is_graded) return true;

  const tier = classifyListingCondition({
    title: row.title ?? "",
    ebayCondition: row.condition ?? null,
    // stored rows have no structured descriptor; the scanner/backfill bake
    // the result into `condition` when they have one.
    descriptorContent: null,
  });
  if (!conditionAllowsPromotion(tier)) return false;

  const listingLang = classifyListingLanguage({ title: row.title ?? "" });
  const cardLang = row.card_language ?? row.watchlist?.language ?? "english";
  if (!languageCompatible(listingLang, cardLang)) return false;

  return true;
}

// Reason string for the audit trail / backfill, or null if the row is fine.
// Used by the backfill script and (optionally) the scanner.
function disqualificationReason(row, { descriptorContent = null, itemSpecificLanguage = null } = {}) {
  if (!row || row.is_graded) return null;
  const tier = classifyListingCondition({
    title: row.title ?? "",
    ebayCondition: row.condition ?? null,
    descriptorContent,
  });
  if (!conditionAllowsPromotion(tier)) return `condition:${tier.toLowerCase().replace(/\s+/g, "_")}`;

  const listingLang = classifyListingLanguage({ title: row.title ?? "", itemSpecificLanguage });
  const cardLang = row.card_language ?? row.watchlist?.language ?? "english";
  if (!languageCompatible(listingLang, cardLang)) return `language:${listingLang}_vs_${cardLang}`;

  return null;
}

module.exports = {
  DAMAGE_TITLE_PATTERNS,
  classifyListingCondition,
  conditionAllowsPromotion,
  ebayFlatConditionTier,
  LANGUAGE_PATTERNS,
  classifyListingLanguage,
  languageCompatible,
  isDisplayableDeal,
  disqualificationReason,
};

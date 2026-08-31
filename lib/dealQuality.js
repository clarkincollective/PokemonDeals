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

// Only pure, dependency-free helpers - this module is imported by client
// components (DealCard) for conditionLabel(), so it must not pull in
// lib/ebay (fetch/Buffer) or anything server-only.
const { detectListingCondition, worseCondition } = require("./dealMatching");

// eBay's structured "Card Condition" descriptor content -> a TCG tier, or
// null. Local copy of lib/ebay's cardConditionToTier (kept in sync) so this
// file stays free of lib/ebay's server-only deps. Order matters: "damaged"
// and "heavily" before the bare "(Poor)" grade word.
function cardConditionToTier(content) {
  const s = String(content || "").toLowerCase();
  if (!s) return null;
  if (/damaged/.test(s)) return "Damaged";
  if (/heav(?:y|ily)\s*play/.test(s)) return "Heavily Played";
  if (/moderate(?:ly)?\s*play|very\s*good/.test(s)) return "Moderately Played";
  if (/light(?:ly)?\s*play|excellent/.test(s)) return "Lightly Played";
  if (/near\s*mint|\bmint\b/.test(s)) return "Near Mint";
  return null;
}

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

  // A lone condition abbreviation as the LAST token of the title, after a
  // letter (NOT a number - a real hit-points mention is always "90 HP" /
  // "90HP"). Sellers of worn vintage cards tail the title this way -
  // verified on Raikou H26 Skyridge ("...Holo Rare Skyridge HP"),
  // structured descriptor "Heavily played (Poor)". dealMatching only
  // catches "HP" when it directly follows a "N/N" collector number.
  const trailingAbbr = title.match(/[a-z][)\]\s]+\s*(hp|mp|lp|pl|gd|vg|pr)\s*$/i);
  if (trailingAbbr) {
    signals.push({ hp: "Heavily Played", mp: "Moderately Played", pl: "Moderately Played", gd: "Moderately Played", vg: "Lightly Played", lp: "Lightly Played", pr: "Damaged" }[trailingAbbr[1].toLowerCase()]);
  }

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

// THREE SEPARATE CONCEPTS - never overload one field:
//   1. GRADING STATUS   - "Ungraded" | "PSA 9" | "CGC 9.5" | ...  (is_graded
//      + grader + grade). "Ungraded" is NOT a physical condition.
//   2. PHYSICAL CONDITION - Near Mint | Lightly Played | Moderately Played |
//      Heavily Played | Damaged | Unknown.
//   3. CONFIDENCE        - did we establish (1)/(2) from real evidence, or
//      assume it? A missing signal is "Unknown", never Near Mint.
const PHYSICAL_CONDITION_TIERS = new Set([
  "Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged",
]);

// eBay's flat grading-status strings (per marketplace) that carry NO
// physical-wear information. Stored verbatim on older rows as `condition`;
// must normalize to "Unknown", never "Near Mint".
const GRADING_STATUS_RE =
  /^(ungraded|not graded|non gradata|non gradée|non gradee|nicht bewertet|sin clasificar|sem classifica|graded|valutata|bewertet|usato|used|unspecified|not specified|--|-)?$/i;

// A stored `deals.condition` value -> a physical-condition tier, or
// "Unknown". A grading-status string ("Ungraded" / "Non gradata" / ...),
// null, or anything unrecognised is "Unknown" - NOT Near Mint.
function physicalConditionOf(storedCondition) {
  const s = String(storedCondition ?? "").trim();
  if (PHYSICAL_CONDITION_TIERS.has(s)) return s;
  if (!s || GRADING_STATUS_RE.test(s)) return "Unknown";
  // A localized "Near mint or better" etc. that slipped into the column.
  const tier = ebayFlatConditionTier(s);
  return tier ?? "Unknown";
}

// Tiers we will advertise a listing against a NORMAL / raw / Near-Mint
// market reference. NM always; LP only because methodology prices LP-tagged
// listings against real LP data when it exists (selectConditionPrice) -
// callers with NO condition-specific reference pass requireExactRef=true to
// drop LP too. MP / HP / Damaged: never. "Unknown" / null / unrecognised:
// NEVER promotable - a missing physical condition is not proof of Near
// Mint. An Unknown listing may still be stored/discovered, it just gets no
// green deal styling, no trustworthy savings %, no Top/Best-Finds ranking.
function conditionAllowsPromotion(tier, { requireExactRef = false } = {}) {
  if (tier == null || tier === "Unknown") return false;
  if (!PHYSICAL_CONDITION_TIERS.has(tier)) return false;
  if (requireExactRef) return tier === "Near Mint";
  return tier === "Near Mint" || tier === "Lightly Played";
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
// EXACT-LISTING DESTINATION - a verified deal's CTA must open the ONE
// eBay listing it was priced/verified against, never a /p/<epid> product
// group, a /sch/ search, the homepage, or a different listing.
// ---------------------------------------------------------------------------

// The legacy (numeric) item id from a stored listing_id ("v1|<legacy>|0")
// or a bare number. Local copy of discoveryLog.legacyIdFromListingId so
// this module stays dependency-light for the client bundle.
function legacyItemId(listingId) {
  const s = String(listingId ?? "");
  const m = s.match(/^v\d+\|(\d+)\|/) || s.match(/^(\d+)$/);
  return m ? m[1] : null;
}

// The legacy item id embedded in an eBay /itm/ URL, or null for /p/,
// /sch/, homepage, category, or anything else.
function legacyIdFromEbayUrl(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (!/\.ebay\./.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/itm\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// True only when the deal's outbound CTA (affiliate url, or the plain
// listing url as a fallback) is an item-specific /itm/<id> View Item URL
// whose id matches the stored listing_id. A /p/<epid>, /sch/, missing,
// malformed, or mismatched-id destination fails - such a row must not be
// promoted as a verified deal.
function isExactEbayDealDestination(row) {
  if (!row) return false;
  const want = legacyItemId(row.listing_id);
  const got = legacyIdFromEbayUrl(row.affiliate_url) ?? legacyIdFromEbayUrl(row.listing_url);
  if (!got) return false; // /p/, /sch/, homepage, missing, malformed
  if (want && got !== want) return false; // points at a DIFFERENT listing
  return true;
}

// A listed AUCTION whose end time has passed is not a live deal - the
// listing is retired and eBay redirects its /itm/ url to the product
// group. A fixed-price listing has no end time; unknown/absent end time
// is treated as still live (the scanner's own reconcile handles those).
function auctionEnded(row, now = Date.now()) {
  if (!row || row.listing_type !== "AUCTION" || !row.auction_end_at) return false;
  const end = Date.parse(row.auction_end_at);
  return Number.isFinite(end) && end < now;
}

// ---------------------------------------------------------------------------
// THE SHARED DISPLAY / RANKING GATE
// ---------------------------------------------------------------------------

// The physical-condition tier to JUDGE a stored deal row by: the stored
// `condition` (normalized - "Ungraded"/null -> "Unknown"), made worse by
// anything the title reveals ("... Altered Pin Holes" on a row stored
// "Near Mint" -> Damaged). Never upgrades a stored tier.
function storedDealCondition(row) {
  const stored = physicalConditionOf(row.condition);
  const fromTitle = classifyListingCondition({ title: row.title ?? "" }); // title-only
  if (fromTitle === "Unknown") return stored;
  if (stored === "Unknown") return fromTitle;
  return worseCondition(stored, fromTitle);
}

// Runs on a raw `deals` row (before withCard()). Cheap, no I/O - a pure
// re-derivation from fields already stored, so a historically-accepted row
// that would fail today's rules (a played/damaged card, a wrong-language
// print, or one whose physical condition was never actually established)
// is excluded from every prominent surface even while it's still
// is_active. Graded deals are priced against grade-specific sold data, so
// the raw-condition gate doesn't apply to them.
function isDisplayableDeal(row) {
  if (!row) return false;
  if (row.is_active === false) return false;
  if (row.disqualified_reason) return false; // explicit; ignored if column absent

  // Every deal (graded included): the CTA must open the exact listing we
  // priced, and an ended auction is not live.
  if (!isExactEbayDealDestination(row)) return false;
  if (auctionEnded(row)) return false;

  if (row.is_graded) return true;

  if (!conditionAllowsPromotion(storedDealCondition(row))) return false;

  const listingLang = classifyListingLanguage({ title: row.title ?? "" });
  const cardLang = row.card_language ?? row.watchlist?.language ?? "english";
  if (!languageCompatible(listingLang, cardLang)) return false;

  return true;
}

// A safe UI label for a deal's condition - NEVER "Near Mint" by default.
// Graded -> "PSA 10" etc. Unknown / grading-status / null -> "Condition
// not verified". A real physical tier -> that tier.
function conditionLabel(row) {
  if (!row) return "Condition not verified";
  if (row.is_graded) return `${row.grader ?? "Graded"} ${row.grade ?? ""}`.trim();
  const tier = storedDealCondition(row);
  return tier === "Unknown" ? "Condition not verified" : tier;
}

// Reason string for the audit trail / backfill, or null if the row is fine.
// Used by the backfill script and (optionally) the scanner.
function disqualificationReason(row, { descriptorContent = null, itemSpecificLanguage = null } = {}) {
  if (!row) return null;
  if (!isExactEbayDealDestination(row)) return "destination:non_exact";
  if (auctionEnded(row)) return "auction_ended";
  if (row.is_graded) return null;
  // With structured evidence, classify fresh; otherwise judge the stored row.
  const tier = descriptorContent
    ? classifyListingCondition({ title: row.title ?? "", ebayCondition: row.condition ?? null, descriptorContent })
    : storedDealCondition(row);
  if (tier === "Unknown") return "condition:unknown_unverified";
  if (!conditionAllowsPromotion(tier)) return `condition:${tier.toLowerCase().replace(/\s+/g, "_")}`;

  const listingLang = classifyListingLanguage({ title: row.title ?? "", itemSpecificLanguage });
  const cardLang = row.card_language ?? row.watchlist?.language ?? "english";
  if (!languageCompatible(listingLang, cardLang)) return `language:${listingLang}_vs_${cardLang}`;

  return null;
}

// High-value vintage raw cards need POSITIVE condition evidence before a
// big-discount green badge - an unknown-condition cheap worn copy against a
// high NM reference is the exact fake-deal this guards. Set list mirrors
// lib/dealCategories VINTAGE_SETS.
const VINTAGE_SET_RE =
  /\b(base set|shadowless|jungle|fossil|team rocket|gym heroes|gym challenge|neo (genesis|discovery|revelation|destiny)|legendary collection|expedition|aquapolis|skyridge|southern islands|wotc)\b/i;

function isHighValueVintage({ set, marketPrice } = {}) {
  return VINTAGE_SET_RE.test(String(set ?? "")) && Number(marketPrice) >= 60;
}

module.exports = {
  DAMAGE_TITLE_PATTERNS,
  PHYSICAL_CONDITION_TIERS,
  classifyListingCondition,
  physicalConditionOf,
  storedDealCondition,
  conditionAllowsPromotion,
  conditionLabel,
  ebayFlatConditionTier,
  isHighValueVintage,
  LANGUAGE_PATTERNS,
  classifyListingLanguage,
  languageCompatible,
  legacyItemId,
  legacyIdFromEbayUrl,
  isExactEbayDealDestination,
  auctionEnded,
  isDisplayableDeal,
  disqualificationReason,
};

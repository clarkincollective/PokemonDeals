// Shared between the scheduled scanner (app/api/refresh-deals) and the
// on-demand card search (app/api/card-search) - both need the exact same
// rules for "is this eBay listing actually the card we think it is, and
// is the seller trustworthy enough to believe the price."

// Filters out obviously-wrong/scam-tier listings (e.g. a $2 "Charizard"
// that's actually a proxy or the wrong item) rather than genuine deals.
const SANITY_FLOOR_PCT = 0.25;
const MIN_SELLER_FEEDBACK_PCT = 95;
const MIN_SELLER_FEEDBACK_SCORE = 10;

// "Choose your card" / "pick your card" listings sell a pool of cards at
// one price - the listing's price isn't actually for the specific card
// we matched it to, so it can't be trusted for a discount calculation.
// acrylic/sketch/coa/fan art/original art catch novelty items (display
// cases, hand-drawn "sketch cards") that aren't the actual TCG card but
// still legitimately mention the card's name in their title.
const EXCLUDED_TITLE_PATTERN =
  /\b(lot|bundle|playset|proxy|custom|repack|digital|code|acrylic|sketch|coa)\b|choose your|pick your|fan ?art|original art|case card|display case|trading service|pokemon ?go\b|account trade/i;

// ---------------------------------------------------------------------------
// STAGE 0 - is this listing actually a Pokemon TRADING CARD at all?
// ---------------------------------------------------------------------------
//
// This runs BEFORE listingMatchesCard. A listing can carry the exact
// Pokemon name, set and collector number in its title and still be
// merchandise that is never comparable to a real card's market price -
// verified live on deal 24217 ("Pokemon TCG Lickitung IR 180/162 SV05
// Temporal Forces Novelty Keychain": every name/set/number token present,
// matched the real Illustration Rare, priced against its $30 market).
//
// Deliberately keys on PRODUCT TYPE nouns only, never on material/finish/
// edition words. "metal", "gold", "gold star", "metal energy", "promo",
// "jumbo", "1st edition" are all legitimate real TCG products and must NOT
// trip this gate - the question is "is it a card", not "what is it made
// of". "jumbo"/oversized is a real (if separately-priced) card and is
// intentionally absent here.
const NON_CARD_MERCHANDISE_PATTERN = new RegExp(
  [
    "key\\s?chain", "key\\s?ring", "keyring", "key-ring",
    "necklace", "pendant", "bracelet", "earrings?", "jewell?ery", "lanyard", "brooch",
    "enamel\\s?pin", "lapel\\s?pin", "pin\\s?badge", "pinback",
    "\\bbadge\\b", "\\bsticker\\b", "\\bdecal\\b", "\\bposter\\b",
    "plush(?:ie|y)?", "figurine", "\\bfigure\\b", "funko\\b", "nendoroid",
    "keycap", "\\bmagnet\\b", "\\bornament\\b", "\\bcoaster\\b", "\\bplaque\\b",
    "acrylic\\s?(?:stand|charm|figure|block)", "standee", "nameplate",
    "phone\\s?case", "phone\\s?cover", "air\\s?pods?\\b",
    "play\\s?mat", "mouse\\s?pad", "mousepad", "\\bpillow\\b", "cushion", "\\bblanket\\b",
    "\\btumbler\\b", "bottle\\s?opener", "\\bbookmark\\b", "\\bwallet\\b",
    "\\bcosplay\\b",
    // NOTE: proxy / custom / replica / fan-made / bootleg / orica are NOT
    // here - a proxy is a card-shaped object, just not a genuine one. They
    // belong to the AUTHENTICITY stage below (reason
    // "authenticity:proxy_or_counterfeit"), not "type:not_a_card".
    // "reprint" is also intentionally absent - the XY Evolutions /
    // Celebrations Classic Collection reprints are legitimate, catalogued
    // TCG cards.
    "binder\\s?(?:insert|page)", "\\bart\\s?insert\\b", "\\bart\\s?case\\b", "deck\\s?box", "card\\s?case",
    "\\btazo\\b", "\\bpog\\b", "\\bfridge\\b",
  ].join("|"),
  "i"
);

// EMPTY / WRAPPER-ONLY PACKAGING. The seller is honestly selling the
// discarded foil wrapper of a booster pack, an empty pack, or an empty
// box / tin / ETB - collectors buy these for the artwork - not a card.
// Verified live on deal 13152 ("Pokemon TCG Base Set 1999 Empty Wrapper
// Pack 'Blastoise Cover' # 2": matched Blastoise / Base Set 2, priced
// against the $152 card).
//
// Context-aware and deliberately narrow, so it never fires on a real
// card whose title mentions packaging:
//   - "empty" within a few words of a packaging / box noun
//   - "<wrapper|packaging|packet|...> only"
//   - a wrapper NAMED as the product ("booster wrapper", "pack wrapper",
//     "foil wrapper", "opened/vintage/flattened wrapper")
//   - an explicit "no cards" / "cards removed"
// "pack fresh", "sealed booster pack", "factory sealed", a single
// "*SEALED*" card - none carry any of that phrasing, so all pass.
const _PKG_NOUN = "wrappers?|packet|packaging|blister|pouch|foil\\s?bag|cello";
const _BOX_NOUN =
  "booster\\s?box|elite\\s?trainer\\s?box|\\betb\\b|collection\\s?box|deck\\s?box|display\\s?box|gift\\s?box|card\\s?box|\\btin\\b";
const EMPTY_PACKAGING_PATTERN = new RegExp(
  [
    // "empty" anywhere in the same title as a packaging / pack / box noun.
    // "empty" is a rare word in a genuine single-card title, so the
    // co-occurrence is a strong signal on its own.
    `\\bempty\\b[\\s\\S]*?\\b(?:${_PKG_NOUN}|booster\\s?pack|art\\s?pack|foil\\s?pack|${_BOX_NOUN})\\b`,
    `\\b(?:${_PKG_NOUN}|booster\\s?pack|art\\s?pack|foil\\s?pack|${_BOX_NOUN})\\b[\\s\\S]*?\\bempty\\b`,
    // "<packaging> only" / "only the <packaging or product box>"
    `\\b(?:${_PKG_NOUN})\\s+only\\b`,
    `\\b(?:${_BOX_NOUN})(?:\\s+box)?\\s+only\\b`,
    `\\bonly\\s+(?:the\\s+)?(?:${_PKG_NOUN}|${_BOX_NOUN})\\b`,
    // a wrapper named as the item being sold
    "\\b(?:booster|pack|foil|gum|candy|vintage|opened|flat(?:tened)?|deflated|used|original)\\s?wrappers?\\b",
    "\\bwrappers?\\s+(?:pack|lot|set|only|for\\s+sale)\\b",
    // explicit emptiness
    "\\b(?:no\\s+cards?\\s+(?:included|inside)|cards?\\s+removed|without\\s+(?:the\\s+)?cards?)\\b",
  ].join("|"),
  "i"
);

// "coin" and "token" are merchandise only when they ARE the product. A
// real-card listing that merely throws one in ("...card WITH free coin",
// "+ bonus token") is still a card - keep it. Reject only an unqualified
// standalone use ("...Trading Card Game Coin 2000 WOTC" - a collectible
// coin, not a card).
const TRINKET_PRODUCT_RE = /\b(coin|token)s?\b/i;
const TRINKET_AS_BONUS_RE = /(?:free|bonus|with|w\/|includes?|incl\.?|plus|\+|and|&|extra|get)\s+(?:a\s+|an\s+|one\s+|1\s+|your\s+)?(?:free\s+|bonus\s+)?(?:coin|token)s?\b/i;

// A merch-type value in eBay's "Type"/"Product" item-specific (present on
// the getItem / feed paths, never on search results).
function nonCardAspectType(localizedAspects) {
  const v = (localizedAspects ?? []).find((a) =>
    /^(type|product|product type|item type|sub[\s-]?type)$/i.test(a?.name || "")
  )?.value;
  if (!v) return false;
  if (/\b(single|singles|trading card|tcg card)\b/i.test(v)) return false;
  return NON_CARD_MERCHANDISE_PATTERN.test(String(v)) || TRINKET_PRODUCT_RE.test(String(v));
}

// listing is { title, localizedAspects? }. True = plausibly an actual
// Pokemon TCG card; false = merchandise / novelty / proxy that happens to
// name a card. This is the first stage of the pipeline - "is it a card"
// is settled before "which card is it".
function qualifiesAsTradingCard(listing) {
  const title = String(listing?.title ?? "").trim();
  if (!title) return false;
  if (NON_CARD_MERCHANDISE_PATTERN.test(title)) return false;
  if (EMPTY_PACKAGING_PATTERN.test(title)) return false;
  if (TRINKET_PRODUCT_RE.test(title) && !TRINKET_AS_BONUS_RE.test(title)) return false;
  if (nonCardAspectType(listing?.localizedAspects)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// AUTHENTICITY - is the physical card GENUINE, or a proxy / replica /
// novelty copy that claims to be the correct card? Distinct from:
//   - matching (is it the right card)          -> listingMatchesCard
//   - product type (is it a card at all)       -> qualifiesAsTradingCard
//   - seller trust / price / condition / language.
//
// DETERMINISTIC ONLY. This gate fires when the LISTING TEXT itself admits
// the item is not an official card. It does NOT and CANNOT judge
// authenticity from a photo - that is a separate future layer
// (visualIdentityMismatch below). Verified live: the gold-metal
// counterfeits of Mewtwo EX 98/99 and Pikachu & Zekrom GX 184/181 have
// clean, honest-looking titles ("...Holo") and are NOT caught here - only
// a human/vision review flagged those.
//
// "gold" / "metal" / "shiny" ALONE are never a signal - there are
// genuine Gold Secret Rares and official metal products. Only an explicit
// self-identification as proxy/replica/custom/unofficial, OR a "metal
// card"-style NOUN PHRASE on a card whose real printing is ordinary
// paper, counts.
const PROXY_COUNTERFEIT_PATTERN =
  /\b(prox(?:y|ies)|\borica\b|bootleg|unofficial|non[\s-]?official|not\s+official(?:ly)?|counterfeit|\breplica\b|reproduction|\brepro\b|fan[\s-]?made|fanmade|hand[\s-]?made|homemade|home[\s-]?made|hand[\s-]?crafted|hand[\s-]?painted|hand[\s-]?drawn|\bcustom\b|knock[\s-]?off)\b/i;

// A genuine seller's DISCLAIMER ("100% genuine, NO proxies", "not a
// replica") must not trip the gate.
const AUTHENTICITY_DISCLAIMER_PATTERN =
  /\b(no|not|non|never|zero|without|free\s+of|100%?\s*(?:real|genuine|authentic|official))\b[^.!?]{0,25}\b(prox|replica|reproduc|repro\b|fake|counterfeit|bootleg|custom)|\bprox(?:y|ies)?[\s-]?free\b|\bno\s+fakes?\b/i;

// "metal card" / "gold metal" / ".999 gold" ... as a noun phrase. Only a
// signal when the matched catalogue card is NOT itself a gold/metal
// product (genuine Gold Secret Rares carry "gold" in the name/rarity;
// official metal promos - e.g. the SV151 metal Mew - carry "metal").
const METAL_NOVELTY_PHRASE =
  /\b(metal\s+card|gold\s+metal|metal\s+gold|gold\s+foil\s+card|\.999(?:\s*(?:fine)?\s*(?:gold|silver))?|24k?\s*gold(?:\s+plated)?|gold[\s-]?plated\s+card|silver\s+metal\s+card|metal\s+pok[eé]mon\s+card|weiss\s+metal)\b/i;

function catalogCardIsMetalOrGoldProduct(card) {
  const hay = `${card?.name ?? ""} ${card?.rarity ?? ""} ${card?.card_type ?? ""}`.toLowerCase();
  return /\b(gold|metal)\b/.test(hay);
}

// listing is { title }, card is the matched { name, set, rarity? } (may be
// omitted - the metal-phrase branch then can't check context and is
// skipped, i.e. conservative: no card context -> no metal-phrase reject).
function admitsProxyOrCounterfeit(listing, card) {
  const title = String(listing?.title ?? "");
  if (!title) return false;
  if (AUTHENTICITY_DISCLAIMER_PATTERN.test(title)) return false;
  if (PROXY_COUNTERFEIT_PATTERN.test(title)) return true;
  if (METAL_NOVELTY_PHRASE.test(title) && card && !catalogCardIsMetalOrGoldProduct(card)) return true;
  return false;
}

// The deterministic authenticity verdict for the pipeline: "reject" |
// "ok". Never "unknown" here - visual/ambiguous authenticity is the
// separate layer below and must not gate on its own.
function authenticityRisk(listing, card) {
  return admitsProxyOrCounterfeit(listing, card) ? "reject" : "ok";
}

// ---------------------------------------------------------------------------
// VISUAL IDENTITY - DESIGN STUB, NOT ENABLED.
//
// Goal: catch OBVIOUS counterfeits/novelties whose PHOTO materially
// disagrees with the exact official printing (wrong medium - a metal
// plate where the real card is paper; wrong background; wrong frame;
// collector number in the wrong place; ...). NOT professional grading.
//
// Why it is a stub today: the project has `sharp` (transitively, for
// next/image) but no perceptual-hash, OCR, card-detection or vision
// library, and adding a heavy one is out of scope. A naive pHash of a
// clean TCGplayer studio scan vs. an angled, sleeved, glare-lit eBay
// photo of the SAME genuine card routinely differs as much as two
// different cards do -> unacceptable false-positive rate. See the task
// report for the full feasibility analysis and the proposed out-of-band
// design (async worker: card-region detect -> normalise -> dHash/aHash
// pre-filter with a deliberately loose threshold that only ever yields
// UNKNOWN, escalated to a vision model only for expensive / extreme-
// discount deals; UNKNOWN never auto-rejects, at most hides an
// expensive deal from *promotion*).
//
// Contract (for when it is built): (listing, catalogCard) ->
//   "MATCH"    - photo is consistent with the official printing
//   "MISMATCH" - strong structural disagreement (ONLY this auto-rejects)
//   "UNKNOWN"  - can't tell (angle/glare/back photo/multi-card/no image)
//                -> NOT guilty. May justify hiding a high-value / extreme
//                   -discount deal from promotion, never a blanket drop.
function visualIdentityMismatch(/* listing, catalogCard */) {
  return "UNKNOWN";
}

// eBay's search is relevance-based, not a strict title match - a search
// for one card can return a completely different card that just ranks in
// the same category (verified: a "Pikachu" search returned a Darkrai
// promo and a Rayquaza promo, both priced against Pikachu's market
// value). Requires every meaningful word from the card's name to
// actually appear in the listing title before trusting the price
// comparison. Cards whose name has no distinctive token left after
// filtering (rare) skip the check rather than reject everything.
const MATCH_STOPWORDS = new Set([
  "ex", "gx", "v", "vmax", "vstar", "promo", "promos", "full", "art",
  "holo", "holofoil", "near", "mint", "nm", "the", "a", "an", "of",
  "star", "black", "prerelease",
]);

function coreTokens(name) {
  const raw = name.toLowerCase();
  const tokens = (raw.match(/[a-z0-9]+/g) ?? []).filter(
    (word) => word.length >= 2 && !MATCH_STOPWORDS.has(word)
  );
  // A leading 2-character code immediately followed by a colon or dash
  // ("ME: Ascended Heroes", "SM - Cosmic Eclipse") is a set-abbreviation
  // prefix, not a distinguishing word - the full name right after it
  // already carries all the real disambiguation, so requiring the bare
  // 2-letter code too rejected several genuine listings that simply
  // spelled the set name out in full without the abbreviation. This is
  // deliberately narrow: an earlier version dropped ANY bare 2-char
  // token whenever a longer one was also present, which is unsound -
  // verified live it dropped "go" from "Pokemon GO" (since "pokemon" is
  // longer), and "Pokemon" alone matches nearly every card in the game,
  // so "go" was the word actually doing the disambiguation there. A
  // short token that ISN'T a leading "code:"/"code-" prefix is real
  // content and must stay required.
  const leadingCode = raw.match(/^([a-z0-9]{2})\s*[:-]/)?.[1];
  if (leadingCode && tokens.includes(leadingCode)) {
    const withoutCode = tokens.filter((t) => t !== leadingCode);
    if (withoutCode.length > 0) return withoutCode;
  }
  return tokens;
}

// coreTokens for a SET NAME. Same rules, EXCEPT a bare digit run is
// always kept: a number in a set name is part of the set's identity, not
// noise ("Base Set 2" vs "Base Set", "POP Series 6" vs "POP Series 8",
// "EX Trainer Kit 1: Latias & Latios" vs "...Kit 2", "SV: ...151"). The
// >=2-char filter in coreTokens silently dropped the "2" from "Base Set
// 2", so ANY "... Base Set ..." listing (Base Set, Shadowless,
// Expedition Base Set, XY/SV/HGSS Base Set, ...) satisfied the set check
// and got priced against the wrong card - verified live on deal 29411
// (Expedition Charizard 40/165 priced against Base Set 2 Charizard's
// $489). When a distinguishing number is absent from a listing title the
// match is genuinely ambiguous, so requiring it is the safe direction.
function setTokensFor(name) {
  const raw = String(name ?? "").toLowerCase();
  const tokens = (raw.match(/[a-z0-9]+/g) ?? []).filter(
    (word) => (word.length >= 2 || /^\d+$/.test(word)) && !MATCH_STOPWORDS.has(word)
  );
  const leadingCode = raw.match(/^([a-z0-9]{2})\s*[:-]/)?.[1];
  if (leadingCode && tokens.includes(leadingCode)) {
    const withoutCode = tokens.filter((t) => t !== leadingCode);
    if (withoutCode.length > 0) return withoutCode;
  }
  return tokens;
}

// Real, whole words/numbers in a title - both as a Set (fast exact-match
// lookups) and the raw array (needed for the prefix scan below). NOT the
// same as substring containment - see tokenMatchesTitle's comment.
function titleWords(title) {
  const array = title.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return { set: new Set(array), array };
}

// Real, severe bug found live: matching used to check
// normalizedTitle.includes(token) - plain SUBSTRING containment. A
// watchlist card in the "Pokemon GO" set requires the token "go" to
// appear - "go" is a substring of "dra-GO-nite", so ANY listing merely
// mentioning "Dragonite" (a completely different card, different set,
// different rarity) matched and got shown as a "44% below market" deal
// against the Pokemon GO card's price. Whole-word matching fixes that,
// but on its own is too strict for a different, very common real
// pattern: sellers routinely fuse a set/promo code directly with the
// card number with no separator ("XY83", "SM168", "SWSH291", "SV11B") -
// a bare whole-word check for "xy" then misses a completely legitimate
// "XY83" listing (verified live on several real, wrongly-rejected
// matches). This allows that one specific safe case - a token followed
// immediately by nothing but digits - without reopening the
// substring-anywhere hole: "go" is not a PREFIX of "dragonite" (which
// starts with "d"), so that case stays correctly rejected either way.
function tokenMatchesTitle(token, title) {
  if (title.set.has(token)) return true;
  // A pure-digit token (only setTokensFor yields these - "2" from "Base
  // Set 2", "6" from "POP Series 6") must match a STANDALONE identical
  // token, never as a prefix: the fused-code rule below would otherwise
  // let "2" match "225", "2000", "2007", ... and re-open the exact
  // wrong-set hole this token was added to close (deal 29411 / #30570).
  if (/^\d+$/.test(token)) return false;
  return title.array.some(
    (word) => word.length > token.length && word.startsWith(token) && /^\d+$/.test(word.slice(token.length))
  );
}

// Reprint set families that reuse an original set's card names AND its
// collector numbering, so name+number alone can't tell them apart from
// the original printing (worth very different amounts). A title naming
// one of these is decisive evidence of the reprint, not the original.
const REPRINT_SET_MARKERS =
  /\b(celebrations|classic collection|legendary collection|xy[\s-]*evolutions|25th anniversary|first partner pack|trick or trade)\b/i;

// Does the listing title carry real evidence of `cardSet`?
//
// Normally this is just "every set token appears in the title". The bug
// it closes: a card whose NAME already contains its SET's words - "Here
// Comes Team Rocket! (15)" in set "Team Rocket", "Team Rocket's Meowth"
// in "Team Rocket" - satisfied that check purely from the card-name
// portion of the title, so a listing of a DIFFERENT set ("Here Comes
// Team Rocket! 15/82 Holo Celebrations: Classic Collection") matched and
// was priced against the wrong printing (live: deals 27155 / 31182 /
// 31243 - a $0.90 Celebrations card shown as a 43-51% "deal" on the $27
// WOTC row).
//
// When the card name shadows every set word, the set tokens prove
// nothing, so instead we reject only when the title POSITIVELY names a
// different reprint-set family than the catalogue card's set. A terse
// listing that just doesn't repeat the set name is left to the
// name+collector-number match, unchanged.
function setEvidenceInTitle(cardSet, cardName, title, rawTitle = "") {
  const setTokens = setTokensFor(cardSet ?? "");
  if (setTokens.length === 0) return true;

  const nonDigit = setTokens.filter((t) => !/^\d+$/.test(t));
  const nameWords = new Set(String(cardName ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const nameShadowsSet = nonDigit.length > 0 && nonDigit.every((t) => nameWords.has(t));

  if (nameShadowsSet) {
    const setStr = String(cardSet ?? "");
    if (REPRINT_SET_MARKERS.test(String(rawTitle)) && !REPRINT_SET_MARKERS.test(setStr)) return false;
    return true; // otherwise leave the name + collector-number match as-is
  }

  return setTokens.every((token) => tokenMatchesTitle(token, title));
}

// TCGPlayer/PokemonPriceTracker disambiguate two same-named cards in one
// set by appending the collector number in a trailing parenthetical -
// "Dark Blastoise (3)" (the Team Rocket holo, ~$450) vs "Dark Blastoise
// (20)" (the non-holo, ~$15), and sometimes with the variant spelled out
// too: "Lugia EX (94 Full Art)". coreTokens() drops anything under 2
// chars, so a single-digit number like "(3)" was silently discarded and
// never required in the title - verified live: watchlist "Dark Blastoise
// (3)" matched an eBay listing for "Dark Blastoise 20/82" and priced it
// against the holo, a fake 71%-below "deal". Returns the bare number
// ("3", "20", "9a") from the trailing parenthetical, or null.
function cardNumberFromName(name) {
  const paren = String(name ?? "").trim().match(/\(([^)]*)\)\s*$/);
  if (!paren) return null;
  const num = paren[1].match(/\b(\d{1,3}[a-z]?)\b/i);
  return num ? num[1].toLowerCase() : null;
}

// The listing title mentions this collector number - as its own token
// ("3", or the "3" half of "3/82" / "#3"), or a zero-padded all-digit
// token of the same value ("003"). eBay sellers of the kind of card that
// needs number disambiguation (multiple prints, same name, one set) put
// the number in the title almost without exception.
function titleHasCardNumber(title, number) {
  if (title.set.has(number)) return true;
  const digits = number.replace(/[a-z]/g, "");
  if (!/^\d+$/.test(digits)) return false;
  const value = parseInt(digits, 10);
  return title.array.some((w) => /^\d+$/.test(w) && parseInt(w, 10) === value);
}

// A watchlist row that names a specific premium variant loses every
// distinguishing word to MATCH_STOPWORDS ("Dragonite EX (Full Art)" ->
// just ["dragonite"]), so the cheap base print of the same Pokemon in the
// same set matches it and gets priced against the variant - verified live
// as another fake 71%-below deal. When the row names one of these
// variants, require the listing title to say so too. `need` deliberately
// accepts the common seller shorthands (FA, AA, SIR, TG<n>).
const VARIANT_MARKERS = [
  { has: /\bfull[\s-]?art\b/i, need: /\bfull[\s-]?art\b|\bfa\b/i },
  { has: /\balt(?:ernate)?[\s-]?art\b/i, need: /\balt(?:ernate)?[\s-]?art\b|\baa\b/i },
  { has: /\btrainer\s*gallery\b/i, need: /\btrainer\s*gallery\b|\btg\s*\d/i },
  { has: /\bspecial\s*(?:illustration|art)\s*rare\b/i, need: /\bspecial\s*(?:illustration|art)\b|\bsir\b/i },
  { has: /\brainbow\b/i, need: /\brainbow\b/i },
  // "LV.X" / "Level X" is a distinct card supertype (DP-era), not a
  // wording nicety. Catalogue "Dialga LV.X" ($$$) was matching a listing
  // for the plain "Dialga Lv.68" basic (deal 27287) because "lv" is a
  // shared token. Require the listing to actually say LV.X / LEVEL X.
  { has: /\blv\.?\s*x\b|\blevel\s*x\b/i, need: /\blv\.?\s*x\b|\blevel\s*x\b/i },
];

// P0.3 - Prerelease / Staff-stamped promos are a DIFFERENT kind of variant
// than VARIANT_MARKERS above and must never be folded into that list or
// gated behind `numberConfirmed`. Full Art / Alt Art / Trainer Gallery /
// SIR / Rainbow / LV.X each have a collector number that is UNIQUE within
// their set, so "the title states this exact number" is itself enough
// evidence (VARIANT_MARKERS is skipped once numberConfirmed is true).
// Prerelease and Staff-stamped promos do the opposite: PokemonPriceTracker
// routinely catalogues them under the SAME collector number as the
// ordinary mainline card they were stamped from - e.g. tcgplayer 126023
// "Charizard - 11/108 (Prerelease)" (XY Promos, no PPT market price at
// matching time) carries the identical "11/108" as tcgplayer 124026
// "Charizard" (XY - Evolutions, Holo Rare, ~$100). "prerelease" is also
// in MATCH_STOPWORDS, so a watchlist row named "Charizard - 11/108
// (Prerelease)" degenerates to core tokens ["charizard","11","108"] -
// indistinguishable from the ordinary print, and the shared "11/108"
// satisfies numberConfirmed, which used to SKIP variant-evidence entirely.
// The result: an ordinary "...XY Evolutions...Holo..." listing with zero
// prerelease/staff evidence matched the Prerelease watchlist row and was
// priced against its (much higher) reference - verified live on deal
// 31909 (briefly #2 in Top Deals) plus 4 more currently-active deals and
// 102 historical deals across a 98-row audit of every Prerelease/[Staff]
// catalogue entry sharing a species+number with a different entry (see
// the P0.3 incident report). Checked UNCONDITIONALLY - never skipped by
// numberConfirmed - because the number proves nothing here. Genuine
// listings for these prints overwhelmingly call out the stamp/status
// explicitly (it is the entire reason the card is worth more), matching
// the same "positive evidence required" principle as VARIANT_MARKERS.
const ALWAYS_REQUIRED_VARIANT_MARKERS = [
  { has: /\bprerelease\b|\bpre-release\b/i, need: /\bprerelease\b|\bpre[\s-]?release\b/i },
  { has: /\[\s*staff\s*\]|\bstaff\b/i, need: /\bstaff\b/i },
];

// --- targeted identity-precision checks -------------------------------
//
// Added after the visual-authenticity pass found 47 live IDENTITY_MISMATCH
// deals: genuine cards the deterministic matcher had accepted against the
// wrong catalogue printing (wrong collector number, non-ex matched to an
// -ex, non-Mega matched to a Mega, seller-keyword-stuffed set token). The
// matcher stays name+set-token based; these are extra REJECT-only gates -
// they never turn a non-match into a match, and they only fire on a
// POSITIVE contradiction (a title that omits the number/form is still
// fine), so an abbreviated-but-correct listing is unaffected.

// Parse a catalogue `card_number` string into a comparable shape, or null
// when the format carries no safe numeric identity (odd promo/subset
// schemes, "TWO", "!/28", multi-number rows). Handles the ~99% simple
// cases from card_catalog: "###/###", "##/###", "###", zero-padded
// "002/130", letter-prefixed "H21/H32" / "RC3/RC32", promo "XY121" /
// "SWSH075", secret-rare "###/### SAR", and "125a/156".
function parseCatalogNumber(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // compound / multi-card rows ("101/102 + 102/102", "1, 2") carry no
  // single safe identity.
  if (/[+,]|\bor\b/i.test(s)) return null;
  // promo / set-code style: XY121, SWSH075, HGSS18, SH5, PW 5
  const promo = s.match(/^([A-Za-z]{2,4})\s?-?\s?(\d{1,3})$/);
  if (promo) return { kind: "promo", code: (promo[1] + promo[2]).toLowerCase() };
  // letter-prefixed pair: H21/H32, RC3/RC32, S1/S4
  const lpair = s.match(/^([A-Za-z]{1,3})(\d{1,3})\s*\/\s*([A-Za-z]{1,3})(\d{1,3})$/);
  if (lpair) {
    return {
      kind: "pair",
      num: parseInt(lpair[2], 10),
      den: parseInt(lpair[4], 10),
      prefix: lpair[1].toLowerCase(),
    };
  }
  // plain numeric pair, optional letter suffix on the numerator
  // ("125a/156"), optional trailing tag ("103/99 SAR")
  const pair = s.match(/^(\d{1,3})[a-z]?\s*\/\s*(\d{1,3})\b/i);
  if (pair) return { kind: "pair", num: parseInt(pair[1], 10), den: parseInt(pair[2], 10) };
  // bare number ("148", "023", "7")
  const bare = s.match(/^0*(\d{1,3})$/);
  if (bare) return { kind: "bare", num: parseInt(bare[1], 10) };
  return null;
}

// Collector-number-ish tokens actually present in a listing title. Only
// slash pairs ("27/100", "013 / 016"), "#N", and set-code+number promos
// ("XY124", "SWSH291") - NOT bare years / HP / prices, which are not
// collector numbers.
function titleCollectorNumbers(title) {
  const t = String(title ?? "");
  const pairs = [];
  for (const m of t.matchAll(/(\d{1,3})\s*\/\s*(\d{1,3})/g)) {
    pairs.push({ num: parseInt(m[1], 10), den: parseInt(m[2], 10) });
  }
  const hashes = [...t.matchAll(/#\s*(\d{1,3})\b/g)].map((m) => parseInt(m[1], 10));
  const promos = [...t.matchAll(/\b([A-Za-z]{2,4})\s?-?\s?(\d{1,3})\b/g)]
    // avoid "HP 250", "40 HP", "NY 2001", 4-digit years already excluded by \d{1,3}
    .filter((m) => !/^(hp|nm|lp|mp|vg|ex|gx|no|of)$/i.test(m[1]))
    .map((m) => (m[1] + m[2]).toLowerCase());
  return { pairs, hashes, promos, any: pairs.length + hashes.length + promos.length > 0 };
}

// Two collector-number DENOMINATORS genuinely disagree (a different set),
// as opposed to a seller typo / dropped digit / truncated title. This
// branch only runs when the NUMERATOR already matches, so the real
// targets are same-number reprints across set families (Base Set /102 vs
// Base Set 2 /130 vs Platinum Base Set /127), which differ by >= 25. A
// clash needs: both look like real set totals (>= 40), neither is a
// substring of the other ("32" in "132" is a dropped digit), and they
// are far enough apart to rule out a single-digit fat-finger ("27/74"
// for "27/64").
function denominatorsClash(a, b) {
  if (!(a >= 40 && b >= 40)) return false;
  const sa = String(a), sb = String(b);
  if (sa.includes(sb) || sb.includes(sa)) return false;
  return Math.abs(a - b) >= 15;
}

// True when the listing title carries an explicit collector number that
// CONTRADICTS the catalogue card's number (a different card in the same
// set, or a different set's printing). Absence of a number in the title
// is never a conflict, and neither is a lone seller-typo denominator.
// `catalogNumber` is the card_catalog.card_number string (undefined ->
// no opinion). REJECT-only.
function collectorNumberConflict(title, catalogNumber) {
  const cat = parseCatalogNumber(catalogNumber);
  if (!cat) return false;
  const t = titleCollectorNumbers(title);
  if (!t.any) return false;

  if (cat.kind === "pair") {
    // ignore "3/5 photos", "1/2 price" - not collector numbers
    const pairs = t.pairs.filter((p) => p.den >= 10);
    if (pairs.length > 0) {
      if (pairs.some((p) => p.num === cat.num && p.den === cat.den)) return false;
      // same set total, different card number -> a different card
      if (pairs.some((p) => p.den === cat.den && p.num !== cat.num)) return true;
      // this card's number but a genuinely different set size -> another set's print
      if (pairs.some((p) => p.num === cat.num && denominatorsClash(p.den, cat.den))) return true;
      // the title states collector number(s) and none is this card's
      if (pairs.every((p) => p.num !== cat.num)) return true;
      return false;
    }
    if (t.hashes.length > 0) return !t.hashes.includes(cat.num);
    return false; // only promo codes -> no safe opinion
  }

  if (cat.kind === "bare") {
    const pairs = t.pairs.filter((p) => p.den >= 10);
    if (pairs.some((p) => p.num === cat.num) || t.hashes.includes(cat.num)) return false;
    if (pairs.length > 0 || t.hashes.length > 0) return true;
    return false;
  }

  if (cat.kind === "promo") {
    if (t.promos.includes(cat.code)) return false;
    const family = cat.code.match(/^[a-z]+/)?.[0];
    if (family && t.promos.some((c) => c.startsWith(family) && c !== cat.code)) return true;
    return false;
  }

  return false;
}

// "Mega X" / "M X EX" asserted as the card's identity. Deliberately tight:
// "mega" spelled out before a 3+ letter species word, or the historical
// "M <Species> EX" shorthand with a REAL separator after the M (so
// "Metagross ex" / "Mewtwo ex" are NOT read as Mega). Does not fire on
// set names ("Mega Evolution ...") or a stray initial.
function megaFormAsserted(text) {
  const s = String(text ?? "");
  return (
    /\bmega\s+[a-z]{3,}/i.test(s) ||
    /\bm[-\s]+[a-z]{3,}\s+(?:ex|gx)\b/i.test(s)
  );
}

// "EX <SetName>" prefixes name a set (EX Crystal Guardians, EX Holon
// Phantoms, ...), NOT the ex mechanic. Strip them before looking for the
// mechanic's bare "ex" / "gx" token.
const EX_SET_PREFIX =
  /\bex\s+(holon|crystal|delta|hidden|emerald|deoxys|unseen|dragon|team|power|ruby|sapphire|sandstorm|firered|leafgreen|legend|legends|trainer|sky|forces|frontiers|guardians|phantoms|species|kit|ruin|creation)\b/gi;

function exMechanicAsserted(text) {
  const s = String(text ?? "").replace(EX_SET_PREFIX, " ");
  return /(?:^|[\s(-])(?:ex|gx)\b/i.test(s);
}

// The catalogue card name carries the ex/EX (or gx) mechanic - a trailing
// or standalone "ex" once any parenthetical variant note is removed.
function catalogNameHasExMechanic(name) {
  const s = String(name ?? "").replace(/\s*\([^)]*\)\s*$/, "");
  return /\b(?:ex|gx)\b/i.test(s);
}

// Mega- and ex-mechanic identity must AGREE between the catalogue card
// name and the listing title. A plain "Swampert" listing must not price
// against "Swampert ex"; a "M Charizard EX" listing must not collapse
// into plain "Charizard". REJECT-only, and only on a positive
// contradiction.
function formIdentityConflict(title, cardName) {
  // Mega must match in both directions.
  if (megaFormAsserted(cardName) !== megaFormAsserted(title)) return true;
  // ex mechanic: catalogue says ex, the listing doesn't -> different card.
  if (catalogNameHasExMechanic(cardName) && !exMechanicAsserted(title)) return true;
  return false;
}

// card is {name, set} - a watchlist row or a plain object both work.
function listingMatchesCard(listing, card) {
  const title = titleWords(listing.title);

  const nameTokens = coreTokens(card.name);
  if (nameTokens.length > 0 && !nameTokens.every((token) => tokenMatchesTitle(token, title))) return false;

  // Same name, same set, different collector number = a different print
  // worth a different amount. Only enforced when the row actually carries
  // a "(N)" number, so it can't wrongly reject a card that's unique in
  // its set.
  const cardNumber = cardNumberFromName(card.name);
  const numberConfirmed = cardNumber != null && titleHasCardNumber(title, cardNumber);
  if (cardNumber != null && !numberConfirmed) return false;

  // Premium-variant row -> the listing has to name the variant too. The
  // collector number is the stronger signal, so skip this when the title
  // already cited it (a listing that gives the full art's exact number
  // but doesn't spell out "Full Art" is still the full art).
  if (!numberConfirmed) {
    for (const { has, need } of VARIANT_MARKERS) {
      if (has.test(card.name) && !need.test(listing.title)) return false;
    }
  }

  // Prerelease / Staff evidence is required UNCONDITIONALLY - never
  // skipped by numberConfirmed. See ALWAYS_REQUIRED_VARIANT_MARKERS.
  for (const { has, need } of ALWAYS_REQUIRED_VARIANT_MARKERS) {
    if (has.test(card.name) && !need.test(listing.title)) return false;
  }

  // Mega / ex mechanic identity must agree with the catalogue card name.
  if (formIdentityConflict(listing.title, card.name)) return false;

  // The listing states an explicit collector number (a slash pair or #N)
  // that contradicts this catalogue printing's number or set size. Needs
  // the enriched card.card_number (card_catalog); a plain {name,set}
  // caller without it simply skips this check.
  if (card.card_number != null && collectorNumberConflict(listing.title, card.card_number)) {
    return false;
  }

  // The card name alone is often just the Pokemon's name ("Charizard",
  // "Gengar", "Pikachu"...), which is shared across dozens of sets worth
  // wildly different amounts - verified a sweep matched "Charizard" (SM -
  // Team Up) to a listing for a completely different, much more recent
  // "Charizard ex... Paldean Fates" print before this check existed.
  // Requiring the set to match too is what actually disambiguates which
  // specific print a listing is.
  // Set evidence must appear as the SET, not merely as words that are
  // already inside the card's own name (see setEvidenceInTitle).
  if (!setEvidenceInTitle(card.set, card.name, title, listing.title)) return false;

  // A Japanese-catalog card's name/set text is often the same English
  // romanization TCGPlayer uses for the English print too (e.g. "Pikachu",
  // "Neo Genesis"-style set names appear in both catalogs) - name+set
  // tokens alone can't tell the prints apart. Sellers listing a genuine
  // Japanese-print card overwhelmingly say so in the title, so require it
  // explicitly rather than risk pricing a Japanese print against (or
  // showing up as) an English one.
  if (card.language === "japanese" && !/\bjapan(?:ese)?\b/i.test(listing.title)) return false;

  // The same problem in reverse, and the more damaging direction - an
  // English-catalog watchlist row must NOT match a listing that explicitly
  // says it's the Japanese print. Verified on a real live deal: "Rocket's
  // Sneasel ex" (EX Team Rocket Returns, English watchlist) matched an
  // eBay listing titled "...Team Rocket Returns Japanese Pokemon Card" and
  // was priced at 65% "below" the $339.99 ENGLISH market value - a
  // genuinely different print with its own real (and here, unknown) value,
  // not a real discount on anything. card.language is "english" for every
  // existing watchlist row (the column added for the Japanese catalog
  // defaults to it) and undefined for any plain {name, set} caller, so
  // this only skips the check for rows explicitly marked "japanese" above.
  if (card.language !== "japanese" && /\bjapan(?:ese)?\b/i.test(listing.title)) return false;

  return true;
}

// A deal CTA must open the ONE listing we priced. eBay's Browse
// item.itemWebUrl / itemAffiliateWebUrl are always item-specific
// (/itm/<legacyId>); a /p/<epid> product group or a /sch/ search is not a
// listing and must never be a verified-deal destination.
function hasExactItemUrl(listing) {
  for (const u of [listing.affiliateUrl, listing.listingUrl]) {
    if (typeof u !== "string") continue;
    try {
      const url = new URL(u);
      if (/\.ebay\./.test(url.hostname) && /^\/itm\/\d+/.test(url.pathname)) return true;
    } catch {
      /* malformed */
    }
  }
  return false;
}

// STAGE 3 (listing trust, multi-signal). A steep below-market price on a
// valuable RAW single is exactly the shape a fake / proxy / dropship
// listing takes - but NONE of the individual signals is safe to reject on
// alone: established sellers list with one stock photo, brand-new sellers
// have genuine bargains, and vintage listings almost never offer returns.
// Derived from the Phase-1 ~141-listing Browse audit: the confirmed-bad
// cluster (thin low-feedback sellers, a single photo, no returns, a
// description that is just the title copied back) scored >= 6 here; every
// clearly-legitimate steep discount scored <= 4. `signals` carries
// whatever the caller has established - seller feedback score, photo
// count, returns policy, description length - each optional; an absent
// signal contributes nothing (never a penalty, never a pass). Returns a
// risk integer; the caller compares it to HIGH_RISK_SCORE and also
// requires a genuinely steep discount before acting on it.
const HIGH_RISK_SCORE = 6;

function listingTrustRisk({
  sellerFeedbackScore = null,
  imageCount = null,
  returnsAccepted = null,
  descriptionLength = null,
  descriptionIsTitleEcho = false,
  discountPct = null,
} = {}) {
  let score = 0;
  if (sellerFeedbackScore == null) score += 0; // unknown - not penalised
  else if (sellerFeedbackScore < 50) score += 2;
  else if (sellerFeedbackScore < 250) score += 1;

  if (imageCount != null) {
    if (imageCount <= 1) score += 2;
    else if (imageCount === 2) score += 1;
  }

  if (returnsAccepted === false) score += 1;

  if (descriptionLength != null) {
    if (descriptionLength === 0 || descriptionIsTitleEcho || descriptionLength < 80) score += 1;
    if (descriptionLength < 200) score += 1;
  }

  if (discountPct != null) {
    if (discountPct >= 0.7) score += 1;
    if (discountPct >= 0.75) score += 1;
  }
  return score;
}

// True = a would-be deal that should NOT be promoted: a steep (>=55%)
// discount whose listing-trust risk is at or above the threshold.
function isHighRiskBelowMarket(signals) {
  return (signals?.discountPct ?? 0) >= 0.55 && listingTrustRisk(signals) >= HIGH_RISK_SCORE;
}

function isTrustworthyListing(listing) {
  if (EXCLUDED_TITLE_PATTERN.test(listing.title)) return false;
  // The listing must resolve to an exact /itm/ View Item URL - never a
  // /p/<epid> product page or a search.
  if (!hasExactItemUrl(listing)) return false;
  // A contested auction's current bid is not a settled price - it climbs,
  // so a "% below market" computed against it is fiction (verified live:
  // an M Rayquaza EX auction at 1 bid showed as "72% below market"). A
  // 0-bid auction is fine: the opening bid is a real "pay this if
  // uncontested" floor.
  if (listing.listingType === "AUCTION" && (listing.bidCount ?? 0) >= 1) return false;
  // An already-ended auction is not a live deal - the listing is retired
  // and eBay redirects its /itm/ url to the product group.
  if (
    listing.listingType === "AUCTION" &&
    listing.auctionEndAt &&
    Number.isFinite(Date.parse(listing.auctionEndAt)) &&
    Date.parse(listing.auctionEndAt) < Date.now()
  ) {
    return false;
  }
  if (listing.sellerFeedbackScore != null && listing.sellerFeedbackScore < MIN_SELLER_FEEDBACK_SCORE)
    return false;
  if (listing.sellerFeedbackPct != null && listing.sellerFeedbackPct < MIN_SELLER_FEEDBACK_PCT)
    return false;
  return true;
}

// Sealed product needs a different exclusion list than singles -
// "bundle"/"box"/"case"/"display" are legitimate real product types here
// (Build & Battle Bundle, Booster Box, Booster Box Case), not junk-listing
// signals, so unlike EXCLUDED_TITLE_PATTERN above they're deliberately
// absent. This instead excludes listings that plainly aren't genuine
// factory-sealed product.
// Real bug found live: a graded single-card listing ("Lucario VSTAR
// SWSH291 Crown Zenith Elite Trainer Box... CGC 10 Pristine") matched the
// "Crown Zenith Elite Trainer Box" sealed-product watchlist row, because
// the card's own title legitimately mentions the box it was originally
// packaged in - every required name/set token is genuinely present, so
// whole-word matching can't tell this apart. What actually gives it away:
// a numeric third-party grade (PSA 10, CGC 10, BGS 9.5...) is something
// only ever applied to a single card, never to factory-sealed product -
// verified live this was priced as "24% below" the box's real market
// price when it was actually just one promo card, no box at all.
const GRADED_CARD_PATTERN = /\b(psa|cgc|bgs|sgc|ace|tag)\s*-?\s*\d/i;

// A bare grader mention ("PSA Graded 9", "Beckett", "CGC pristine",
// "BGS gem mint") with no digit adjacent - the compact GRADED_CARD_PATTERN
// misses these. Retained for back-compat / callers that import it; the
// authoritative detector is now mentionsSlabGrader() below.
const GRADER_MENTION_PATTERN =
  /\b(psa|cgc|bgs|beckett|sgc|gma|mgc|hga|tqg|rcg|mnt\s*\d|dsg\s*\d)\b|\b(?:ace|tag|cga|pgc|isa)\s*(?:grad(?:e|ed|ing)|\d)/i;

// --- shared slab-grader detector -------------------------------------------
//
// A raw-only recent-sales list must never show an encapsulated graded
// card. PokemonPriceTracker's `soldListings.ungraded` bucket is only
// advisory - it routinely contains slabs whose title plainly names a
// grading service (audited live on "Here Comes Team Rocket! (15)": PSA,
// MGC, HGA Pristine, GMA, TAG Graded, Ace Graded, TQG, CC&G, CGC Blue
// Label, WAG, AGS, PCG, "PSA NM-MT 8", ...). One maintainable detector,
// used by titleLooksGraded and by rawSaleMatchesPrinting.
//
// TIER 1 - the acronym alone is decisive: none of these strings occurs
// as an ordinary word or common abbreviation in a Pokemon card title.
const SLAB_GRADERS_STRONG = [
  "psa", "bgs", "beckett", "cgc", "cga", "sgc", "csg", "gma", "hga",
  "tqg", "wag", "ags", "ksa", "hgc", "gemmt", "cc\\s?&\\s?g",
];
// TIER 2 - real graders, but the bare token collides with card text
// ("CCG"/"PCG" = card-game abbreviations, "MNT" ~ mint, "ACE" = ACE SPEC /
// Ace Trainer, "TAG" = Tag Team), so a grade digit or "grad(e/ed/ing)"
// must sit right next to it.
const SLAB_GRADERS_WEAK = ["ccg", "pcg", "mnt", "dsg", "mgc", "rcg", "pgc", "isa", "gmg", "rcg"];
// A slab grade value: 1..10 (optional .5), or a written slab label.
const GRADE_VALUE_SRC =
  "(?:10|[1-9](?:\\.5)?)|gem\\s*-?\\s*m(?:int|t)|pristine|mint\\s*\\+|black\\s*label|blue\\s*label";

const STRONG_GRADER_RE = new RegExp(`\\b(?:${SLAB_GRADERS_STRONG.join("|")})\\b`, "i");
const WEAK_GRADER_RE = new RegExp(
  `\\b(?:${SLAB_GRADERS_WEAK.join("|")})\\b[\\s:_-]*(?:graded?|grading|grade|${GRADE_VALUE_SRC})`,
  "i"
);
// number glued to the acronym ("PCG10", "PSA9", "CGC10")
const GRADER_GLUED_RE = new RegExp(
  `\\b(?:${SLAB_GRADERS_STRONG.join("|")}|${SLAB_GRADERS_WEAK.join("|")})(?:10|[1-9])(?:\\.5)?\\b`,
  "i"
);
// "ACE" / "TAG" as graders - grade context required, and NOT the card
// subtype ("ACE SPEC"), the Trainer class ("Ace Trainer"), or the
// mechanic ("Tag Team").
const ACE_TAG_GRADER_RE =
  /\b(?:ace|tag)\b[\s:_-]*(?:graded?|grading|grade|(?:10|[1-9](?:\.5)?))/i;
// written slab labels only count with a numeric grade attached
// ("Gem Mint 10", "Pristine 10", "Mint+ 9.5", "NM-MT 8", "Mint 9") - a raw
// seller's bare "gem mint" / "pristine condition" / "near mint" is left
// alone. A bare year ("Mint 1999", "Mint 2021") can't match: [1-9] would
// land on a digit immediately followed by another digit, so \b fails.
const NUMBERED_GRADE_LABEL_RE =
  /\b(?:gem\s*-?\s*m(?:int|t)|pristine|mint\s*\+?|(?:nm|ex|vg|gd)\s*-?\s*mt)\s*\+?\s*(?:10|[1-9](?:\.5)?)\b/i;
// an explicit grade number tied to the word "grade(d)" ("Grade 9",
// "9 Grade", "graded 9.5") - not "ungraded"/"not graded".
const GRADE_NUMBER_RE =
  /(?<!un)(?<!not )\bgrade[sd]?\s*(?:10|[1-9](?:\.5)?)\b|\b(?:10|[1-9](?:\.5)?)\s*grade[sd]?\b/i;

function mentionsSlabGrader(title) {
  if (typeof title !== "string" || !title) return false;
  const t = title.replace(/&amp;/gi, "&");
  if (GRADED_CARD_PATTERN.test(t)) return true;
  if (STRONG_GRADER_RE.test(t)) return true;
  if (GRADER_GLUED_RE.test(t)) return true;
  if (WEAK_GRADER_RE.test(t)) return true;
  const aceTag = t.replace(/\bace\s+(?:spec|trainer)\b/gi, " ").replace(/\btag\s+team\b/gi, " ");
  if (ACE_TAG_GRADER_RE.test(aceTag)) return true;
  if (NUMBERED_GRADE_LABEL_RE.test(t)) return true;
  if (GRADE_NUMBER_RE.test(t)) return true;
  return false;
}

// True when a listing/sale TITLE indicates a graded slab. Conservative on
// purpose: a raw-only list would rather omit an ambiguous sale than
// mislabel a slab as a raw sale.
function titleLooksGraded(title) {
  return typeof title === "string" && mentionsSlabGrader(title);
}

// --- same-printing filter for raw recent-sales ---------------------------
//
// A card page's "Recent raw eBay sales" must be raw AND the SAME printing
// as the canonical card. Reuses the deterministic matcher (name tokens +
// collector number + setEvidenceInTitle / REPRINT_SET_MARKERS + language)
// and adds an edition guard: an unqualified WOTC-era /cards identity
// represents the Unlimited print by site convention (see
// lib/pokemonPriceTracker catalogRawMarketPrice), so an explicit
// "1st Edition" sale is a different, pricier printing - dropped unless the
// canonical card is itself 1st-Edition-only. Terse genuine same-printing
// titles are kept (rejection needs POSITIVE conflicting evidence).
function rawSaleMatchesPrinting(
  title,
  { name, set, cardNumber, language = "english", firstEditionOnly = false } = {}
) {
  if (typeof title !== "string" || !title.trim()) return false;
  if (mentionsSlabGrader(title)) return false;
  if (!listingMatchesCard({ title }, { name, set, card_number: cardNumber, language })) return false;
  const says1stEd = /\b(?:1st|first)\s*ed(?:ition|\.)?\b/i.test(title);
  const saysUnlimited = /\bunlimited\b/i.test(title);
  if (!firstEditionOnly && says1stEd) return false;
  if (firstEditionOnly && saysUnlimited) return false;
  return true;
}

// --- price-sanity for raw recent-sales (DISPLAY HYGIENE ONLY) -----------
//
// After rawSaleMatchesPrinting() the list is same-printing raw sales, but
// the provider feed still carries fat-finger BINs, wrong-quantity lots and
// slab-money prices on otherwise-clean raw titles ("Here Comes Team
// Rocket! 15/82 Team Rocket Holo" at $750 against a ~$27 reference;
// "Mewtwo 010/102 Base Set (Shadowless) Holo" at $13,511 against ~$317).
//
// Audit of 528 retained sales across 44 cards (vintage + modern, $2 to
// $2,000+ references): ratio salePrice / canonicalRawReference had
// median 1.08x, P95 3.9x, P99 12x. Manual inspection of every sale >= 4x
// found the 4-8x band still holds real copies (a genuine Neo Revelation
// "Double Holo Error SWIRL" Houndoom at 5.0x, a Gold Star Flareon at
// 5.3x, high-grade raw Base Set Charizard at 3.2x), while >= 8x was
// entirely fat-finger / mislisting / lot / slab-priced noise. No
// lot-keyword pattern in the extremes (the ceiling catches them anyway),
// and only 0.8% of rows sat below 0.1x with no systematic cause - so no
// low-side filter.
//
// The anchor is the CANONICAL raw reference (catalogRawMarketPrice), not
// the sample: it is computed independently, RecentSales never feeds back
// into it, and this keeps the check working for a 1-sale card. A relative
// multiple (never an absolute dollar ceiling) so a genuine $2,000 raw
// card is judged the same as a $2 one.
const RAW_SALE_HIGH_RATIO_CEILING = 8;

function rawSalePriceIsPlausible({ salePrice, rawReference } = {}) {
  const p = Number(salePrice);
  const ref = Number(rawReference);
  if (!(p > 0)) return false;
  if (!(ref > 0)) return true; // no independent anchor -> don't second-guess
  return p <= ref * RAW_SALE_HIGH_RATIO_CEILING;
}

const SEALED_EXCLUDED_TITLE_PATTERN =
  /\b(opened|empty|resealed|repack|proxy|custom|digital|no product|missing packs?|single pack|loose packs?|damaged box|torn|water ?damage|photo only|picture only|box only|box art only)\b|code only|choose your|pick your|trading service|account trade/i;

function isTrustworthySealedListing(listing) {
  if (SEALED_EXCLUDED_TITLE_PATTERN.test(listing.title)) return false;
  if (GRADED_CARD_PATTERN.test(listing.title)) return false;
  if (!hasExactItemUrl(listing)) return false;
  // Same reasoning as isTrustworthyListing: a contested auction's current
  // bid is not a settled price - it climbs, so a "% below market" against
  // it is fiction. A 0-bid auction's opening bid is a real floor and is
  // fine. (This check existed for single cards but not sealed product -
  // sealed auctions ARE scanned and shown, see SealedDealCard.)
  if (listing.listingType === "AUCTION" && (listing.bidCount ?? 0) >= 1) return false;
  if (
    listing.listingType === "AUCTION" &&
    listing.auctionEndAt &&
    Number.isFinite(Date.parse(listing.auctionEndAt)) &&
    Date.parse(listing.auctionEndAt) < Date.now()
  ) {
    return false;
  }
  if (listing.sellerFeedbackScore != null && listing.sellerFeedbackScore < MIN_SELLER_FEEDBACK_SCORE)
    return false;
  if (listing.sellerFeedbackPct != null && listing.sellerFeedbackPct < MIN_SELLER_FEEDBACK_PCT)
    return false;
  return true;
}

// product is {name, set} - a sealed_watchlist row or plain object.
// Deliberately the same name+set token logic as listingMatchesCard (reuses
// coreTokens and the same tokenMatchesTitle whole-word-or-digit-suffix
// matching, not substring containment - see listingMatchesCard's comment
// for the real bug that distinction fixes) - "Twilight Masquerade Booster
// Box" requires "booster" AND "box" in the title, so it can't cross-match
// an Elite Trainer Box (or a different set's box) listing.
function listingMatchesSealedProduct(listing, product) {
  const title = titleWords(listing.title);

  const nameTokens = coreTokens(product.name);
  if (nameTokens.length > 0 && !nameTokens.every((token) => tokenMatchesTitle(token, title))) return false;

  if (!setEvidenceInTitle(product.set, product.name, title, listing.title)) return false;

  // Same real bug as listingMatchesCard's mirrored check above - every
  // sealed_watchlist row is English/US product, so a listing explicitly
  // labeled Japanese (a genuinely different, differently-priced product)
  // must never match one.
  if (/\bjapan(?:ese)?\b/i.test(listing.title)) return false;

  return true;
}

// The 5 condition tiers PokemonPriceTracker/TCGPlayer both use, best to
// worst - matches CONDITION_TIERS in lib/pokemonPriceTracker.js.
const CONDITION_TIERS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

// Real, live bug: every raw listing was priced against the Near Mint
// market price regardless of its actual physical condition, because
// eBay's own item.condition field only distinguishes Graded vs Ungraded
// for cards - it says nothing about wear. Verified on a real deal: a
// listing titled "...Holo Dmg Priced Under Market" (seller's own words)
// was shown as 65% below a $999 Near Mint market price, when the real
// Moderately Played price was $129 - not a deal, a correctly-cheap
// damaged card. This detects a real condition signal from the listing's
// own title text - the only place a raw card's true wear is ever stated.
// Full-word phrases first (unambiguous); short tags only when bracketed
// (a standard, safe seller convention - "[LP]", "[MP]"). Deliberately
// excludes bare "HP" - "100 HP"/"170 HP" (the card's own Hit Points)
// appears in nearly every raw card's title and would otherwise be
// misread as "Heavily Played" on almost every single listing. No match
// at all keeps the existing default assumption (Near Mint) - this only
// ever downgrades a listing away from that default when there's a real
// signal to downgrade it, never invents a worse condition out of nothing.
const CONDITION_SIGNALS = [
  { tier: "Damaged", pattern: /\b(damaged?|dmg|water[\s-]?damage|bent|creased?|torn|stained|poor condition)\b/i },
  // Bare "HP" is normally ignored (it's the card's Hit Points - "120 HP" -
  // in almost every title). But "HP" as the LAST token right after a
  // full "103/130" collector number is a condition tag, not a stat: the
  // number before it is the set size, and a real Hit Points value never
  // trails the collector number. Verified live: "Turtwig ... 103/130 HP"
  // ($7.23) was priced against the $25.86 Near Mint value as "72% off"
  // when the real Heavily Played price is $2.73.
  { tier: "Heavily Played", pattern: /heav(?:y|ily)[\s-]?play(?:ed)?|\[\s*hp\s*\]|\(\s*hp\s*\)|\d+\s*\/\s*\d+\s+hp\s*$/i },
  { tier: "Moderately Played", pattern: /moderate(?:ly)?[\s-]?play(?:ed)?|\[\s*mp\s*\]|\(\s*mp\s*\)|\bmp\b/i },
  { tier: "Lightly Played", pattern: /light(?:ly)?[\s-]?play(?:ed)?|\[\s*lp\s*\]|\(\s*lp\s*\)|\blp\b/i },
  { tier: "Near Mint", pattern: /near[\s-]?mint|\bnm\b/i },
];

// Two condition abbreviations joined by "-" or "/" ("MP-HP", "NM/MT",
// "LP-MP") - a common seller shorthand for "somewhere between these two".
// Verified missed live: "...Neo Revelation Unlimited Holo 14/64 MP-HP"
// was priced against the Near Mint market value and shown as 65% below
// market. Grades the listing at the WORSE of the two tiers. "ex" is
// deliberately NOT an accepted abbreviation here - it collides with
// Pokemon-EX card names ("Charizard EX / ...").
const CONDITION_ABBR = { nm: 0, mt: 0, vg: 2, lp: 1, mp: 2, hp: 3, pld: 2, dmg: 4 };
const CONDITION_PAIR = /\b(nm|mt|vg|lp|mp|hp|pld|dmg)\s*[-/]\s*(nm|mt|vg|lp|mp|hp|pld|dmg)\b/i;

function detectListingCondition(title) {
  const pair = title.match(CONDITION_PAIR);
  if (pair) {
    const worst = Math.max(CONDITION_ABBR[pair[1].toLowerCase()], CONDITION_ABBR[pair[2].toLowerCase()]);
    return CONDITION_TIERS[worst];
  }
  for (const { tier, pattern } of CONDITION_SIGNALS) {
    if (pattern.test(title)) return tier;
  }
  return "Near Mint";
}

// The worse (further from Near Mint) of two tier strings. Used to
// reconcile the title-derived condition with eBay's structured "Card
// Condition" descriptor - if either source says the card is played, the
// card is played. Unknown/na inputs are ignored rather than treated as
// Near Mint.
function worseCondition(a, b) {
  const ia = CONDITION_TIERS.indexOf(a);
  const ib = CONDITION_TIERS.indexOf(b);
  if (ia === -1) return ib === -1 ? "Near Mint" : b;
  if (ib === -1) return a;
  return CONDITION_TIERS[Math.max(ia, ib)];
}

// byCondition is whatever real tiers PokemonPriceTracker actually has
// priced for this card (often sparse - 1-2 tiers, not all 5, verified on
// real cards). fallbackPrice is the Near-Mint-targeted pickMarketPrice
// result (see getConditionPrices) - the number every listing used before
// per-listing condition detection existed.
//
// Owns the WHOLE fallback decision (not split with the caller) because an
// earlier version of this function let a real bug slip through: it fell
// back to a BETTER tier (including all the way to fallbackPrice) whenever
// the exact detected tier had no data, even for an explicit worse-than-
// Near-Mint signal. Verified live: a listing titled "...DAMAGED" for a
// card where PokemonPriceTracker only has a Near Mint price ($599.22, no
// worse tier recorded at all) was still compared against that $599.22 -
// the exact false-discount bug this whole fix exists to prevent, just one
// layer deeper. The rule now: a DETECTED signal (seller said so
// themselves) only ever gets a same-or-worse tier's real price - never a
// better one, and never fallbackPrice (which targets Near Mint) - if none
// exists, this listing can't be safely priced at all and the caller must
// skip it rather than guess. Only the true DEFAULT case (no signal found,
// "Near Mint" is an assumption, not a detection) is allowed to use
// fallbackPrice.
function selectConditionPrice(byCondition, detectedTier, fallbackPrice) {
  const detectedIdx = CONDITION_TIERS.indexOf(detectedTier);
  if (detectedIdx === -1) return fallbackPrice ?? null;

  if (byCondition?.[detectedTier] != null) return byCondition[detectedTier];

  if (detectedTier !== "Near Mint") {
    for (let i = detectedIdx + 1; i < CONDITION_TIERS.length; i++) {
      const price = byCondition?.[CONDITION_TIERS[i]];
      if (price != null) return price;
    }
    return null;
  }

  return fallbackPrice ?? null;
}

module.exports = {
  SANITY_FLOOR_PCT,
  MIN_SELLER_FEEDBACK_PCT,
  MIN_SELLER_FEEDBACK_SCORE,
  EXCLUDED_TITLE_PATTERN,
  NON_CARD_MERCHANDISE_PATTERN,
  EMPTY_PACKAGING_PATTERN,
  qualifiesAsTradingCard,
  PROXY_COUNTERFEIT_PATTERN,
  admitsProxyOrCounterfeit,
  authenticityRisk,
  visualIdentityMismatch,
  HIGH_RISK_SCORE,
  listingTrustRisk,
  isHighRiskBelowMarket,
  hasExactItemUrl,
  SEALED_EXCLUDED_TITLE_PATTERN,
  coreTokens,
  setTokensFor,
  setEvidenceInTitle,
  parseCatalogNumber,
  titleCollectorNumbers,
  collectorNumberConflict,
  megaFormAsserted,
  exMechanicAsserted,
  formIdentityConflict,
  listingMatchesCard,
  isTrustworthyListing,
  isTrustworthySealedListing,
  listingMatchesSealedProduct,
  CONDITION_TIERS,
  detectListingCondition,
  worseCondition,
  selectConditionPrice,
  GRADED_CARD_PATTERN,
  GRADER_MENTION_PATTERN,
  SLAB_GRADERS_STRONG,
  SLAB_GRADERS_WEAK,
  mentionsSlabGrader,
  titleLooksGraded,
  rawSaleMatchesPrinting,
  rawSalePriceIsPlausible,
  RAW_SALE_HIGH_RATIO_CEILING,
};

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
];

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

  // The card name alone is often just the Pokemon's name ("Charizard",
  // "Gengar", "Pikachu"...), which is shared across dozens of sets worth
  // wildly different amounts - verified a sweep matched "Charizard" (SM -
  // Team Up) to a listing for a completely different, much more recent
  // "Charizard ex... Paldean Fates" print before this check existed.
  // Requiring the set to match too is what actually disambiguates which
  // specific print a listing is.
  const setTokens = setTokensFor(card.set ?? "");
  if (setTokens.length > 0 && !setTokens.every((token) => tokenMatchesTitle(token, title))) return false;

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

  const setTokens = setTokensFor(product.set ?? "");
  if (setTokens.length > 0 && !setTokens.every((token) => tokenMatchesTitle(token, title))) return false;

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
  listingMatchesCard,
  isTrustworthyListing,
  isTrustworthySealedListing,
  listingMatchesSealedProduct,
  CONDITION_TIERS,
  detectListingCondition,
  worseCondition,
  selectConditionPrice,
};

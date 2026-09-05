// Phase 13E.2 - THE PROMPT PACK for the OpenAI image-generated brand
// asset library.
//
// HARD BOUNDARY (docs/social-asset-library.md SS2): every string this
// module produces is EVERGREEN and DATA-FREE. `buildAssetPrompt` accepts
// only three enum parameters - family, style, zone - and nothing else.
// It is structurally impossible to pass a card name, Pokemon name, set
// name, price, discount, listing id, seller name, search query, PPT
// figure, or user identity into an image prompt through this module:
// there is no parameter that would carry one, and any unexpected key
// throws. `assertDataFree()` is the belt-and-braces runtime check the
// generator and the tests both run over the finished string.
//
// The deterministic HTML renderer (lib/social/templates.mjs) overlays
// ALL real, approved facts (card name, %, prices, disclosure, CTA,
// wordmark) AFTER an image is generated. The image model never sees any
// of them.
//
// This module makes NO network call and imports nothing from the live
// data layer. It is pure string building.

// 13e2.1: motifs no longer lean on blank-card / slab / rounded-rectangle
// shapes (an earlier experiment showed image models drift those into
// fake cards / fake Pokemon), and every prompt now carries an emphatic
// DO-NOT-DRAW-A-CARD block plus an explicit empty hero zone. The real
// card is composited afterwards (Version C).
import { OPENAI_IMAGE_REQUEST_SIZE } from "./imageModelConfig.mjs";

export const PROMPT_SPEC_VERSION = "13e2.1-v1";

// The 10 reusable asset categories (SS1). Ids are stable manifest keys.
export const ASSET_FAMILIES = Object.freeze([
  "deal_intelligence",
  "just_found",
  "market_watch",
  "pokemon_watch",
  "set_watch",
  "raw_vs_graded",
  "auction_watch",
  "collector_education",
  "trust_verification",
  "search_discovery",
]);

// The 4 visual style families (SS9) - so the 30 assets are not
// homogeneous.
export const STYLE_FAMILIES = Object.freeze([
  "clean_editorial",
  "dark_market_intelligence",
  "collector_desk",
  "abstract_market",
]);

// The 5 composition zones (SS8) - each leaves a deliberate, predictable
// empty region for the deterministic text overlay.
export const COMPOSITION_ZONES = Object.freeze(["A", "B", "C", "D", "E"]);

// --- shared clauses ------------------------------------------------------

const SHARED_INTRO =
  "Original branded background graphic for a Pokemon-card MARKET-INTELLIGENCE / deal-research tool called PokemonDealFinder. " +
  "Premium, restrained, editorial. Portrait 4:5 aspect ratio (1080x1350), designed as a social-media background that will have text and data laid over it later.";

const SHARED_BRAND =
  "Brand palette ONLY: signal red (#DC2626), pure white, charcoal / near-black (#18181B), and soft neutral greys. " +
  "Feel: modern marketplace intelligence, collector research desk, financial-data calm. " +
  "NOT childish, NOT a toy advert, NOT a gaming meme, NOT casino, NOT crypto-trading, NOT a loud discount blowout.";

const SHARED_CONSTRAINTS =
  "Composition constraints: generous negative space, clean margins, nothing busy near the reserved empty zone, high tonal separation so overlaid text will stay legible, " +
  "subtle depth (soft shadow, gentle gradient, fine grain) rather than flat clip-art. No border frame. No vignette so heavy it darkens the text zone.";

// The universal prohibition. Repeated verbatim into every prompt AND
// checked by assertDataFree() / the QA gate.
export const SHARED_NEGATIVE =
  "MUST NOT contain: any Poke Ball or sphere-with-band shape; the Pokemon logo or wordmark; any Pokemon creature, character, monster, mascot, or recognizable Pokemon silhouette; " +
  "Nintendo, The Pokemon Company, Game Freak, PSA, BGS, CGC, TCGplayer, or eBay logos or branding; any real trading-card artwork or recognizable character art; " +
  "any real or fabricated card name, set symbol, rarity mark, or energy symbol; readable text, letterforms, numbers, watermarks, signatures, or UI chrome of any kind; " +
  "photographs of real people or real merchandise; QR codes. " +
  "Do NOT draw a trading card, a playing card, a blank card, a card silhouette or outline, a graded-card slab, a card sleeve with a card in it, or a plain rounded-rectangle standing in for a card, ANYWHERE in the frame - a real card is composited in afterwards, so any card-shaped object here would read as fake product.";

// 13E.2.1 SS7 - the emphatic no-fake-card block, in every prompt.
export const NO_CARD_DRAWING =
  "ABSOLUTE RULES:\n" +
  "- DO NOT DRAW A TRADING CARD.\n" +
  "- DO NOT DRAW CARD ARTWORK OR A CARD FACE.\n" +
  "- DO NOT DRAW CREATURES, MONSTERS, OR POKEMON-LIKE CHARACTERS.\n" +
  "- DO NOT DRAW A CARD, SLAB, OR RECTANGULAR PRODUCT SHAPE INSIDE THE RESERVED HERO ZONE.\n" +
  "- LEAVE THE RESERVED HERO ZONE COMPLETELY EMPTY - it is where a real card image is composited later.";

// --- per-style clauses -------------------------------------------------

const STYLE_CLAUSES = Object.freeze({
  clean_editorial:
    "STYLE - Clean Editorial: bright white or barely-warm off-white ground, one or two precise red accents, lots of air, magazine-cover minimalism, " +
    "a single crisp geometric focal element, thin hairline rules, soft natural light.",
  dark_market_intelligence:
    "STYLE - Dark Market Intelligence: charcoal / near-black ground, faint dark-on-dark data grid, soft red glow, fine luminous plotting lines, " +
    "analytics-dashboard calm, deep matte finish, one restrained bright accent.",
  collector_desk:
    "STYLE - Collector Desk: an original overhead or three-quarter view of a tidy research desk - neutral desk mat, a simple line-art magnifying glass, a folded neutral cloth, " +
    "a soft pool of daylight, shallow depth of field. Generic desk props only - NO cards, NO sleeves-with-cards, NO slabs. Nothing branded, nothing readable.",
  abstract_market:
    "STYLE - Abstract Market: geometric abstraction of price movement and signal - ascending step lines, a calm baseline, scatter dots, a faint scanner sweep, translucent overlapping planes and soft light shafts, " +
    "gentle parallax depth, red/charcoal/white only. NO card shapes, NO rectangles that could read as cards.",
});

// --- per-family motif clauses ---------------------------------------------
// Each family gets its own visual hook so the feed does not read as one
// repeated template. None of these reference any specific card, price, or
// listing - they are mood/motif only.

const FAMILY_SPEC = Object.freeze({
  deal_intelligence: {
    label: "Deal Intelligence",
    usedBy: "deal-of-day",
    defaultStyle: "abstract_market",
    defaultZone: "C",
    motif:
      "MOTIF - Deal Intelligence: an implied horizontal reference line with a confident red bracket dropping below it to mark a gap, a single downward step, a faint spotlight cone and soft grain. " +
      "Sense of one opportunity spotted against a fair-value line - measured, not hyped. NO card, NO product shape - the hero zone stays empty.",
  },
  just_found: {
    label: "Just Found",
    usedBy: "just-found",
    defaultStyle: "clean_editorial",
    defaultZone: "A",
    motif:
      "MOTIF - Just Found: a single scanner sweep line just crossing the frame, a soft 'new' pulse ring, a light motion trail and lens flare, clean white space. " +
      "Sense of something a monitor has just surfaced. NO card, NO object sliding in - the hero zone stays empty.",
  },
  market_watch: {
    label: "Market Watch",
    usedBy: "market-snapshot",
    defaultStyle: "dark_market_intelligence",
    defaultZone: "D",
    motif:
      "MOTIF - Market Watch: a quiet histogram / dot-plot of abstract bars and points with a calm median line across, a few bars lifted in red as outliers, faint grid. " +
      "Sense of surveying a whole market at a glance. Bars are thin data marks, NOT card shapes; the hero zone stays empty.",
  },
  pokemon_watch: {
    label: "Pokemon Watch",
    usedBy: "pokemon-spotlight",
    defaultStyle: "collector_desk",
    defaultZone: "B",
    motif:
      "MOTIF - Pokemon Watch: a large line-art magnifying glass and a soft focus ring on an empty desk surface, the rest falling into shallow-focus blur, one warm light pool. " +
      "Sense of tracking one subject across many listings. NO creature, NO silhouette, NO card - the hero zone stays empty.",
  },
  set_watch: {
    label: "Set Watch",
    usedBy: "set-spotlight",
    defaultStyle: "abstract_market",
    defaultZone: "B",
    motif:
      "MOTIF - Set Watch: a faint completion progress arc and a row of small evenly-spaced tick marks implying a run being tracked, gentle depth, one red accent tick. " +
      "Ticks are tiny marks, NOT cards or rectangles; NO set symbols, NO numbering; the hero zone stays empty.",
  },
  raw_vs_graded: {
    label: "Raw vs Graded",
    usedBy: "(education / comparison posts)",
    defaultStyle: "clean_editorial",
    defaultZone: "C",
    motif:
      "MOTIF - Raw vs Graded: a clean vertical divider splitting the frame into two calm tonal halves - one warm/open, one cool/enclosed - with balanced neutral lighting and soft grain. " +
      "An abstract split only. NO cards, NO slab, NO product shapes on either side; the hero zone stays empty.",
  },
  auction_watch: {
    label: "Auction Watch",
    usedBy: "(auction-timing posts)",
    defaultStyle: "dark_market_intelligence",
    defaultZone: "D",
    motif:
      "MOTIF - Auction Watch: a soft thinning ring of light / countdown arc, a gentle pulse, a faint ascending step line, restrained tension in charcoal and red. " +
      "NO clock numerals, NO gavel, NO hammer, NO card; the hero zone stays empty.",
  },
  collector_education: {
    label: "Collector Education",
    usedBy: "(how-it-works / guide posts)",
    defaultStyle: "collector_desk",
    defaultZone: "A",
    motif:
      "MOTIF - Collector Education: a calm arrangement of empty callout positions - connector lines and dots leading to blank label anchors - on a clean desk surface, textbook clarity, soft daylight. " +
      "Positions and connectors only, NO label text, NO card anatomy diagram, NO card; the hero zone stays empty.",
  },
  trust_verification: {
    label: "Trust / Verification",
    usedBy: "(methodology / verification posts)",
    defaultStyle: "clean_editorial",
    defaultZone: "C",
    motif:
      "MOTIF - Trust / Verification: a precise crosshair align mark and a soft concentric check-ring with a faint verified glow, calm and exact. " +
      "NO real checkmark-brand styling, NO badge logos, NO card; the hero zone stays empty.",
  },
  search_discovery: {
    label: "Search / Discovery",
    usedBy: "(search-feature posts)",
    defaultStyle: "abstract_market",
    defaultZone: "B",
    motif:
      "MOTIF - Search / Discovery: a large original line-art magnifying glass sweeping across a faint scanner grid, the area inside the lens crisp and the rest softly blurred, one red focus dot. " +
      "Sense of finding the one that matters. NO cards in or out of the lens, NO product shapes; the hero zone stays empty.",
  },
});

export function familySpec(family) {
  const s = FAMILY_SPEC[family];
  if (!s) throw new Error(`assetPrompts: unknown family "${family}". Known: ${ASSET_FAMILIES.join(", ")}`);
  return s;
}

// --- composition zones + safe-zone geometry (SS8) -----------------------
// Rects are [x, y, w, h] on the fixed 1080x1350 canvas: the region the
// generated art should keep calm/low-contrast so the deterministic
// overlay lands cleanly. Stored into every manifest entry.

export const SAFE_ZONE_PRESETS = Object.freeze({
  A: {
    name: "TOP TEXT ZONE",
    clause: "Reserve the TOP THIRD of the frame (roughly the upper 460 px) as calm, low-detail, near-uniform space for a headline overlay. Put visual interest in the lower two thirds.",
    clear: [[48, 40, 984, 460]],
    text: { headline: "top band, 64-96px", metric: "upper-mid", footer: "bottom band" },
  },
  B: {
    name: "LEFT TEXT ZONE",
    clause: "Reserve the LEFT COLUMN (roughly the left 560 px) as calm, low-detail space for a stacked headline + metric overlay. Put the focal imagery in the right half.",
    clear: [[48, 120, 520, 1110]],
    text: { headline: "left column top", metric: "left column mid", footer: "bottom band" },
  },
  C: {
    name: "CENTER METRIC ZONE",
    clause: "Reserve a CENTERED HORIZONTAL BAND (roughly y 360 to y 980) as calm, evenly-lit space for a large central metric overlay. Frame it with imagery above and below.",
    clear: [[80, 360, 920, 620]],
    text: { headline: "above the band", metric: "dead centre", footer: "below the band" },
  },
  D: {
    name: "LOWER EVIDENCE ZONE",
    clause: "Reserve the LOWER TWO-FIFTHS of the frame (roughly y 800 downwards) as calm, low-detail space for an evidence / stats overlay. Put the hero imagery in the upper three-fifths.",
    clear: [[48, 800, 984, 500]],
    text: { headline: "top", metric: "upper-mid", footer: "lower block" },
  },
  E: {
    name: "FULL-BLEED EDITORIAL",
    clause: "Full-bleed editorial image. Keep only a slim top strip (upper 150 px) and a slim bottom strip (lower 170 px) calm for a small category pill and a footer; the rest can be a confident full composition with strong but not text-hostile contrast.",
    clear: [[48, 24, 984, 150], [48, 1180, 984, 146]],
    text: { headline: "over-image, high contrast area", metric: "over-image", footer: "bottom strip" },
  },
});

export function zonePreset(zone) {
  const z = SAFE_ZONE_PRESETS[zone];
  if (!z) throw new Error(`assetPrompts: unknown zone "${zone}". Known: ${COMPOSITION_ZONES.join(", ")}`);
  return z;
}

// --- the prompt builder ------------------------------------------------
// The ONLY public way to make a prompt. Accepts exactly { family, style,
// zone } - all enum-validated - and NOTHING else. Passing any other key
// throws, by design: this is the structural guarantee that no live data
// can be smuggled into an image prompt.

export function buildAssetPrompt(params = {}) {
  const keys = Object.keys(params);
  const allowed = new Set(["family", "style", "zone"]);
  const extra = keys.filter((k) => !allowed.has(k));
  if (extra.length) {
    throw new Error(
      `buildAssetPrompt: unexpected key(s) [${extra.join(", ")}] - the image prompt is data-free by construction; only { family, style, zone } are accepted.`
    );
  }

  const { family, style, zone } = params;
  const spec = familySpec(family);
  const styleKey = style ?? spec.defaultStyle;
  const zoneKey = zone ?? spec.defaultZone;
  if (!STYLE_CLAUSES[styleKey]) throw new Error(`buildAssetPrompt: unknown style "${styleKey}". Known: ${STYLE_FAMILIES.join(", ")}`);
  const z = zonePreset(zoneKey);

  const prompt = [
    SHARED_INTRO,
    STYLE_CLAUSES[styleKey],
    spec.motif,
    `COMPOSITION - ${z.name}: ${z.clause}`,
    // 13E.2.1 - the hero zone is where a REAL card is composited later; it
    // must be left visually empty by the background.
    `RESERVED HERO ZONE: leave a large, calm, empty vertical region (roughly the central 60% of the height, ${z.name === "LEFT TEXT ZONE" ? "on the RIGHT side" : "centred"}) with nothing in it - no object, no shape, no rectangle, no card. A real product image is composited into that space afterwards.`,
    SHARED_BRAND,
    SHARED_CONSTRAINTS,
    "NO TEXT of any kind rendered inside the image - all words and numbers are added later by a separate layout system.",
    NO_CARD_DRAWING,
    SHARED_NEGATIVE,
  ].join("\n\n");

  assertDataFree(prompt);

  return {
    spec_version: PROMPT_SPEC_VERSION,
    family,
    style: styleKey,
    zone: zoneKey,
    aspect_ratio: "4:5",
    render_size: OPENAI_IMAGE_REQUEST_SIZE,
    safe_zones: { zone: zoneKey, name: z.name, clear: z.clear, text: z.text },
    prompt,
  };
}

// --- the data-free guard --------------------------------------------------
// Belt and braces. The prompt is static by construction, but the
// generator runs this over the finished string immediately before any
// API call, and the test-suite runs it over every family/style/zone
// combination AND over deliberately-poisoned strings.

const LIVE_DATA_SIGNATURES = [
  /\$\s?\d/, // a price
  /\d\s?%\s*(off|below|under|discount|gap|less|cheaper)/i, // a discount figure
  /\b\d+(\.\d+)?\s?%\s+(under|below|off)\b/i, // "24% under" / "24% below"
  /\b(PSA|BGS|CGC|SGC)\s?\d/i, // a grade
  /\bunder market\b/i,
  /\bmarket ref(erence)?\b/i,
  /\bdiscount_pct\b|\btotal_price\b|\bmarket_price\b|\blisting_id\b|\bwatchlist_id\b|\bdeal[_ ]?id\b/i,
  /\bcard_name\b|\bcard_set\b|\bseller\b|\bsearch query\b|\bdistinct_id\b|\bcard_tcgplayer_id\b/i,
  /\bcharizard\b|\bpikachu\b|\bumbreon\b|\bmoonbreon\b|\beevee\b/i, // common card subjects
  /\bebay\.com\b|\bi\.ebayimg\.com\b|\/itm\//i,
  // 13E.2.1 - a real card IMAGE, image URL, catalogue product id, or a
  // local cache path must never be near a background prompt
  /\bhttps?:\/\/(?!www\.w3\.org)/i, // any http(s) URL except the SVG xmlns
  /tcgplayer-cdn|tcgplayer\.com\/product|\bproduct\/\d{3,}/i,
  /\.(jpe?g|png|webp)\b/i,
  /file:\/\/|card-art-cache/i,
];

export function assertDataFree(text) {
  const s = String(text ?? "");
  for (const re of LIVE_DATA_SIGNATURES) {
    // SHARED_NEGATIVE legitimately NAMES some forbidden brands ("eBay
    // logos", "PSA") as things to exclude - allow those mentions only
    // inside the explicit prohibition sentence, nowhere else.
    const m = s.match(re);
    if (!m) continue;
    const idx = m.index ?? 0;
    const around = s.slice(Math.max(0, idx - 40), idx + 40);
    const inProhibition = /MUST NOT|logos or branding|NO real|NO set symbols|NO grade number/i.test(around);
    if (!inProhibition) {
      throw new Error(`assertDataFree: prompt contains a live-data signature (${re}) near "${around.trim()}"`);
    }
  }
  return true;
}

// Every prompt the pack can produce, expanded - used by `social:assets
// plan` and by tests. One entry per (family, style, zone) chosen below;
// the DEFAULT plan is 3 variants per family (SS7).

// Three deliberate variants per family: the family default, plus two
// contrasting (style, zone) pairs so the set is visually varied (SS9).
export const VARIANT_PLAN = Object.freeze({
  deal_intelligence: [
    { variant: "A", style: "abstract_market", zone: "C" },
    { variant: "B", style: "clean_editorial", zone: "A" },
    { variant: "C", style: "dark_market_intelligence", zone: "D" },
  ],
  just_found: [
    { variant: "A", style: "clean_editorial", zone: "A" },
    { variant: "B", style: "abstract_market", zone: "B" },
    { variant: "C", style: "collector_desk", zone: "D" },
  ],
  market_watch: [
    { variant: "A", style: "dark_market_intelligence", zone: "D" },
    { variant: "B", style: "abstract_market", zone: "C" },
    { variant: "C", style: "clean_editorial", zone: "A" },
  ],
  pokemon_watch: [
    { variant: "A", style: "collector_desk", zone: "B" },
    { variant: "B", style: "clean_editorial", zone: "A" },
    { variant: "C", style: "abstract_market", zone: "C" },
  ],
  set_watch: [
    { variant: "A", style: "abstract_market", zone: "B" },
    { variant: "B", style: "collector_desk", zone: "D" },
    { variant: "C", style: "clean_editorial", zone: "A" },
  ],
  raw_vs_graded: [
    { variant: "A", style: "clean_editorial", zone: "C" },
    { variant: "B", style: "collector_desk", zone: "B" },
    { variant: "C", style: "dark_market_intelligence", zone: "D" },
  ],
  auction_watch: [
    { variant: "A", style: "dark_market_intelligence", zone: "D" },
    { variant: "B", style: "abstract_market", zone: "C" },
    { variant: "C", style: "clean_editorial", zone: "A" },
  ],
  collector_education: [
    { variant: "A", style: "collector_desk", zone: "A" },
    { variant: "B", style: "clean_editorial", zone: "B" },
    { variant: "C", style: "abstract_market", zone: "D" },
  ],
  trust_verification: [
    { variant: "A", style: "clean_editorial", zone: "C" },
    { variant: "B", style: "dark_market_intelligence", zone: "D" },
    { variant: "C", style: "collector_desk", zone: "A" },
  ],
  search_discovery: [
    { variant: "A", style: "abstract_market", zone: "B" },
    { variant: "B", style: "clean_editorial", zone: "A" },
    { variant: "C", style: "collector_desk", zone: "C" },
  ],
});

// The first-pass SAMPLE (SS21): 2 variants each of 5 families = 10.
export const SAMPLE_SELECTION = Object.freeze([
  ["deal_intelligence", "A"], ["deal_intelligence", "B"],
  ["just_found", "A"], ["just_found", "B"],
  ["market_watch", "A"], ["market_watch", "B"],
  ["pokemon_watch", "A"], ["pokemon_watch", "B"],
  ["set_watch", "A"], ["set_watch", "B"],
]);

export function assetId(family, variant) {
  return `${family}__${variant}`;
}

// Expand the whole plan into fully-built prompt specs (no I/O).
export function expandPlan({ sampleOnly = false } = {}) {
  const out = [];
  for (const family of ASSET_FAMILIES) {
    for (const v of VARIANT_PLAN[family]) {
      if (sampleOnly && !SAMPLE_SELECTION.some(([f, vv]) => f === family && vv === v.variant)) continue;
      const built = buildAssetPrompt({ family, style: v.style, zone: v.zone });
      out.push({
        id: assetId(family, v.variant),
        category: family,
        variant: v.variant,
        sample: SAMPLE_SELECTION.some(([f, vv]) => f === family && vv === v.variant),
        ...built,
      });
    }
  }
  return out;
}

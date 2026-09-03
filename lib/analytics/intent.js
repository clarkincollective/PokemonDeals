// Phase 13A - derive NON-SENSITIVE structural properties from a raw
// search query WITHOUT ever emitting the query text itself.
//
// Phase 12D found real, unquantified demand for graded / grader / grade /
// price / language / collector-number search intent. 13A needs to measure
// how big each slice is so 13B can prioritise. This module turns a query
// string into booleans + small enums only. tests/scanner/analytics-intent
// asserts the raw string can never appear anywhere in the output.

const GRADED_RE = /\b(graded|slabbed|slab)\b/i;
const RAW_RE = /\b(raw|ungraded|loose)\b/i;
const GRADER_RE = /\b(psa|bgs|beckett|cgc|sgc|ace)\b/i;
// "PSA 10", "BGS 9.5", "CGC 9", "gem mint 10", bare "grade 9"
const GRADE_TOKEN_RE = /\b(?:psa|bgs|cgc|sgc|ace)\s?\d{1,2}(?:\.5)?\b|\bgrade\s?\d{1,2}(?:\.5)?\b|\bgem\s?mint\b|\bpristine\b/i;
// "$50", "under 50", "below $100", "less than 20", "over 200", "50 usd"
const PRICE_MOD_RE =
  /\$\s?\d|\b\d+\s?(?:usd|gbp|eur|aud|cad|dollars?|pounds?|euros?)\b|\b(?:under|below|less than|cheaper than|max|up to|over|above|at least|min)\s+\$?\d/i;
const LANGUAGE_MOD_RE =
  /\b(japanese|japan|jpn|jp|english|eng|german|deutsch|french|fran[cç]ais|italian|italiano|spanish|espa[nñ]ol|korean|chinese|portuguese|dutch|polish)\b/i;
// "4/102", "215/203", set-prefixed "XY95" / "SM110" / "SWSH284", bare
// 1-4 digit runs that look like a collector number when isolated.
const SLASH_NUMBER_RE = /\b\d{1,4}\s?\/\s?\d{1,4}\b/;
const PREFIX_NUMBER_RE = /\b[a-z]{2,5}\d{1,4}[a-z]?\b/i;
const BARE_NUMBER_RE = /(?:^|\s)#?\d{1,4}(?:\s|$)/;

const GRADER_MAP = [
  [/\bpsa\b/i, "psa"],
  [/\b(bgs|beckett)\b/i, "bgs"],
  [/\bcgc\b/i, "cgc"],
  [/\bsgc\b/i, "sgc"],
  [/\bace\b/i, "ace"],
];

export function graderToken(raw) {
  const s = String(raw ?? "");
  for (const [re, name] of GRADER_MAP) if (re.test(s)) return name;
  return GRADER_RE.test(s) ? "other" : "none";
}

export function queryTokenCount(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function queryLengthBand(raw) {
  const n = queryTokenCount(raw);
  if (n <= 1) return "1";
  if (n === 2) return "2";
  if (n <= 4) return "3-4";
  return "5+";
}

export function containsCollectorNumber(raw) {
  const s = String(raw ?? "");
  return SLASH_NUMBER_RE.test(s) || PREFIX_NUMBER_RE.test(s) || BARE_NUMBER_RE.test(s);
}

// Deterministic-only: we only claim a "set candidate" when the query
// clearly names a known set family. Keeps the flag trustworthy rather
// than guessing on every multi-word query.
const SET_CANDIDATE_RE =
  /\b(base set|shadowless|jungle|fossil|team rocket|gym (?:heroes|challenge)|neo (?:genesis|discovery|revelation|destiny)|expedition|aquapolis|skyridge|ruby|sapphire|emerald|firered|leafgreen|deoxys|holon|crystal guardians|dragon frontiers|power keepers|diamond|pearl|platinum|arceus|heartgold|soulsilver|triumphant|call of legends|black|white|emerging powers|noble victories|next destinies|dark explorers|dragons exalted|boundaries crossed|plasma (?:storm|freeze|blast)|legendary treasures|xy|flashfire|furious fists|phantom forces|primal clash|roaring skies|ancient origins|breakthrough|breakpoint|generations|fates collide|steam siege|evolutions|sun (?:&|and) moon|guardians rising|burning shadows|crimson invasion|ultra prism|forbidden light|celestial storm|lost thunder|team up|detective pikachu|unbroken bonds|unified minds|hidden fates|cosmic eclipse|sword (?:&|and) shield|rebel clash|darkness ablaze|champion'?s path|vivid voltage|shining fates|battle styles|chilling reign|evolving skies|celebrations|fusion strike|brilliant stars|astral radiance|pokemon go|lost origin|silver tempest|crown zenith|scarlet (?:&|and) violet|paldea evolved|obsidian flames|151|paradox rift|paldean fates|temporal forces|twilight masquerade|shrouded fable|stellar crown|surging sparks|prismatic evolutions|journey together|destined rivals)\b/i;

export function containsSetCandidate(raw) {
  return SET_CANDIDATE_RE.test(String(raw ?? ""));
}

// The one entry point. Returns ONLY structural facts about the query -
// never the query, never a substring of it.
export function classifyQueryIntent(raw) {
  const s = String(raw ?? "");
  return {
    query_token_count: queryTokenCount(s),
    query_length_band: queryLengthBand(s),
    contains_graded_token: GRADED_RE.test(s),
    contains_raw_token: RAW_RE.test(s),
    grader_token: graderToken(s),
    contains_grade_token: GRADE_TOKEN_RE.test(s),
    contains_price_modifier: PRICE_MOD_RE.test(s),
    contains_language_modifier: LANGUAGE_MOD_RE.test(s),
    contains_collector_number: containsCollectorNumber(s),
    contains_set_candidate: containsSetCandidate(s),
  };
}

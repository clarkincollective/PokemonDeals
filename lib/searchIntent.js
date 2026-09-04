// Phase 13B.2 - the deterministic search-intent parser.
//
// parseSearchIntent(raw) -> SearchIntent  (the 13B.1 contract, docs/phase-13b1-findability-architecture.md).
//
// Pure. No LLM. No I/O. No external calls. Single left-to-right pass with
// ordered claim priority; a token consumed by an earlier rule is not
// re-examined. Number disambiguation is context-sensitive (the P0 fix):
//   "pikachu psa 10"   -> grade 10        (grader/`grade` word precedes it)
//   "pikachu 10/102"   -> collector 10/102 (slash number)
//   "pikachu under 50" -> price_max 50    (comparator precedes it)
//   "pikachu 25"       -> collector 25    (default, unchanged from today)
//
// Relative imports so `node --test` can load this directly.
import { extractSpecies } from "./pokemonSpecies.js";
import { matchSetPhrase, eraFromQuery, eraForSetName } from "./pokemonSets.js";

// --------------------------------------------------------------------- vocab

const GRADER_MAP = [
  [/\bpsa\b/i, "PSA"],
  [/\b(bgs|beckett)\b/i, "BGS"],
  [/\bcgc\b/i, "CGC"],
  [/\bsgc\b/i, "SGC"],
  [/\btag\b/i, "TAG"],
  [/\bace\b/i, "ACE"],
];
// grader glued to the grade: "psa10", "cgc9.5"
const GRADER_GLUED_RE = /\b(psa|bgs|cgc|sgc|tag|ace)\s?(\d{1,2}(?:\.5)?)\b/i;
const GRADER_ANY_RE = /\b(psa|bgs|beckett|cgc|sgc|tag|ace)\b/i;

const FORMAT_GRADED_RE = /\b(graded|slabbed|slab|encased)\b/i;
const FORMAT_RAW_RE = /\b(raw|ungraded|loose|unslabbed)\b/i;

// grade context: a number 1..10(.5) that follows a grader token or the
// word "grade", or "gem mint 10" / "pristine 10".
const GRADE_AFTER_GRADER_RE =
  /\b(?:psa|bgs|beckett|cgc|sgc|tag|ace|grade)\s*(?:of\s*)?(10|[1-9](?:\.5)?)\b/i;
const GRADE_BEFORE_GRADER_RE = /\b(10|[1-9](?:\.5)?)\s+(?:psa|bgs|beckett|cgc|sgc|tag|ace)\b/i;
const GEM_MINT_RE = /\bgem\s?mint\s?(10|[1-9](?:\.5)?)?\b/i;
const PRISTINE_RE = /\bpristine\s?(10|[1-9](?:\.5)?)?\b/i;
const BLACK_LABEL_RE = /\bblack\s?label\b/i;

// "ex" / "gx" / "v" etc. are card-name suffixes, NEVER condition shorthand
// here - a query saying "excellent" spells it out. Keep condition tokens
// unambiguous so "charizard ex" isn't read as "Charizard, Excellent".
const CONDITION_MAP = [
  [/\b(near\s?mint|nm(?:-mt)?|mint(?!\s?\d))\b/i, "NM"],
  [/\b(lightly\s?played|light\s?play|\blp\b|excellent)\b/i, "LP"],
  [/\b(moderately\s?played|moderate\s?play|\bmp\b)\b/i, "MP"],
  [/\b(heavily\s?played|heavy\s?play|\bhp\b|\bpoor\b)\b/i, "HP"],
  [/\b(damaged|\bdmg\b)\b/i, "DMG"],
];

const LISTING_AUCTION_RE = /\b(auctions?|bidding|bids?)\b/i;
const LISTING_ENDING_RE = /\bending\s?soon\b/i;
const LISTING_BIN_RE = /\b(buy\s?it\s?now|bin|fixed\s?price|fixed[- ]?price)\b/i;

const LANG_JP_RE = /\b(japanese|japan|jpn|jp)\b/i;
const LANG_EN_RE = /\b(english|eng|\ben\b)\b/i;

// price
const PRICE_MAX_RE =
  /\b(?:under|below|less\s?than|cheaper\s?than|max|up\s?to|at\s?most|<=?)\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/i;
const PRICE_MIN_RE =
  /\b(?:over|above|at\s?least|more\s?than|min(?:imum)?|>=?)\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/i;
const PRICE_BETWEEN_RE =
  /\bbetween\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:and|-|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/i;
const PRICE_RANGE_DASH_RE = /\$\s*(\d+(?:\.\d{1,2})?)\s*-\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/;
const PRICE_BARE_DOLLAR_RE = /\$\s*(\d+(?:\.\d{1,2})?)\b/;

// collector numbers
const SLASH_NUMBER_RE = /\b(\d{1,4})\s*\/\s*(\d{1,4})\b/;
const PREFIXED_NUMBER_RE =
  /\b((?:xy|sm|swsh|sv|bw|hgss|dp|pl|col|bwp|xyp|smp|swshp|svp|me|hs|dv|pr)\s?[- ]?\d{1,4}[a-z]?)\b/i;
const HASH_NUMBER_RE = /#\s*([a-z]{0,5}\d{1,4}[a-z]?(?:\/\d{1,4})?)\b/i;
const BARE_NUMBER_RE = /\b(\d{1,4})[a-z]?\b/;

const stripZeros = (s) => String(s ?? "").replace(/^0+(?=\d)/, "");

// Zero-pad variants for a slash number so the resolver can match both
// "4/102" and "004/102" as stored. Also the plain and 2/3-pad forms.
export function collectorNumberVariants(num) {
  const raw = String(num ?? "").trim().toLowerCase();
  if (!raw) return [];
  const out = new Set([raw]);
  const slash = raw.match(/^(\d{1,4})\/(\d{1,4})$/);
  if (slash) {
    const [, a, b] = slash;
    const A = stripZeros(a);
    for (const pa of [A, A.padStart(2, "0"), A.padStart(3, "0")]) {
      for (const pb of [b, stripZeros(b)]) out.add(`${pa}/${pb}`);
    }
  } else if (/^\d{1,4}$/.test(raw)) {
    const A = stripZeros(raw);
    out.add(A);
    out.add(A.padStart(2, "0"));
    out.add(A.padStart(3, "0"));
  } else {
    // prefixed like "sm110" / "xy 95" -> normalise spacing/dash
    out.add(raw.replace(/[\s-]+/g, ""));
  }
  return [...out];
}

// --------------------------------------------------------------------- parse

const EMPTY_INTENT = () => ({
  raw: "",
  tokens_consumed: [],
  tokens_unmatched: [],
  subject: {
    kind: "none",
    collector_number: null,
    set: null,
    set_id: null,
    card_name: null,
    species: null,
    tcgplayer_id: null,
    card_slug: null,
    species_slug: null,
  },
  result_mode: "catalogue",
  is_exact: false,
  format: "any",
  grader: null,
  grade: null,
  condition: null,
  language: null,
  era: null,
  listing_type: "any",
  country: null,
  price_min: null,
  price_max: null,
  minimum_discount: null,
  sort: null,
  confidence: "low",
  ambiguities: [],
});

// name tokens that are card qualifiers, never modifiers - keep them in the
// name query even though they look "special".
const NAME_QUALIFIER_RE =
  /\b(ex|gx|vmax|vstar|\bv\b|prime|break|legend|star|delta|radiant|shining|dark|light|team\s?plasma|full\s?art|alt(?:ernate)?\s?art|secret|rainbow|gold|trainer\s?gallery|character\s?rare|special\s?illustration|amazing\s?rare|promo|jumbo|error|1st\s?edition|first\s?edition|holo|reverse\s?holo|non[- ]?holo)\b/i;

export function parseSearchIntent(raw, { knownSets = [] } = {}) {
  const intent = EMPTY_INTENT();
  intent.raw = String(raw ?? "");
  const original = intent.raw.trim();
  if (!original) return intent;

  // working string: lowercase, collapse ws, keep / - . $ #
  let work = original
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9/.$#'&\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const consume = (re, label) => {
    const m = work.match(re);
    if (m) {
      intent.tokens_consumed.push(label ?? m[0].trim());
      work = (work.slice(0, m.index) + " " + work.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
      return m;
    }
    return null;
  };

  // ---- 1. collector number (slash / prefixed / #) - highest identity signal
  let collector = null;
  {
    const slash = work.match(SLASH_NUMBER_RE);
    const prefixed = work.match(PREFIXED_NUMBER_RE);
    const hash = work.match(HASH_NUMBER_RE);
    if (slash) {
      collector = `${stripZeros(slash[1])}/${stripZeros(slash[2])}`;
      consume(SLASH_NUMBER_RE, "collector_number");
    } else if (hash) {
      collector = hash[1].toLowerCase().replace(/\s+/g, "");
      consume(HASH_NUMBER_RE, "collector_number");
    } else if (prefixed) {
      collector = prefixed[1].toLowerCase().replace(/[\s-]+/g, "");
      consume(PREFIXED_NUMBER_RE, "collector_number");
    }
  }

  // ---- 2. grader (incl. glued "psa10") + 3. grade
  {
    const glued = work.match(GRADER_GLUED_RE);
    if (glued) {
      intent.grader = glued[1].toUpperCase();
      intent.grade = glued[2];
      intent.format = "graded";
      consume(GRADER_GLUED_RE, "grader+grade");
    }
    if (!intent.grader) {
      for (const [re, name] of GRADER_MAP) {
        if (re.test(work)) {
          intent.grader = name;
          intent.format = "graded";
          consume(re, "grader");
          break;
        }
      }
      if (!intent.grader && GRADER_ANY_RE.test(work)) {
        intent.grader = "PSA"; // GRADER_MAP already covers all; unreachable guard
      }
    }
    if (intent.grade == null) {
      const after = work.match(GRADE_AFTER_GRADER_RE);
      const before = work.match(GRADE_BEFORE_GRADER_RE);
      const gem = work.match(GEM_MINT_RE);
      const pris = work.match(PRISTINE_RE);
      if (after) {
        intent.grade = after[1];
        consume(GRADE_AFTER_GRADER_RE, "grade");
      } else if (before) {
        intent.grade = before[1];
        consume(GRADE_BEFORE_GRADER_RE, "grade");
      } else if (gem) {
        intent.format = "graded";
        if (gem[1]) intent.grade = gem[1];
        consume(GEM_MINT_RE, "gem_mint");
      } else if (pris) {
        intent.format = "graded";
        if (pris[1]) intent.grade = pris[1];
        consume(PRISTINE_RE, "pristine");
      }
    }
    // a lone "grade" number when a grader was consumed earlier but the
    // grade wasn't glued: "pikachu 10 psa" handled by GRADE_BEFORE; but
    // "pikachu psa ... 10" with words between - if grader set and a bare
    // 1..10 remains and no collector slash claimed it, treat it as grade.
    if (intent.grader && intent.grade == null) {
      const bare = work.match(/\b(10|[1-9](?:\.5)?)\b/);
      if (bare) {
        intent.grade = bare[1];
        consume(/\b(10|[1-9](?:\.5)?)\b/, "grade");
      }
    }
  }

  // ---- 4. format words
  if (intent.format !== "graded" && consume(FORMAT_GRADED_RE, "graded")) intent.format = "graded";
  if (intent.format === "any" && consume(FORMAT_RAW_RE, "raw")) intent.format = "raw";
  // grader implies graded (already set); explicit "raw" + grader is contradictory -> grader wins
  if (intent.grader) intent.format = "graded";

  // ---- 5. condition (raw only; skip if graded)
  if (intent.format !== "graded") {
    for (const [re, cond] of CONDITION_MAP) {
      if (re.test(work)) {
        intent.condition = cond;
        consume(re, "condition");
        break;
      }
    }
  }

  // ---- 6. price
  {
    const between = work.match(PRICE_BETWEEN_RE) || work.match(PRICE_RANGE_DASH_RE);
    if (between) {
      const a = Number(between[1]);
      const b = Number(between[2]);
      intent.price_min = Math.min(a, b);
      intent.price_max = Math.max(a, b);
      consume(work.match(PRICE_BETWEEN_RE) ? PRICE_BETWEEN_RE : PRICE_RANGE_DASH_RE, "price_range");
    } else {
      const max = work.match(PRICE_MAX_RE);
      const min = work.match(PRICE_MIN_RE);
      if (max) {
        intent.price_max = Number(max[1]);
        consume(PRICE_MAX_RE, "price_max");
      }
      if (min) {
        intent.price_min = Number(min[1]);
        consume(PRICE_MIN_RE, "price_min");
      }
      if (intent.price_max == null && intent.price_min == null) {
        const bare = work.match(PRICE_BARE_DOLLAR_RE);
        if (bare) {
          intent.price_max = Number(bare[1]); // "$200" => ceiling
          consume(PRICE_BARE_DOLLAR_RE, "price_max");
        }
      }
    }
  }

  // ---- 7. listing type
  if (consume(LISTING_ENDING_RE, "ending_soon")) {
    intent.listing_type = "AUCTION";
    intent.sort = "ending_soon";
  }
  if (intent.listing_type === "any" && consume(LISTING_AUCTION_RE, "auction")) intent.listing_type = "AUCTION";
  if (intent.listing_type === "any" && consume(LISTING_BIN_RE, "bin")) intent.listing_type = "BIN";
  // stray "now" left from "buy it now" partial match
  work = work.replace(/\bbuy it\b/g, " ").replace(/\s+/g, " ").trim();

  // ---- 8. language
  if (consume(LANG_JP_RE, "japanese")) intent.language = "japanese";
  else if (consume(LANG_EN_RE, "english")) intent.language = "english";

  // ---- 9. era / set phrase
  {
    // Curated SET_PHRASES are hand-verified and win a tie, but a LONGER
    // alias from the full card_catalog vocabulary beats a curated
    // substring match ("sword and shield base set" must not be reduced to
    // "base set"). Phase 13B.5.1.
    const curatedHit = matchSetPhrase(work);
    const knownHit = matchSetPhraseFromKnown(work, knownSets);
    let setHit = curatedHit;
    if (knownHit && (!curatedHit || knownHit.phrase.length > curatedHit.phrase.length)) {
      setHit = knownHit;
    }
    if (setHit) {
      intent.subject.set = setHit.canonical;
      if (setHit.setId) intent.subject.set_id = setHit.setId;
      // remove the phrase tokens from work
      work = work.replace(new RegExp(`\\b${escapeRe(setHit.phrase)}\\b`, "i"), " ").replace(/\s+/g, " ").trim();
      intent.tokens_consumed.push(`set:${setHit.canonical}`);
    }
    intent.era = eraFromQuery(original) || eraForSetName(intent.subject.set);
  }

  // ---- 10. species (from whatever name tokens remain)
  {
    const sp = extractSpecies(work) || extractSpecies(original);
    if (sp) {
      intent.subject.species = sp;
      intent.subject.species_slug = slugish(sp);
    }
  }

  // ---- 11. leftover -> card_name query
  const leftover = work.replace(/\s+/g, " ").trim();
  intent.tokens_unmatched = leftover ? leftover.split(" ") : [];
  if (leftover) intent.subject.card_name = leftover;

  // ---- collector number: bare-number fallback (context-safe)
  if (!collector && intent.grade == null && intent.price_max == null && intent.price_min == null) {
    const bare = leftover.match(BARE_NUMBER_RE);
    if (bare) {
      const n = bare[1];
      // don't treat a 4-digit year-ish number as a collector number's denominator
      collector = stripZeros(n);
      intent.subject.card_name = leftover.replace(BARE_NUMBER_RE, "").replace(/\s+/g, " ").trim() || null;
      intent.tokens_unmatched = intent.subject.card_name ? intent.subject.card_name.split(" ") : [];
      intent.tokens_consumed.push("collector_number(bare)");
    }
  }
  intent.subject.collector_number = collector;

  // ---- subject.kind + result_mode + confidence ----
  finaliseSubject(intent);
  return intent;
}

// ---- helpers --------------------------------------------------------

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function slugish(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Set phrase from a DB-provided list. Each entry is { name, setId?, slug?,
// phrases? } - `phrases` is the deterministic alias list (buildSetAliases,
// with cross-vocabulary collisions already removed). Falls back to the
// canonical name when no aliases are supplied. The LONGEST alias that
// occurs word-bounded in the query wins, so "base set 2" beats "base set".
// Used by the API route, which passes the real card_catalog set vocabulary
// (Phase 13B.5.1); curated matchSetPhrase() still runs first.
function matchSetPhraseFromKnown(work, knownSets) {
  if (!Array.isArray(knownSets) || knownSets.length === 0) return null;
  const hay = ` ${String(work).toLowerCase()} `;
  const cands = [];
  for (const s of knownSets) {
    if (!s || !s.name) continue;
    const setId = s.setId ?? s.set_id ?? null;
    const phrases =
      Array.isArray(s.phrases) && s.phrases.length ? s.phrases : [s.name.toLowerCase()];
    for (const p of phrases) {
      const phrase = String(p ?? "").toLowerCase().trim();
      if (phrase.length >= 4) cands.push({ canonical: s.name, phrase, setId });
    }
  }
  cands.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const c of cands) {
    if (hay.includes(` ${c.phrase} `)) return c;
  }
  return null;
}

function hasAcquisitionModifier(intent) {
  return (
    intent.format !== "any" ||
    intent.grader != null ||
    intent.grade != null ||
    intent.condition != null ||
    intent.listing_type !== "any" ||
    intent.price_min != null ||
    intent.price_max != null ||
    intent.minimum_discount != null
  );
}

function finaliseSubject(intent) {
  const s = intent.subject;
  const hasNumber = Boolean(s.collector_number);
  const hasName = Boolean(s.card_name && s.card_name.trim());
  const hasSpecies = Boolean(s.species);
  const hasSet = Boolean(s.set);

  if (hasNumber && (hasName || hasSpecies || hasSet)) {
    s.kind = "card";
    intent.is_exact = true; // resolver confirms / softens
    intent.confidence = hasSet ? "high" : "medium";
  } else if (hasNumber) {
    s.kind = "card";
    intent.is_exact = false;
    intent.confidence = "medium";
  } else if (hasSet && !hasName && !hasSpecies) {
    s.kind = "set";
    intent.confidence = "medium";
  } else if (hasName && hasSpecies) {
    // a specific card of a species ("charizard ex") vs bare species
    s.kind = "card";
    intent.confidence = "low"; // resolver decides exact-vs-species
  } else if (hasSpecies) {
    s.kind = "species";
    intent.confidence = "medium";
  } else if (hasName) {
    s.kind = "card";
    intent.confidence = "low";
  } else {
    s.kind = "none";
  }

  // result_mode: acquisition intent -> deals ; else identity -> exact/catalogue
  if (hasAcquisitionModifier(intent)) {
    intent.result_mode = "deals";
  } else if (intent.is_exact) {
    intent.result_mode = "exact_card";
  } else if (s.kind === "set") {
    intent.result_mode = "catalogue";
  } else {
    intent.result_mode = "catalogue";
  }
}

// A stable subset used for analytics / API - NO raw text, NO names/numbers.
export function structuralIntentFlags(intent) {
  return {
    subject_kind: intent.subject.kind, // card | species | set | none
    result_mode: intent.result_mode, // exact_card | deals | catalogue
    is_exact: intent.is_exact,
    format: intent.format, // any | raw | graded
    grader: intent.grader ?? "none",
    has_grade: intent.grade != null,
    has_condition: intent.condition != null,
    listing_type: intent.listing_type, // any | BIN | AUCTION
    language: intent.language ?? "default",
    era: intent.era ?? "any",
    has_price_min: intent.price_min != null,
    has_price_max: intent.price_max != null,
    has_collector_number: intent.subject.collector_number != null,
    has_set: intent.subject.set != null,
  };
}

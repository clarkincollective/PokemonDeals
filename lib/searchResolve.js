// Phase 13B.2 - deterministic local identity resolution against
// card_catalog. Runs BEFORE any PokemonPriceTracker call, so provider
// pagination can never hide a known exact catalogue result
// (docs/phase-13b1-findability-architecture.md §5, §6).
//
// resolveSearchIntent(intent, { lookup }) -> { resolution, exact, candidates }
//   and mutates intent.subject.{tcgplayer_id, card_slug, set, set_id}.
//
// `lookup` is an injectable interface so this is unit-testable without a
// DB (createArrayLookup) and real in the API (createSupabaseLookup).

import { slugifySet } from "./slugify.js";
import { catalogCardSlug, catalogCardResolvable } from "./cardSlug.js";
import { isSpecialtyCard } from "./catalogueView.js";
import { cardDisplayName } from "./cardName.js";
import { setReleaseRank, eraForSetName } from "./pokemonSets.js";
import { collectorNumberVariants } from "./searchIntent.js";

const norm = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

function hasParenQualifier(setName) {
  return /\(/.test(String(setName ?? ""));
}

// Higher = a "cleaner" match for `wantName` (fewer extra tokens, no
// non-number parenthetical, not a Jumbo/WCD specialty print).
function cleanliness(row, wantName) {
  let s = 0;
  const disp = cardDisplayName(row);
  const dispN = norm(disp);
  const wantN = norm(wantName);
  if (wantN && dispN === wantN) s += 4;
  else if (wantN && dispN.startsWith(wantN)) s += 2;
  if (!/\(/.test(String(row.name ?? "")) || /\(#?\s*\d/.test(String(row.name ?? ""))) s += 2; // no paren, or pure-number paren
  if (!isSpecialtyCard({ name: row.name, set: row.set })) s += 3;
  if (row.market_price != null) s += 1;
  // extra name tokens beyond what was asked
  const extra = Math.max(0, dispN.split(" ").filter(Boolean).length - (wantN ? wantN.split(" ").length : 0));
  s -= extra;
  return s;
}

// The 13B.1 tiebreak for one collector number across several sets.
function makeComparator(intent, wantName) {
  const wantEra = intent.era || null;
  return (a, b) => {
    if (wantEra) {
      const ea = eraForSetName(a.set) === wantEra ? 0 : 1;
      const eb = eraForSetName(b.set) === wantEra ? 0 : 1;
      if (ea !== eb) return ea - eb;
    }
    // plain set beats a "(Shadowless)"/"(Galarian Gallery)" qualified sibling
    const qa = hasParenQualifier(a.set) ? 1 : 0;
    const qb = hasParenQualifier(b.set) ? 1 : 0;
    if (qa !== qb) return qa - qb;
    const ca = cleanliness(a, wantName);
    const cb = cleanliness(b, wantName);
    if (ca !== cb) return cb - ca; // higher cleanliness first
    const ra = setReleaseRank(a.set);
    const rb = setReleaseRank(b.set);
    if (ra !== rb) return ra - rb; // older set first
    return String(a.tcgplayer_id).localeCompare(String(b.tcgplayer_id)); // stable
  };
}

function toExact(row) {
  return {
    tcgplayer_id: String(row.tcgplayer_id),
    name: row.name,
    set: row.set,
    set_id: row.set_id ?? null,
    card_number: row.card_number ?? null,
    rarity: row.rarity ?? null,
    market_price: row.market_price ?? null,
    image_url: row.image_url ?? null,
    card_slug: catalogCardSlug(row.name, row.set),
  };
}

function applyExact(intent, row, { confidence, resolvedVia }) {
  const ex = toExact(row);
  intent.subject.tcgplayer_id = ex.tcgplayer_id;
  intent.subject.card_slug = ex.card_slug;
  intent.subject.set = ex.set;
  intent.subject.set_id = ex.set_id;
  intent.subject.kind = "card";
  intent.is_exact = true;
  intent.confidence = confidence;
  return {
    resolution: { mode: "exact_card", confidence, is_exact: true, resolved_via: resolvedVia },
    exact: ex,
  };
}

/**
 * @param {object} intent  from parseSearchIntent
 * @param {{ lookup: object }} deps
 * @returns {Promise<{resolution:object, exact:object|null, candidates:object[]}>}
 */
// Does a catalogue row belong to the same Pokemon/card the user named?
// species match, or the query name is a run of the card name (or vice
// versa for very short names). Number-agnostic.
function subjectCompatible(row, subject) {
  if (subject.species && row.species === subject.species) return true;
  const want = norm(subject.card_name || "");
  if (!want) return Boolean(subject.species) ? false : true;
  const have = norm(row.name);
  return have.includes(want) || (want.length >= 4 && want.includes(have.split(" ")[0]));
}

export async function resolveSearchIntent(intent, { lookup }) {
  const language = intent.language || "english";
  const s = intent.subject;
  const wantName = s.card_name || s.species || "";
  const hasExplicitSubject = Boolean(s.species || (s.card_name && s.card_name.trim()));
  const numVariants = s.collector_number ? collectorNumberVariants(s.collector_number) : [];
  const cmp = makeComparator(intent, wantName);
  const cleanFirst = (rows) => rows.filter((r) => catalogCardResolvable(r)).slice().sort(cmp);

  // 13B.5.2 - the named set's card_catalog rows, fetched once and shared
  // by rule 3 (name+set) and rule 5 (species/name ∩ set).
  let _setRows;
  const setRowsOnce = async () => {
    if (_setRows === undefined) {
      _setRows =
        s.set && typeof lookup.bySetName === "function"
          ? await lookup.bySetName(s.set, { language })
          : [];
    }
    return _setRows;
  };

  // 13B.2.1 - when the query names a subject AND a collector number but no
  // card of that subject carries that number, we must NOT present the
  // number's real owner as an "exact" result for the named subject. We
  // record the mismatch and fall through to the subject's own resolution.
  let mismatch = null;
  const noteMismatch = (numberOwnerRows) => {
    const owner = cleanFirst(numberOwnerRows)[0] ?? null;
    mismatch = {
      collector_number: s.collector_number,
      subject: s.species || s.card_name || null,
      belongs_to: owner ? { name: owner.name, set: owner.set, card_slug: catalogCardSlug(owner.name, owner.set) } : null,
    };
    intent.ambiguities.push(
      owner
        ? `subject_collector_mismatch: #${s.collector_number} is ${owner.name} (${owner.set}), not ${mismatch.subject}`
        : `subject_collector_mismatch: no card matches #${s.collector_number}`
    );
  };
  const withMismatch = (res) =>
    mismatch
      ? {
          ...res,
          resolution: {
            ...res.resolution,
            mode: "subject_collector_mismatch",
            rendered_mode: res.resolution.mode,
            subject_collector_mismatch: mismatch,
          },
        }
      : res;

  // ---- 1. set + collector number -----------------------------------
  if (s.set && numVariants.length) {
    const all = await lookup.bySetAndNumber(s.set, numVariants, { language });
    const rows = cleanFirst(hasExplicitSubject ? all.filter((r) => subjectCompatible(r, s)) : all);
    if (rows.length >= 1) {
      if (rows.length > 1) intent.ambiguities.push(`number ${s.collector_number} in set ${s.set} has ${rows.length} rows`);
      return { ...applyExact(intent, rows[0], { confidence: "high", resolvedVia: "set+number" }), candidates: rows.slice(0, 8).map(toExact) };
    }
    if (hasExplicitSubject && all.length) noteMismatch(all); // set+number exists, but not for this subject
  }

  // ---- 2. collector number + name/species (no confident set) -------
  if (numVariants.length) {
    const all = await lookup.byNumber(numVariants, { language });
    const compatible = hasExplicitSubject ? all.filter((r) => subjectCompatible(r, s)) : all;
    if (hasExplicitSubject && compatible.length === 0 && all.length && !mismatch) {
      noteMismatch(all);
      // fall through to the subject's own resolution below - do NOT applyExact
    } else {
      const rows = cleanFirst(compatible);
      if (rows.length >= 1) {
        const top = rows[0];
        const distinctSets = new Set(rows.map((r) => r.set)).size;
        if (distinctSets > 1) intent.ambiguities.push(`collector number ${s.collector_number} exists in ${distinctSets} sets`);
        const confidence = distinctSets === 1 ? "high" : "medium";
        return {
          ...applyExact(intent, top, { confidence, resolvedVia: "name+number" }),
          candidates: rows.slice(0, 8).map(toExact),
        };
      }
    }
  }

  // ---- 3. exact card name + set -----------------------------------
  // Source from the set-scoped lookup where available so a common name
  // ("charizard") is never missed by a byName() row cap (13B.5.2).
  if (s.set && wantName && !numVariants.length) {
    const pool =
      typeof lookup.bySetName === "function"
        ? await setRowsOnce()
        : await lookup.byName(wantName, { language, limit: 60 });
    const rows = pool.filter(
      (r) => norm(r.set) === norm(s.set) && slugifySet(r.name) === slugifySet(wantName)
    );
    const sorted = cleanFirst(rows);
    if (sorted.length >= 1) return { ...applyExact(intent, sorted[0], { confidence: "high", resolvedVia: "name+set" }), candidates: sorted.slice(0, 8).map(toExact) };
  }

  // ---- 4. exact card name (unique, set-free) ---------------------
  // When the query names a set, a bare exact-name match in a DIFFERENT
  // set must not short-circuit the species ∩ set rule below.
  if (wantName && !numVariants.length && !s.set) {
    const exactRows = cleanFirst(await lookup.exactName(wantName, { language }));
    if (exactRows.length === 1) return { ...applyExact(intent, exactRows[0], { confidence: "high", resolvedVia: "exact_name" }), candidates: exactRows.map(toExact) };
    if (exactRows.length > 1) {
      // same name across many sets -> not exact; fall through to species/catalogue
      intent.ambiguities.push(`card name "${wantName}" exists in ${new Set(exactRows.map((r) => r.set)).size} sets`);
    }
  }

  // ---- 5. species / name  ∩  set  (Phase 13B.5.2) --------------
  // An explicit set + a species (or card name) is a real INTERSECTION,
  // not a species-wide result with the set kept as unused metadata. The
  // eligible identities are card_catalog rows that satisfy BOTH the
  // subject AND the canonical set. Sits BELOW exact-card identity (rules
  // 1-4) and ABOVE the set-free species rule below.
  if (s.set && (s.species || wantName) && !numVariants.length && typeof lookup.bySetName === "function") {
    const setRows = (await setRowsOnce()).filter((r) => catalogCardResolvable(r));
    // setRows empty => the set phrase named nothing real in the catalogue
    // (a curated alias for a set with no English rows). Fall through to
    // the set-free species / name rules rather than a false empty.
    if (setRows.length) {
      const setId = s.set_id ?? setRows[0].set_id ?? null;
      if (setId != null) s.set_id = String(setId);
      s.set = setRows[0].set; // canonical card_catalog casing

      const inBoth = cleanFirst(setRows.filter((r) => subjectCompatible(r, s)));

      if (inBoth.length === 1) {
        // exactly one canonical card of that subject in that set -> a
        // genuine exact identity (same semantics as rule 3's name+set).
        return withMismatch({
          ...applyExact(intent, inBoth[0], { confidence: "high", resolvedVia: "species+set" }),
          candidates: inBoth.map(toExact),
        });
      }
      if (inBoth.length > 1) {
        s.kind = "species";
        intent.is_exact = false;
        intent.confidence = "medium";
        return withMismatch({
          resolution: {
            mode: "species_set",
            confidence: "medium",
            is_exact: false,
            resolved_via: "species+set",
            species_print_count: inBoth.length,
            set: s.set,
            set_id: s.set_id,
            subject_ids: inBoth.map((r) => String(r.tcgplayer_id)), // species ∩ set scope
          },
          exact: null,
          candidates: inBoth.slice(0, 60).map(toExact),
        });
      }

      // set resolved, subject resolved, but NO card of that subject is in
      // that set. Truthful miss - never broaden to all-species or all-set.
      intent.ambiguities.push(
        `species_set_no_match: ${s.species || s.card_name} has no card in ${s.set}`
      );
      s.kind = "species";
      intent.is_exact = false;
      intent.confidence = "low";
      return withMismatch({
        resolution: {
          mode: "species_set_no_match",
          rendered_mode: "species_set",
          confidence: "low",
          is_exact: false,
          resolved_via: "species+set",
          species_print_count: 0,
          set: s.set,
          set_id: s.set_id,
          subject_ids: [],
        },
        exact: null,
        candidates: [],
      });
    }
  }

  // ---- 6. species (set-free) ---------------------------------------
  if (s.species) {
    const rows = await lookup.bySpecies(s.species, { language });
    if (rows.length === 1) {
      return withMismatch({ ...applyExact(intent, rows[0], { confidence: mismatch ? "medium" : "high", resolvedVia: "species_single" }), candidates: rows.map(toExact) });
    }
    s.kind = "species";
    intent.is_exact = false;
    intent.confidence = "medium";
    return withMismatch({
      resolution: {
        mode: "species",
        confidence: "medium",
        is_exact: false,
        resolved_via: "species",
        species_print_count: rows.length,
        subject_ids: rows.map((r) => String(r.tcgplayer_id)), // full scope for the deals filter
      },
      exact: null,
      candidates: rows.slice(0, 60).map(toExact),
    });
  }

  // ---- 6.5 pure set (Phase 13B.5.1) ----------------------------
  // A recognised set and NOTHING that identifies a card or Pokemon (no
  // name, no species, no collector number). Resolve LOCALLY to the set -
  // never fall through to the provider for a query we can fully answer
  // from card_catalog. A set phrase that co-occurs with a card/species/
  // number subject is claimed by rules 1-6 above (rule 5 handles
  // species/name ∩ set; rule 6b's `wantName` gate is the mirror image of
  // this one), so this can never steal `base set charizard` or
  // `base set charizard 4/102`.
  if (s.set && !wantName && !numVariants.length && typeof lookup.bySetName === "function") {
    const rows = (await lookup.bySetName(s.set, { language })).filter((r) => catalogCardResolvable(r));
    if (rows.length) {
      rows.sort((a, b) => {
        const na = Number(String(a.card_number ?? "").split("/")[0]) || 0;
        const nb = Number(String(b.card_number ?? "").split("/")[0]) || 0;
        if (na !== nb) return na - nb;
        return String(a.tcgplayer_id).localeCompare(String(b.tcgplayer_id));
      });
      const setId = s.set_id ?? rows[0].set_id ?? null;
      s.kind = "set";
      s.set = rows[0].set; // canonical card_catalog casing
      s.set_id = setId != null ? String(setId) : null;
      intent.is_exact = false;
      intent.confidence = "medium";
      return withMismatch({
        resolution: {
          mode: "set",
          confidence: "medium",
          is_exact: false,
          resolved_via: "set_vocabulary",
          set: s.set,
          set_id: s.set_id,
          set_print_count: rows.length,
          subject_ids: rows.map((r) => String(r.tcgplayer_id)), // set card identity, for the deals filter
        },
        exact: null,
        candidates: rows.slice(0, 60).map(toExact),
      });
    }
  }

  // ---- 6b. local broad name match ------------------------------
  if (wantName) {
    const rows = cleanFirst(await lookup.byName(wantName, { language, limit: 60 }));
    if (rows.length >= 1) {
      intent.is_exact = false;
      intent.confidence = "low";
      return withMismatch({
        resolution: {
          mode: "local_broad",
          confidence: "low",
          is_exact: false,
          resolved_via: "name_ilike",
          match_count: rows.length,
          subject_ids: rows.map((r) => String(r.tcgplayer_id)),
        },
        exact: null,
        candidates: rows.slice(0, 60).map(toExact),
      });
    }
  }

  // ---- 7. nothing local -> provider fallback -------------------
  intent.is_exact = false;
  return withMismatch({
    resolution: { mode: "provider_fallback", confidence: "low", is_exact: false, resolved_via: "none" },
    exact: null,
    candidates: [],
  });
}

// -------------------------------------------------------------- lookups

// In-memory lookup over a fixture array of card_catalog-shaped rows.
export function createArrayLookup(rows) {
  const all = (rows ?? []).map((r) => ({ ...r, tcgplayer_id: String(r.tcgplayer_id) }));
  const inLang = (lang) => all.filter((r) => (r.language ?? "english") === (lang ?? "english"));
  return {
    async bySetAndNumber(setName, numVariants, { language } = {}) {
      const nv = new Set(numVariants.map(String));
      return inLang(language).filter(
        (r) => norm(r.set) === norm(setName) && nv.has(String(r.card_number ?? "").toLowerCase())
      );
    },
    async byNumber(numVariants, { language } = {}) {
      const nv = new Set(numVariants.map(String));
      return inLang(language).filter((r) => nv.has(String(r.card_number ?? "").toLowerCase()));
    },
    async byName(name, { language, limit = 60 } = {}) {
      const n = norm(name);
      return inLang(language)
        .filter((r) => norm(r.name).includes(n))
        .slice(0, limit);
    },
    async exactName(name, { language } = {}) {
      const n = norm(name);
      return inLang(language).filter((r) => norm(cardDisplayName(r)) === n || norm(r.name) === n);
    },
    async bySpecies(species, { language } = {}) {
      return inLang(language).filter((r) => r.species === species);
    },
    async bySetName(setName, { language } = {}) {
      return inLang(language).filter((r) => norm(r.set) === norm(setName));
    },
  };
}

// Real Supabase lookup. `db` is a supabaseAdmin() client.
export function createSupabaseLookup(db) {
  const COLS = "tcgplayer_id, name, set, set_id, card_number, rarity, species, language, market_price, image_url, card_type";
  const orNumber = (nv) => nv.map((v) => `card_number.eq.${v}`).join(",");
  return {
    async bySetAndNumber(setName, numVariants, { language = "english" } = {}) {
      const { data } = await db
        .from("card_catalog")
        .select(COLS)
        .eq("language", language)
        .eq("set", setName)
        .or(orNumber(numVariants))
        .limit(50);
      return data ?? [];
    },
    async byNumber(numVariants, { language = "english" } = {}) {
      const { data } = await db
        .from("card_catalog")
        .select(COLS)
        .eq("language", language)
        .or(orNumber(numVariants))
        .limit(200);
      return data ?? [];
    },
    async byName(name, { language = "english", limit = 60 } = {}) {
      const { data } = await db
        .from("card_catalog")
        .select(COLS)
        .eq("language", language)
        .ilike("name", `%${name}%`)
        .limit(limit);
      return data ?? [];
    },
    async exactName(name, { language = "english" } = {}) {
      const { data } = await db
        .from("card_catalog")
        .select(COLS)
        .eq("language", language)
        .ilike("name", name)
        .limit(50);
      return data ?? [];
    },
    async bySpecies(species, { language = "english" } = {}) {
      const { data } = await db
        .from("card_catalog")
        .select(COLS)
        .eq("language", language)
        .eq("species", species)
        .limit(1000);
      return data ?? [];
    },
    async bySetName(setName, { language = "english" } = {}) {
      const { data } = await db
        .from("card_catalog")
        .select(COLS)
        .eq("language", language)
        .eq("set", setName)
        .limit(2000);
      return data ?? [];
    },
  };
}

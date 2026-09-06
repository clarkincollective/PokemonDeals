// P0.4.1 - the single diversity-aware selection layer for the curated
// homepage deal lanes.
//
// The P0.4 audit found the database already carries plenty of variety
// (257 species / 623 printings across 895 active deals) but the homepage
// felt repetitive because:
//   * the curated lanes (flagship / Just Added / auctions) returned a
//     deterministic, indefinitely-stable selection,
//   * the "All deals" grid only ever shuffled the newest ~400, and
//   * ~47% of deals (<= $25) had no curated placement at all.
//
// This module does NOT re-rank on quality and does NOT randomise. It
// takes an ALREADY eligibility-filtered, ALREADY quality-ordered list and
// applies, in strict priority order:
//   1. the caller's quality / lane-relevance order (preserved)
//   2. no duplicate exact printing within a lane        (hard, cap 1)
//   3. species diversity - one occurrence before a second (cap 2)
//   4. set diversity                                     (soft)
//   5. price-band diversity                              (soft)
//   6. freshness                                         (tie-break only)
// Every constraint RELAXES GRACEFULLY: a lane with enough eligible deals
// always fills to its limit rather than being suppressed to obey a cap.
//
// Rotation is deterministic: a time bucket + lane id derives a stable
// entry offset into the eligible pool, so within one bucket every render
// is identical (cache-safe, no hydration drift, no SEO churn) and across
// buckets the visible inventory rotates.
//
// Pure module: no I/O, no framework cache, client-safe, synthetic-fixture
// testable. Its only dependency is the pure species helper.

const { extractSpecies } = require("./pokemonSpecies");

// --- rotation cadence -----------------------------------------------------
// The scan cadence the homepage sits on: US sweep every 15 min, other
// countries every ~2 h, priority re-scan every 6 h, homepage ISR
// `revalidate` 60 s. A 3-hour rotation bucket is long enough that every
// render inside a bucket is byte-identical (no per-request churn) and
// short enough that a visitor returning later the same day sees a
// different, still-high-quality curated set. A daily visitor gets 8
// distinct windows.
const ROTATION_INTERVAL_HOURS = 3;
const ROTATION_INTERVAL_MS = ROTATION_INTERVAL_HOURS * 60 * 60 * 1000;

// How far down the eligible, quality-ordered pool the rotation is allowed
// to move a lane's starting point. Small on purpose: the entry rotates
// only among the strongest handful, so rotation never trades a top deal
// for a mediocre one - it varies WHICH strong deals lead. A lane can also
// ANCHOR its first N deals (never rotated) so its single best deal always
// leads - the rest of the lane still rotates + diversifies.
const CURATED_ROTATION_SPAN = 8;

function rotationBucket(now = Date.now()) {
  return Math.floor(now / ROTATION_INTERVAL_MS);
}

// FNV-1a, 32-bit. Deterministic, dependency-free, good enough spread for
// picking a rotation offset / a stable per-bucket ordering.
function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// --- deal keying (flat card_* cols, watchlist join fallback) ------------
function printingKey(deal) {
  return (
    (deal?.card_tcgplayer_id != null && String(deal.card_tcgplayer_id)) ||
    (deal?.watchlist?.justtcg_tcgplayer_id != null && String(deal.watchlist.justtcg_tcgplayer_id)) ||
    (deal?.card_catalog_id != null && `cc:${deal.card_catalog_id}`) ||
    (deal?.watchlist_id != null && `wl:${deal.watchlist_id}`) ||
    `nm:${deal?.card_name ?? deal?.watchlist?.name ?? deal?.title ?? deal?.id}`
  );
}

function speciesKey(deal) {
  const name = deal?.card_name ?? deal?.watchlist?.name ?? deal?.title ?? "";
  const sp = extractSpecies(name);
  if (sp) return `sp:${sp.toLowerCase()}`;
  // no confident species (Trainer / Energy / odd name) - never collapse
  // these together, so they don't trip the species cap as one bucket.
  return `no-sp:${printingKey(deal)}`;
}

function setKey(deal) {
  const set = deal?.card_set ?? deal?.watchlist?.set ?? "";
  return set ? `set:${String(set).toLowerCase()}` : `set:?`;
}

// Matches the P0.4 audit / homepage price chips: the buyer-facing total.
function priceBandKey(deal) {
  const n = Number(deal?.total_price ?? deal?.total_price_usd);
  if (!Number.isFinite(n)) return "band:?";
  if (n < 25) return "band:<25";
  if (n < 50) return "band:25-50";
  if (n < 100) return "band:50-100";
  if (n < 250) return "band:100-250";
  return "band:250+";
}

// --- rotation ordering --------------------------------------------------
// "rotate": keep the quality order, move the starting point by a
//   bucket-derived offset within CURATED_ROTATION_SPAN and wrap. Used for
//   the curated lanes where the input is a real quality ranking.
// "bucketPermute": a stable-per-bucket deterministic permutation of the
//   whole pool. Used for the "All deals" preview grid, whose input order
//   is only "newest first" - a rotating diverse slice of the FULL active
//   pool is the goal there, not the newest N.
function rotateForBucket(deals, { bucket, laneId, mode = "rotate", span = CURATED_ROTATION_SPAN, anchor = 0 } = {}) {
  const arr = Array.isArray(deals) ? deals.slice() : [];
  if (arr.length <= 1) return arr;
  if (mode === "bucketPermute") {
    // A stable-per-bucket permutation of the WHOLE pool, but freshness
    // stays priority #6: deals are permuted WITHIN a coarse recency tier
    // (< 48 h, < 7 d, older) so a rotating-diverse slice still leans
    // recent and the homepage never feels stale. Tier is derived from the
    // row's own first_seen_at - no external dependency.
    const now = Date.now();
    const tierOf = (d) => {
      const t = Date.parse(d?.first_seen_at ?? d?.last_seen_at ?? "");
      if (!Number.isFinite(t)) return 1;
      const ageH = (now - t) / 3_600_000;
      return ageH < 48 ? 0 : ageH < 168 ? 1 : 2;
    };
    return arr
      .map((d) => ({ d, tier: tierOf(d), k: fnv1a(`${bucket}:${laneId}:${d?.id ?? printingKey(d)}`) }))
      .sort((a, b) => a.tier - b.tier || a.k - b.k || String(a.d?.id ?? "").localeCompare(String(b.d?.id ?? "")))
      .map((x) => x.d);
  }
  const a = Math.max(0, Math.min(anchor, arr.length - 1));
  const head = arr.slice(0, a); // never rotated - the lane's very best deal(s) always lead
  const tail = arr.slice(a);
  if (tail.length <= 1) return arr;
  const reach = Math.max(1, Math.min(tail.length, span));
  const offset = fnv1a(`${bucket}:${laneId}`) % reach;
  const rotatedTail = offset === 0 ? tail : tail.slice(offset).concat(tail.slice(0, offset));
  return head.concat(rotatedTail);
}

// --- the diversity selector -------------------------------------------
// `deals`        already eligibility-filtered AND quality/relevance-ordered
// `limit`        target lane size
// `speciesCap`   max deals of one species in this lane (default 2)
// `seenPrintings`/`seenSpecies`  cross-lane state (Set / Set) - a printing
//                already shown in an earlier module is hard-excluded until
//                the last relaxation level; a species already shown is a
//                SOFT nudge (only enforced on each lane's first pass).
// Returns the selected rows (never padded with junk; may return < limit
// only when the eligible pool genuinely has fewer than `limit` deals).
function selectDiverseLane(
  deals,
  { limit = 4, speciesCap = 2, seenPrintings = null, seenSpecies = null } = {}
) {
  const pool = (deals ?? []).filter(Boolean);
  const out = [];
  const usedIds = new Set();
  const printings = new Set();
  const species = new Map();
  const sets = new Map();
  const bands = new Map();
  const crossPrint = seenPrintings instanceof Set ? seenPrintings : new Set();
  const crossSpecies = seenSpecies instanceof Set ? seenSpecies : new Set();

  const P = printingKey, S = speciesKey, T = setKey, B = priceBandKey;

  // relaxation ladder - each level drops the weakest remaining constraint.
  // Levels are tried in order; within a level the quality-ordered pool is
  // scanned front-to-back so the strongest qualifying deals are taken
  // first.
  const levels = [
    // 0: maximum diversity + globally fresh species/printing
    (d) => !crossPrint.has(P(d)) && !printings.has(P(d)) && !crossSpecies.has(S(d)) && !species.has(S(d)) && !sets.has(T(d)) && !bands.has(B(d)),
    // 1: drop the price-band ask
    (d) => !crossPrint.has(P(d)) && !printings.has(P(d)) && !crossSpecies.has(S(d)) && !species.has(S(d)) && !sets.has(T(d)),
    // 2: drop the set ask
    (d) => !crossPrint.has(P(d)) && !printings.has(P(d)) && !crossSpecies.has(S(d)) && !species.has(S(d)),
    // 3: drop the cross-lane species nudge (still: first of this species in THIS lane)
    (d) => !crossPrint.has(P(d)) && !printings.has(P(d)) && !species.has(S(d)),
    // 4: allow a second of a species in this lane (up to the cap)
    (d) => !crossPrint.has(P(d)) && !printings.has(P(d)) && (species.get(S(d)) || 0) < speciesCap,
    // 5: drop the species cap entirely (printing still unique in this lane, still not shown elsewhere)
    (d) => !crossPrint.has(P(d)) && !printings.has(P(d)),
    // 6: last resort - allow a printing already shown in another module, still unique within THIS lane
    (d) => !printings.has(P(d)),
  ];

  for (const ok of levels) {
    if (out.length >= limit) break;
    for (const d of pool) {
      if (out.length >= limit) break;
      const id = d?.id ?? P(d);
      if (usedIds.has(id)) continue;
      if (!ok(d)) continue;
      usedIds.add(id);
      out.push(d);
      printings.add(P(d));
      species.set(S(d), (species.get(S(d)) || 0) + 1);
      sets.set(T(d), (sets.get(T(d)) || 0) + 1);
      bands.set(B(d), (bands.get(B(d)) || 0) + 1);
    }
  }
  return out;
}

// --- orchestrator ----------------------------------------------------
// Builds every curated lane in one pass so cross-lane dedupe is real.
// `pools` carries the ALREADY eligibility-filtered, quality-ordered
// candidate list for each lane. Lane order defines dedupe precedence:
// the flagship lane gets first pick of every printing/species.
//
// Returns { flagship, underPrice, justAdded, auctions, grid } - each an
// array of the selected deal rows, ready to render.
function LANES() {
  return [
    // flagship: tile 1 is always the single best deal; tiles 2-4 rotate.
    { id: "flagship", key: "flagship", limit: 4, speciesCap: 2, rotate: "rotate", anchor: 1, span: 6 },
    { id: "under_price", key: "underPrice", limit: 3, speciesCap: 2, rotate: "rotate", anchor: 0 },
    { id: "just_added", key: "justAdded", limit: 3, speciesCap: 2, rotate: "rotate", anchor: 0 },
    { id: "auctions", key: "auctions", limit: 3, speciesCap: 2, rotate: "rotate", anchor: 1, span: 6 },
    { id: "grid", key: "grid", limit: 9, speciesCap: 3, rotate: "bucketPermute" },
  ];
}

function buildHomepageLanes(pools = {}, { bucket = rotationBucket(), limits = {} } = {}) {
  const result = {};
  // Cross-lane state. Printing exclusion is hard (until each lane's own
  // last relaxation level); species exclusion is a soft first-pass nudge.
  const seenPrintings = new Set();
  const seenSpecies = new Set();

  for (const lane of LANES()) {
    const pool = Array.isArray(pools[lane.key]) ? pools[lane.key] : [];
    const limit = Number.isFinite(limits[lane.key]) ? limits[lane.key] : lane.limit;
    const ordered = rotateForBucket(pool, {
      bucket,
      laneId: lane.id,
      mode: lane.rotate,
      anchor: lane.anchor ?? 0,
      span: lane.span ?? CURATED_ROTATION_SPAN,
    });
    const picked = selectDiverseLane(ordered, {
      limit,
      speciesCap: lane.speciesCap,
      seenPrintings,
      seenSpecies,
    });
    result[lane.key] = picked;
    for (const d of picked) {
      seenPrintings.add(printingKey(d));
      seenSpecies.add(speciesKey(d));
    }
  }
  return result;
}

module.exports = {
  ROTATION_INTERVAL_HOURS,
  ROTATION_INTERVAL_MS,
  CURATED_ROTATION_SPAN,
  rotationBucket,
  fnv1a,
  printingKey,
  speciesKey,
  setKey,
  priceBandKey,
  rotateForBucket,
  selectDiverseLane,
  buildHomepageLanes,
  LANES,
};

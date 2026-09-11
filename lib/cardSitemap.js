// SEO-3 - card sitemap value bands + truthful lastmod. Pure: no data
// access, no Next imports, so every rule here is unit-testable and shared
// by the route (lib/sitemap.js), the tests and the audit scripts.
//
// VALUE BANDS. The ~23.7k indexable /cards/[slug] pages are split into a
// few stable child sitemaps by the card's canonical market reference
// (card_catalog.market_price - PokemonPriceTracker's raw Near Mint market
// value, one currency: USD). Membership is discovery metadata only: a
// card that crosses a threshold simply moves shard at the next shared
// catalogue snapshot; its URL, canonical and indexability never change.
// Boundaries are inclusive at the bottom, exclusive at the top.
//
// cards-bulk is defined as: reference below $5 OR an indexed card (a
// live-deal hub) whose canonical reference is currently null. No price is
// ever guessed for the latter - a hub is indexable by its own rule (2+
// live listings), so it must be in a sitemap, and "no reference value"
// is grouped with the lowest-priority cohort explicitly rather than
// described as "< $5". assignCardShards reports them as `noReference`.
export const CARD_VALUE_BANDS = Object.freeze([
  { key: "cards-high", label: "High value", description: "market reference >= $100", min: 100, max: null },
  { key: "cards-mid", label: "Mid value", description: "market reference $25 to $99.99", min: 25, max: 100 },
  { key: "cards-low", label: "Low value", description: "market reference $5 to $24.99", min: 5, max: 25 },
  { key: "cards-bulk", label: "Bulk / commons", description: "market reference below $5, or an indexed card hub with no canonical reference value", min: 0, max: 5 },
]);
export const CARD_SITEMAP_SEGMENTS = Object.freeze(CARD_VALUE_BANDS.map((b) => b.key));
export const NO_REFERENCE_SHARD = "cards-bulk";

export function isCardSitemapSegment(segment) {
  return CARD_SITEMAP_SEGMENTS.includes(segment);
}

// USD market reference -> band key. Only a real positive finite price is
// bandable; null / 0 / NaN / negative -> null (such a card is not
// indexable in the first place - lib/cardSlug.js catalogPriceOk).
export function cardValueBand(marketPriceUsd) {
  const p = Number(marketPriceUsd);
  if (!Number.isFinite(p) || p <= 0) return null;
  for (const b of CARD_VALUE_BANDS) {
    if (p >= b.min && (b.max == null || p < b.max)) return b.key;
  }
  return null;
}

// LASTMOD CONTRACT (Phase 17B - "material first-party change").
//
//   A card sitemap <lastmod> is the most recent day on which the card's
//   displayed Near Mint catalogue price MATERIALLY changed, as proven by
//   two of the site's OWN daily `catalog` observations: the price moved
//   by at least LASTMOD_MIN_CHANGE_USD ($0.05) AND at least
//   LASTMOD_MIN_CHANGE_PCT (2%) away from the last COUNTED price (the
//   anchor - so slow drift accumulates until it is material, then counts).
//   A card with no such change in its first-party history gets NO
//   <lastmod> (omitted, never a fallback).
//
// Why first-party only: `price_history` also holds the provider's
// `ppt_backfill` prefix, and the site's own daily recording expanded from
// ~4.9k to ~24.8k cards on 2026-09-02. Counting a backfill -> catalog
// step, or a card's first recorded day, stamped ~96% of cards with an
// early-September "change" that was only the date recording began - the
// page did not change that day. Only catalog -> catalog comparisons prove
// the page's displayed value changed. Measured on a 400-card sample: any
// 1-cent change would give 72% of cards a lastmod (mostly cent noise);
// this rule gives ~31%, each a real move of the price the page shows.
//
// Never the sitemap generation time, a request time, a build time, a
// bulk sync time or Date.now().
//
// `rows` = [{ observed_on: "YYYY-MM-DD", price, source }] for ONE card,
// any order (non-catalog rows are ignored). `today` = the "YYYY-MM-DD"
// ceiling (tests inject it). Observations dated after today + 1 day are
// treated as clock noise and dropped. Returns "YYYY-MM-DD" or null.
//
// The SQL function card_reference_lastmod() implements exactly this rule
// (numeric, exact); here prices are compared in integer cents so the two
// agree at the boundaries (2% of $2.50 is exactly 5 cents in both).
export const LASTMOD_MIN_CHANGE_USD = 0.05;
export const LASTMOD_MIN_CHANGE_PCT = 0.02;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SENTINELS = new Set([999, 999.99, 9999, 9999.99, 99999, 99999.99]);

// |to - from| is material relative to the anchor `from` (both in cents).
export function isMaterialChange(fromCents, toCents) {
  const d = Math.abs(toCents - fromCents);
  // d >= 2% of from  <=>  d * 50 >= from (integers, no float division)
  return d >= Math.round(LASTMOD_MIN_CHANGE_USD * 100) && d * Math.round(1 / LASTMOD_MIN_CHANGE_PCT) >= fromCents;
}

export function nextDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Phase 17B: validate the {tcgplayer_id: "YYYY-MM-DD"} object returned by
// the card_reference_lastmod() SQL function. Keeps only real calendar days
// (V8 rolls "2026-02-30" forward, so the parse is round-tripped); anything
// else is DROPPED, never repaired or replaced. The future-date ceiling is
// the SQL function's own (observed_on <= current_date + 1) - this module
// never reads the clock.
export function sanitizeLastmodMap(raw) {
  const map = {};
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return map;
  for (const [id, v] of Object.entries(raw)) {
    if (!id || typeof v !== "string" || !DAY_RE.test(v)) continue;
    const parsed = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v) continue;
    map[String(id)] = v;
  }
  return map;
}

export function cardReferenceLastmod(rows, { today } = {}) {
  if (!DAY_RE.test(String(today ?? ""))) throw new Error("cardReferenceLastmod: an explicit today (YYYY-MM-DD) is required - no clock fallback");
  const ceiling = nextDay(today);
  const byDay = new Map();
  for (const r of rows ?? []) {
    if (r?.source !== "catalog") continue; // first-party observations only
    const day = String(r?.observed_on ?? "").slice(0, 10);
    // a real calendar day: V8 accepts "2026-02-30" and rolls it forward,
    // so round-trip the parse rather than trusting Date.parse alone
    if (!DAY_RE.test(day)) continue;
    const parsed = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) continue;
    if (day > ceiling) continue; // future-dated observation: ignored, never emitted
    const price = Number(r?.price);
    if (!Number.isFinite(price) || price <= 0 || SENTINELS.has(price)) continue;
    // one first-party row per card per day (price_history_daily_uniq); a
    // duplicate would be ignored rather than guessed between
    if (!byDay.has(day)) byDay.set(day, Math.round(price * 100));
  }
  const days = [...byDay.keys()].sort();
  if (days.length < 2) return null; // no comparison possible = no proven change
  let anchor = byDay.get(days[0]);
  let lastChange = null;
  for (let i = 1; i < days.length; i++) {
    const p = byDay.get(days[i]);
    if (isMaterialChange(anchor, p)) {
      lastChange = days[i];
      anchor = p;
    }
  }
  return lastChange;
}

// Assign every indexable card to exactly one shard. `cards` =
// [{ slug, tcgplayerId, marketPrice }] already de-duplicated by slug and
// already filtered by the canonical indexability predicate (the caller's
// job - this function never widens or narrows membership). `lastmodByTcg`
// = Map(tcgplayer_id -> "YYYY-MM-DD" | null).
//
// An indexed card with no canonical reference value (a live-deal hub whose
// catalogue market_price is null) is kept - never dropped from the
// sitemap - in NO_REFERENCE_SHARD by that shard's stated rule, and
// reported via `noReference` so the audit can see it. Nothing is guessed.
export function assignCardShards(cards, lastmodByTcg = new Map()) {
  const shards = new Map(CARD_SITEMAP_SEGMENTS.map((k) => [k, []]));
  const seen = new Set();
  const noReference = [];
  for (const c of cards ?? []) {
    if (!c?.slug || seen.has(c.slug)) continue;
    seen.add(c.slug);
    let band = cardValueBand(c.marketPrice);
    if (!band) { band = NO_REFERENCE_SHARD; noReference.push(c.slug); }
    const lastmod = c.tcgplayerId != null ? lastmodByTcg.get(String(c.tcgplayerId)) ?? null : null;
    shards.get(band).push({ slug: c.slug, lastmod: lastmod && DAY_RE.test(lastmod) ? lastmod : null, noReference: !cardValueBand(c.marketPrice) });
  }
  return { shards, noReference };
}

// A deterministic identity for ONE shard assignment (the whole snapshot,
// all four shards): FNV-1a over the sorted "slug|shard|lastmod" lines.
// Every shard rendered from the same snapshot carries the same id, so a
// reader (or a test) can tell whether four responses came from one
// generation. Pure - no clock, no randomness.
export function cardSitemapSnapshotId(shards) {
  const lines = [];
  for (const [key, entries] of shards instanceof Map ? shards : Object.entries(shards)) {
    for (const e of entries) lines.push(`${e.slug}|${key}|${e.lastmod ?? ""}`);
  }
  lines.sort();
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const c = line.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
    }
    h1 = Math.imul(h1 ^ 0x7c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ 0x7c, 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

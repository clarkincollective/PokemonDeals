// Phase 13E.7A - SOCIAL PERFORMANCE MODEL (read-only measurement).
//
// The ledger row carries timestamped metric SNAPSHOTS. A snapshot holds
// only the metrics the provider actually returned; every metric it did not
// return stays `null` - NEVER 0 (0 is a real, reported value). Metrics a
// platform structurally cannot report render as "UNSUPPORTED", not 0.
//
// This module is pure logic: normalise a provider payload, merge a
// snapshot, pick a reporting window, compute KPIs. It calls no network and
// imports no provider. scripts/socialMetrics.mjs does the I/O.

// The canonical metric keys we track. Superset of what any one platform
// reports; unione of Buffer's PostMetricType enum (verified live 2026-09-07).
export const METRIC_KEYS = Object.freeze([
  "impressions",
  "reach",
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "reposts", // X retweets
  "quotes", // X quote-posts
  "reactions", // aggregate reaction count where a platform gives one
  "engagement_rate", // provider-reported, unit = percentage (0..1 or 0..100 - carry the unit)
  "average_time_watched_s", // video
  "total_time_watched_s", // video
  "viewers", // unique video viewers
  "follows", // followers gained attributed to the post
]);

// Buffer PostMetricType (camelCase, live enum) -> our snake_case key.
// Anything Buffer sends that is not in this map is ignored (never invented).
export const BUFFER_METRIC_MAP = Object.freeze({
  impressions: "impressions",
  reach: "reach",
  views: "views",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  clicks: "clicks",
  reposts: "reposts",
  quotes: "quotes",
  reactions: "reactions",
  engagementRate: "engagement_rate",
  averageTimeWatched: "average_time_watched_s",
  totalTimeWatched: "total_time_watched_s",
  viewers: "viewers",
  follows: "follows",
  // postCount is an aggregate-only bookkeeping metric - not a per-post KPI.
});

// Per-platform metric support. Sourced from each platform's own public API
// surface for an OWNER's post + Buffer's (experimental) metrics coverage
// (docs/social-performance.md has the citations):
//   SUPPORTED     - the platform reports it for owned posts and Buffer maps it
//   NOT_SUPPORTED - the platform does not expose this metric at all
//   UNKNOWN       - the platform has it but Buffer's experimental API
//                   coverage is unverified; treat a returned value as real,
//                   an absent one as null (not 0)
const S = "SUPPORTED", N = "NOT_SUPPORTED", U = "UNKNOWN";
export const PLATFORM_METRIC_SUPPORT = Object.freeze({
  instagram: {
    impressions: S, reach: S, views: S, likes: S, comments: S, shares: S, saves: S,
    clicks: N, reposts: N, quotes: N, reactions: N, engagement_rate: S,
    average_time_watched_s: U, total_time_watched_s: U, viewers: U, follows: U,
  },
  tiktok: {
    impressions: U, reach: U, views: S, likes: S, comments: S, shares: S, saves: S,
    clicks: N, reposts: N, quotes: N, reactions: N, engagement_rate: U,
    average_time_watched_s: S, total_time_watched_s: S, viewers: S, follows: U,
  },
  x: {
    impressions: S, reach: N, views: S, likes: S, comments: S, shares: N, saves: U,
    clicks: U, reposts: S, quotes: S, reactions: N, engagement_rate: U,
    average_time_watched_s: N, total_time_watched_s: N, viewers: N, follows: U,
  },
  youtube: {
    impressions: U, reach: N, views: S, likes: S, comments: S, shares: S, saves: N,
    clicks: N, reposts: N, quotes: N, reactions: N, engagement_rate: U,
    average_time_watched_s: S, total_time_watched_s: S, viewers: N, follows: U,
  },
});

// distribution platform id -> the coarse service key used above.
export function serviceOf(platform) {
  const p = String(platform ?? "").toLowerCase();
  if (p.startsWith("instagram")) return "instagram";
  if (p === "tiktok") return "tiktok";
  if (p === "x_post" || p === "x" || p === "twitter") return "x";
  if (p.startsWith("youtube")) return "youtube";
  return null;
}

// The standard trailing reporting windows (§11). A post can be reported on
// with whatever windows its snapshots cover - none is mandatory.
export const REPORTING_WINDOWS = Object.freeze([
  { key: "1h", ms: 3600_000 },
  { key: "24h", ms: 24 * 3600_000 },
  { key: "72h", ms: 72 * 3600_000 },
  { key: "7d", ms: 7 * 24 * 3600_000 },
  { key: "28d", ms: 28 * 24 * 3600_000 },
]);

// A metrics object with EVERY key present and null (the honest "we have no
// reading" state - distinct from a reported 0).
export function emptyMetrics() {
  const m = {};
  for (const k of METRIC_KEYS) m[k] = null;
  return m;
}

// The pre-publish baseline (§15). NOT zero - the post does not exist yet,
// so there is nothing to measure.
export const NOT_AVAILABLE_YET = "NOT_AVAILABLE_YET";
export function baselineMetrics() {
  const m = {};
  for (const k of METRIC_KEYS) m[k] = NOT_AVAILABLE_YET;
  return m;
}

// Normalise a provider metrics payload for ONE post into our shape.
//   raw : Buffer's [{ name, type, unit, value }] list (name OR type may
//         carry the metric id, depending on Buffer's response)
//   platform : distribution platform id (for the support matrix)
// Returns { metrics, unsupported:[keys], reported:[keys], units:{key:unit} }.
// A metric the platform CANNOT report -> omitted from `metrics` and listed
// in `unsupported`. A metric the platform could report but the payload did
// not include -> stays null in `metrics`. A metric present with value 0 ->
// kept as 0 (a real reading).
export function normalizeProviderMetrics(raw, platform) {
  const svc = serviceOf(platform);
  const support = (svc && PLATFORM_METRIC_SUPPORT[svc]) || {};
  const metrics = emptyMetrics();
  const units = {};
  const reported = [];

  for (const item of Array.isArray(raw) ? raw : []) {
    const id = item?.type ?? item?.name;
    const key = BUFFER_METRIC_MAP[id] ?? (METRIC_KEYS.includes(id) ? id : null);
    if (!key) continue;
    const v = item?.value;
    if (v == null || Number.isNaN(Number(v))) continue; // no reading -> leave null
    // time-watched metrics: Buffer reports seconds; keep as-is.
    metrics[key] = Number(v);
    if (item?.unit) units[key] = item.unit;
    if (!reported.includes(key)) reported.push(key);
  }

  const unsupported = [];
  for (const k of METRIC_KEYS) {
    if (support[k] === "NOT_SUPPORTED") {
      unsupported.push(k);
      metrics[k] = null; // never show a NOT_SUPPORTED metric as a number
    }
  }
  return { metrics, unsupported, reported, units };
}

// Build one timestamped snapshot row.
export function buildSnapshot({ capturedAt, platform, metrics, unsupported = [], units = {}, source = "buffer", metricsUpdatedAt = null, error = null } = {}) {
  return {
    captured_at: capturedAt ?? new Date().toISOString(),
    source, // "buffer" | "manual" | ...
    provider_metrics_updated_at: metricsUpdatedAt, // the provider's own freshness stamp
    metrics: metrics ?? emptyMetrics(),
    unsupported,
    units,
    error, // { reason, detail } when this sync failed - previous snapshot is retained separately
  };
}

// Append a snapshot to a row, keeping history. On a provider ERROR we do
// NOT append a zeroed snapshot: we keep the last good snapshot and only
// record the error + bump last_metrics_sync.
export function attachSnapshot(row, snapshot) {
  row.metrics_snapshots = Array.isArray(row.metrics_snapshots) ? row.metrics_snapshots : [];
  row.last_metrics_sync = new Date().toISOString();
  if (snapshot.error) {
    row.metrics_error = { at: row.last_metrics_sync, ...snapshot.error };
    return { ok: true, appended: false, note: "sync error - last good snapshot retained, no zeros written" };
  }
  row.metrics_error = null;
  row.metrics_snapshots.push(snapshot);
  // keep the newest reading on the flat row.metrics for quick reads
  row.metrics = { ...snapshot.metrics };
  return { ok: true, appended: true };
}

// The most recent snapshot whose captured_at is within `windowMs` of the
// post's published_at. Returns null if none.
export function snapshotForWindow(snapshots, publishedAt, windowMs, now = Date.now()) {
  if (!Array.isArray(snapshots) || !publishedAt) return null;
  const pub = new Date(publishedAt).getTime();
  if (!Number.isFinite(pub)) return null;
  const cutoff = pub + windowMs;
  const eligible = snapshots
    .filter((s) => {
      const t = new Date(s.captured_at).getTime();
      return Number.isFinite(t) && t <= Math.min(cutoff, now);
    })
    .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
  return eligible[0] ?? null;
}

// All windows a post currently has data for.
export function availableWindows(snapshots, publishedAt, now = Date.now()) {
  return REPORTING_WINDOWS
    .map((w) => ({ ...w, snapshot: snapshotForWindow(snapshots, publishedAt, w.ms, now) }))
    .filter((w) => w.snapshot != null);
}

// ---- normalised KPIs (§12) -----------------------------------------
// Every KPI returns null unless BOTH its inputs exist as real numbers.
// Each carries the denominator it used so a reader never assumes
// cross-platform comparability.

function ratio(numer, denom) {
  if (numer == null || denom == null) return null;
  const n = Number(numer), d = Number(denom);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

// engagements = likes + comments + shares + saves + reposts + quotes
// (only the ones actually reported; if none reported -> null, not 0).
export function engagementCount(m) {
  const parts = ["likes", "comments", "shares", "saves", "reposts", "quotes"]
    .map((k) => m?.[k])
    .filter((v) => v != null && Number.isFinite(Number(v)));
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + Number(b), 0);
}

export function computeKpis(m, { attributedVisits = null, affiliateOutbound = null } = {}) {
  const eng = engagementCount(m);
  // prefer reach, fall back to impressions, and LABEL which was used.
  const engDenomKey = m?.reach != null ? "reach" : m?.impressions != null ? "impressions" : null;
  const engDenom = engDenomKey ? m[engDenomKey] : null;

  const provided = m?.engagement_rate;

  return {
    engagement_rate: {
      // provider value wins if present; else compute if we can
      value: provided != null ? Number(provided) : ratio(eng, engDenom),
      basis: provided != null ? "provider_reported" : engDenomKey,
      engagements: eng,
    },
    click_through_rate: {
      value: ratio(m?.clicks, m?.impressions),
      basis: m?.clicks != null && m?.impressions != null ? "clicks / impressions" : null,
    },
    website_ctr: {
      value: ratio(attributedVisits, m?.impressions),
      basis: attributedVisits != null && m?.impressions != null ? "attributed_site_visits / impressions" : null,
    },
    affiliate_outbound_rate: {
      value: ratio(affiliateOutbound, attributedVisits),
      basis: affiliateOutbound != null && attributedVisits != null ? "affiliate_outbound / attributed_site_visits" : null,
    },
  };
}

// A compact per-placement line for the CLI report (§16). Unsupported ->
// "—", no reading -> "·", a real 0 -> "0".
export function reportCell(value, key, unsupportedKeys = []) {
  if (unsupportedKeys.includes(key)) return "—";
  if (value == null) return "·";
  if (value === NOT_AVAILABLE_YET) return "n/a";
  return typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value);
}

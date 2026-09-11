// Phase 13C.6.0 - PostHog READ-ONLY query construction + the single HTTP
// call this tool ever makes. No writes, no capture(), no dashboards, no
// person/cohort/feature-flag endpoints - this module only ever POSTs to
// PostHog's HogQL Query API (a read endpoint) and returns rows.
//
// Credentials are environment variables ONLY, server/local-only, never
// NEXT_PUBLIC_*, never logged, never sent anywhere but PostHog's own API
// over HTTPS with the same-origin Authorization header:
//   POSTHOG_PERSONAL_API_KEY  - a PostHog Personal API Key with project
//                                read access (Settings -> Personal API Keys)
//   POSTHOG_PROJECT_ID        - the numeric project id (Project Settings
//                                -> Project ID) - NOT the phc_... ingest key
//   POSTHOG_API_HOST          - optional override; must resolve to an EU
//                                PostHog Cloud host (matches the site's
//                                own EU-only posture in lib/analytics/config.js)
//
// This reads from the PROJECT/APP host (eu.posthog.com), which is a
// different host than the INGEST host the site's browser SDK posts events
// to (eu.i.posthog.com, in lib/analytics/config.js) - PostHog serves
// reads from the app host, not the capture subdomain.

import {
  REPORT_EVENTS,
  REPORT_PROPERTIES,
  REPORT_DERIVED_COLUMNS,
  SUSPECTED_TEST_TRAFFIC,
  AI_ASSISTANT_UTM_SOURCES,
  AI_ASSISTANT_REFERRING_DOMAINS,
} from "./homepageEvents.mjs";

// 17C.0 - explicit page size for the grouped query. HogQL applies a
// DEFAULT LIMIT of 100 rows to any query without one; the original single
// grouped query had none, returned exactly 100 rows with hasMore:true, and
// the report silently read 0 for every event after the first six
// alphabetically (homepage_view, section impressions, search, QCA...).
// Every page is now explicitly ordered + limited, pages are fetched until
// exhausted (scripts/reporting/fetch.mjs), and the result is checked
// against an independent per-event count (buildEventTotalsQuery).
export const REPORT_PAGE_SIZE = 5000;

// Same EU-only app host the site's own analytics config uses
// (lib/analytics/config.js POSTHOG_EU_UI_HOST) - duplicated as a literal
// here (not imported) so this admin tool has zero dependency on the
// browser-bundled analytics module beyond the event-name taxonomy.
export const POSTHOG_EU_APP_HOST = "https://eu.posthog.com";

export class MissingCredentialsError extends Error {
  constructor(missing) {
    super(`Missing PostHog read credentials: ${missing.join(", ")}`);
    this.name = "MissingCredentialsError";
    this.missing = missing;
  }
}

// Reads process.env only. Never logs the values. Never accepts a CLI
// flag for the key (a key must never appear in shell history / process
// list) - environment variables only, as the phase requires.
export function loadCredentials(env = process.env) {
  const missing = [];
  if (!env.POSTHOG_PERSONAL_API_KEY) missing.push("POSTHOG_PERSONAL_API_KEY");
  if (!env.POSTHOG_PROJECT_ID) missing.push("POSTHOG_PROJECT_ID");
  if (missing.length) throw new MissingCredentialsError(missing);

  const rawHost = (env.POSTHOG_API_HOST || "").trim();
  let apiHost = POSTHOG_EU_APP_HOST;
  if (rawHost) {
    try {
      const h = new URL(rawHost).hostname.toLowerCase();
      const isEu = h === "eu.posthog.com" || h.endsWith(".eu.posthog.com");
      apiHost = isEu ? rawHost.replace(/\/$/, "") : POSTHOG_EU_APP_HOST;
    } catch {
      apiHost = POSTHOG_EU_APP_HOST;
    }
  }

  return {
    apiKey: env.POSTHOG_PERSONAL_API_KEY,
    projectId: env.POSTHOG_PROJECT_ID,
    apiHost,
  };
}

function hogqlStringLiteral(s) {
  return `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

// Pure - builds the HogQL query object. One query answers every metric in
// this report: event name x every structural property this tool ever
// reads, counted, grouped, over the requested window. No query ever
// selects distinct_id, person properties, $ip, raw event properties as a
// whole, or any property outside REPORT_PROPERTIES.
function hogqlList(values) {
  return values.map(hogqlStringLiteral).join(", ");
}

// Derived traffic_source: the stored value, except that pre-17C.0
// AI-assistant visits (stored as direct / referral / organic_search) are
// mapped to "ai_assistant" by comparing the SDK's utm_source / referring
// domain against a fixed allowlist. Only a category is returned - never
// the compared value. "internal" (full-load continuation) is kept as is.
export function trafficSourceExpression() {
  return [
    "multiIf(",
    "    ifNull(properties.traffic_source, '') = 'internal', properties.traffic_source,",
    `    lower(ifNull(properties.utm_source, '')) IN (${hogqlList(AI_ASSISTANT_UTM_SOURCES)}), 'ai_assistant',`,
    `    lower(ifNull(properties.$referring_domain, '')) IN (${hogqlList(AI_ASSISTANT_REFERRING_DOMAINS)}), 'ai_assistant',`,
    "    properties.traffic_source)",
  ].join("\n");
}

export function dayFlagExpression(flags = SUSPECTED_TEST_TRAFFIC) {
  const days = flags.map((f) => f.day);
  if (!days.length) return "'normal'";
  return `if(toString(toDate(timestamp)) IN (${hogqlList(days)}), 'suspected_test', 'normal')`;
}

// One expression per grouping column (the value it groups on).
function groupColumnExpressions() {
  return [
    ["event", "event"],
    ...REPORT_PROPERTIES.map((p) => [p, p === "traffic_source" ? trafficSourceExpression() : `properties.${p}`]),
    ["day_flag", dayFlagExpression()],
  ];
}

// A stable 64-bit key per group, used for KEYSET pagination (PostHog does
// not allow OFFSET on personal-API-key queries). Computed from the same
// expressions the query groups on, so every row of one group gets the
// same key. A hash collision between two different groups would merge
// them in paging - the completeness check would not catch a merge (sums
// still match), but it cannot drop or double-count an event either.
export function groupKeyExpression() {
  const parts = groupColumnExpressions().map(([, expr]) => `ifNull(toString(${expr}), '\u2205')`);
  // HogQL cityHash64 takes ONE argument: hash a separator-joined string of
  // every grouping value (null -> a sentinel). The separator is a string
  // literal no grouping value uses.
  return `cityHash64(concat(${parts.join(", '\u241F', ")}))`;
}

// Pure - builds ONE PAGE of the grouped aggregate query: event x every
// structural property this tool reads x the derived day_flag, counted,
// over [fromIso, toIso), explicitly ORDERED by the group key and
// explicitly LIMITED; the next page starts after the last key seen
// (keyset pagination). No query ever selects distinct_id, person
// properties, $ip, raw event properties as a whole, or any property
// outside REPORT_PROPERTIES.
export function buildHomepageQuery(fromIso, toIso, eventNames = REPORT_EVENTS, { limit = REPORT_PAGE_SIZE, afterKey = null } = {}) {
  if (!fromIso || !toIso) throw new Error("buildHomepageQuery requires fromIso and toIso");
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("buildHomepageQuery requires a positive integer limit");
  if (afterKey != null && !/^\d{1,20}$/.test(String(afterKey))) throw new Error("buildHomepageQuery afterKey must be an unsigned integer string");
  const eventList = hogqlList(eventNames);
  const cols = groupColumnExpressions();
  const selectCols = cols
    .filter(([name]) => name !== "event")
    .map(([name, expr]) => (name === "day_flag" || name === "traffic_source" || expr !== `properties.${name}` ? `${expr} AS ${name}` : `properties.${name} AS ${name}`))
    .join(",\n      ");
  const key = groupKeyExpression();
  const groupCols = ["event", ...REPORT_PROPERTIES, ...REPORT_DERIVED_COLUMNS].join(", ");
  const hogql = [
    "SELECT",
    "  event,",
    `  ${selectCols},`,
    "  count() AS n,",
    // numeric key for ordering / comparison; returned as a STRING too, so a
    // 64-bit value never loses precision as a JSON number
    `  ${key} AS group_key_n,`,
    "  toString(group_key_n) AS group_key",
    "FROM events",
    `WHERE timestamp >= toDateTime(${hogqlStringLiteral(fromIso)})`,
    `  AND timestamp < toDateTime(${hogqlStringLiteral(toIso)})`,
    `  AND event IN (${eventList})`,
    ...(afterKey != null ? [// afterKey is validated above as 1-20 decimal digits, so it is safe as
      // a plain integer literal (HogQL has no toUInt64)
      `  AND ${key} > ${String(afterKey)}`] : []),
    `GROUP BY ${groupCols}, group_key_n`,
    "ORDER BY group_key_n",
    `LIMIT ${limit}`,
  ].join("\n");
  return { kind: "HogQLQuery", query: hogql };
}

// Pure - the last group key on a page (a decimal string), for keyset paging.
export function lastGroupKey(response) {
  const i = (response?.columns ?? []).indexOf("group_key");
  const rows = response?.results ?? [];
  if (i < 0 || !rows.length) return null;
  return String(rows[rows.length - 1][i]);
}

// Pure - the INDEPENDENT completeness check: one count per event over the
// same window, with nothing grouped but the event name. The grouped pages
// must sum to exactly these numbers, event by event.
// Counts EVERY event name in the window (not just the report's), so the
// report can (a) verify its own events exactly and (b) state its scope
// honestly: "N of M events in this window are in this report". Event names
// are a small fixed taxonomy (+ SDK "$" events), so TOTALS_LIMIT is ample;
// a truncated answer is still refused (eventTotalsFromResponse).
export const TOTALS_LIMIT = 1000;
export function buildEventTotalsQuery(fromIso, toIso) {
  if (!fromIso || !toIso) throw new Error("buildEventTotalsQuery requires fromIso and toIso");
  const hogql = [
    "SELECT",
    "  event,",
    "  count() AS n",
    "FROM events",
    `WHERE timestamp >= toDateTime(${hogqlStringLiteral(fromIso)})`,
    `  AND timestamp < toDateTime(${hogqlStringLiteral(toIso)})`,
    "GROUP BY event",
    "ORDER BY event",
    `LIMIT ${TOTALS_LIMIT}`,
  ].join("\n");
  return { kind: "HogQLQuery", query: hogql };
}

// Pure - PostHog's Query API returns { columns: [...], results: [[...],...] }.
// Turns that into an array of plain aggregate rows: { event, section,
// source, origin_section, listing_type, device_class, traffic_source, n }.
// Never returns anything not already one of REPORT_PROPERTIES + event/n.
export function rowsFromResponse(response) {
  const columns = response?.columns;
  const results = response?.results;
  if (!Array.isArray(columns) || !Array.isArray(results)) {
    throw new Error("Unexpected PostHog query response shape (expected {columns, results})");
  }
  return results.map((r) => {
    const row = {};
    columns.forEach((c, i) => {
      if (c === "event" || c === "n" || REPORT_PROPERTIES.includes(c) || REPORT_DERIVED_COLUMNS.includes(c)) row[c] = r[i];
    });
    row.n = Number(row.n) || 0;
    return row;
  });
}

// The ONE network call this entire tool makes. A single POST to
// PostHog's read-only Query API. No pagination loop, no per-metric call,
// no polling - one grouped aggregate query covers the whole report
// (Phase 13C.6.0 API-efficiency requirement).
export async function runPostHogQuery({ apiHost, projectId, apiKey, query }, fetchImpl = fetch) {
  const url = `${apiHost}/api/projects/${encodeURIComponent(projectId)}/query/`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`PostHog query failed: HTTP ${res.status} ${res.statusText}${detail ? ` - ${detail.slice(0, 300)}` : ""}`);
  }
  return res.json();
}

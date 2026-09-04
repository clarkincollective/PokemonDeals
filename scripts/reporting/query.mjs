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

import { REPORT_EVENTS, REPORT_PROPERTIES } from "./homepageEvents.mjs";

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
export function buildHomepageQuery(fromIso, toIso, eventNames = REPORT_EVENTS) {
  if (!fromIso || !toIso) throw new Error("buildHomepageQuery requires fromIso and toIso");
  const eventList = eventNames.map(hogqlStringLiteral).join(", ");
  const propCols = REPORT_PROPERTIES.map((p) => `properties.${p} AS ${p}`).join(",\n      ");
  const groupCols = ["event", ...REPORT_PROPERTIES].join(", ");
  const hogql = [
    "SELECT",
    "  event,",
    `  ${propCols},`,
    "  count() AS n",
    "FROM events",
    `WHERE timestamp >= toDateTime(${hogqlStringLiteral(fromIso)})`,
    `  AND timestamp < toDateTime(${hogqlStringLiteral(toIso)})`,
    `  AND event IN (${eventList})`,
    `GROUP BY ${groupCols}`,
    "ORDER BY event",
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
      if (c === "event" || c === "n" || REPORT_PROPERTIES.includes(c)) row[c] = r[i];
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

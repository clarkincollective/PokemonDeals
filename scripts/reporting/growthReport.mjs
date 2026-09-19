#!/usr/bin/env node
// 2026-09-19 growth brief §11 - the growth / conversion reporting view.
//
//   node scripts/reporting/growthReport.mjs [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--json]
//
// READ-ONLY. Three HogQL queries against PostHog (the same credentials and
// single network call site as the homepage report: scripts/reporting/
// query.mjs - POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID, EU host):
//
//   1. affiliate_click by network x page_type x placement x origin_section
//      (network keeps EPN and TCGPlayer on separate lines - they are
//      reported by different programmes and must never be summed)
//   2. page_view by page_type (the denominator for clicks per 1k views)
//   3. the saved / alert loop: saved_view_opened, saved_search_saved,
//      alert_created (by alert_kind), and empty-state recovery clicks
//      (filter_cleared with context=empty_state)
//
// Rows older than the day `page_type` / `placement` shipped (2026-09-19)
// carry neither property; they are reported under "(pre-2026-09-19)" so
// the split is never back-filled or guessed. Commission is NOT here: EPN
// and Impact report it in their own dashboards at the granularity they
// support (docs/ebay-affiliate-attribution.md).
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });
import { loadCredentials, runPostHogQuery, MissingCredentialsError } from "./query.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const to = args.to ?? iso(today);
const from = args.from ?? iso(new Date(today.getTime() - 27 * 86_400_000));
const asJson = "json" in args;

const lit = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const window = `timestamp >= toDateTime(${lit(`${from} 00:00:00`)}) AND timestamp < toDateTime(${lit(`${to} 00:00:00`)}) + INTERVAL 1 DAY`;
const PRE = "(pre-2026-09-19)";

export const QUERIES = {
  affiliate: `
    SELECT
      coalesce(nullIf(properties.network, ''), 'ebay') AS network,
      coalesce(nullIf(properties.page_type, ''), ${lit(PRE)}) AS page_type,
      coalesce(nullIf(properties.placement, ''), ${lit(PRE)}) AS placement,
      coalesce(nullIf(properties.origin_section, ''), 'unknown') AS origin_section,
      count() AS clicks
    FROM events
    WHERE event = 'affiliate_click' AND ${window}
    GROUP BY network, page_type, placement, origin_section
    ORDER BY clicks DESC
    LIMIT 500`,
  pageviews: `
    SELECT coalesce(nullIf(properties.page_type, ''), 'unknown') AS page_type, count() AS views
    FROM events
    WHERE event = 'page_view' AND ${window}
    GROUP BY page_type ORDER BY views DESC LIMIT 100`,
  loop: `
    SELECT event,
      coalesce(nullIf(properties.alert_kind, ''), nullIf(properties.context, ''), '') AS detail,
      count() AS n
    FROM events
    WHERE event IN ('saved_view_opened', 'saved_search_saved', 'alert_created', 'filter_cleared') AND ${window}
    GROUP BY event, detail ORDER BY event, n DESC LIMIT 200`,
};

// Pure: PostHog {columns, results} -> array of row objects.
export function rowsOf(response) {
  const cols = response?.columns ?? [];
  return (response?.results ?? []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

// Pure: clicks per 1k page views for each page_type, EPN and TCGPlayer apart.
export function clicksPerThousand(affiliateRows, pageviewRows) {
  const views = new Map(pageviewRows.map((r) => [r.page_type, Number(r.views)]));
  const byKey = new Map();
  for (const r of affiliateRows) {
    const k = `${r.network}|${r.page_type}`;
    byKey.set(k, (byKey.get(k) ?? 0) + Number(r.clicks));
  }
  return [...byKey.entries()]
    .map(([k, clicks]) => {
      const [network, page_type] = k.split("|");
      const v = views.get(page_type) ?? 0;
      return { network, page_type, clicks, views: v, per_1k_views: v > 0 ? +(1000 * clicks / v).toFixed(1) : null };
    })
    .sort((a, b) => b.clicks - a.clicks);
}

function table(rows, cols) {
  if (!rows.length) return "  (no rows)";
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (r) => "  " + cols.map((c, i) => String(r[c] ?? "").padEnd(w[i])).join("  ");
  return [line(Object.fromEntries(cols.map((c) => [c, c]))), "  " + w.map((n) => "-".repeat(n)).join("  "), ...rows.map(line)].join("\n");
}

async function main() {
  let creds;
  try {
    creds = loadCredentials();
  } catch (e) {
    if (e instanceof MissingCredentialsError) {
      console.error(e.message);
      console.error("Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID (read access) to run this report.");
      process.exit(2);
    }
    throw e;
  }
  const run = (query) => runPostHogQuery({ ...creds, query: { kind: "HogQLQuery", query } });
  const [aff, pv, loop] = await Promise.all([run(QUERIES.affiliate), run(QUERIES.pageviews), run(QUERIES.loop)]);
  const affiliate = rowsOf(aff);
  const pageviews = rowsOf(pv);
  const loopRows = rowsOf(loop).filter((r) => r.event !== "filter_cleared" || r.detail === "empty_state");
  const perThousand = clicksPerThousand(affiliate, pageviews);
  const report = { from, to, affiliate, pageviews, per_1k_views: perThousand, loop: loopRows };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Growth report ${from} → ${to} (PostHog, read-only; cookieless counts, no identity)`);
  console.log("\nAffiliate clicks per 1k page views (EPN and TCGPlayer reported separately - never summed):");
  console.log(table(perThousand, ["network", "page_type", "clicks", "views", "per_1k_views"]));
  console.log("\nAffiliate clicks by network × page type × placement × origin section:");
  console.log(table(affiliate, ["network", "page_type", "placement", "origin_section", "clicks"]));
  console.log("\nSaved / alert loop and empty-state recovery:");
  console.log(table(loopRows, ["event", "detail", "n"]));
  console.log("\nCommission: EPN (customid = coarse surface) and Impact dashboards only - see docs/ebay-affiliate-attribution.md.");
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("growthReport.mjs")) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

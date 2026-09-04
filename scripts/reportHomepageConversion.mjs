#!/usr/bin/env node
// Phase 13C.6.0 - local, admin-only, READ-ONLY PostHog conversion report
// for the PokemonDealFinder homepage funnel.
//
//   node scripts/reportHomepageConversion.mjs [--from ISO] [--to ISO] [--json]
//
// Requires two environment variables (server/local only, never
// NEXT_PUBLIC_*, never committed):
//   POSTHOG_PERSONAL_API_KEY  - PostHog Settings -> Personal API Keys
//                                (needs project read access; no write scopes needed)
//   POSTHOG_PROJECT_ID        - PostHog Project Settings -> Project ID
//                                (the numeric id, NOT the phc_... ingest key)
// Optional:
//   POSTHOG_API_HOST          - override the EU app/query host (defaults
//                                to https://eu.posthog.com; a non-EU host
//                                is rejected the same way the site's own
//                                analytics config rejects one)
//
// This script:
//   - makes exactly ONE network call (a single grouped HogQL aggregate
//     query) - see scripts/reporting/query.mjs
//   - never calls posthog.capture(), never creates/edits a dashboard,
//     insight, cohort, feature flag, or person record
//   - never requests or prints person/session/card/Pokemon/listing/query
//     data - only the aggregate counts the Phase 13A/13C taxonomy already
//     approves (scripts/reporting/homepageEvents.mjs)
//   - defaults its window to CURRENT_PRODUCT_MEASUREMENT_START (below) so
//     a stale pre-fix, or pre-recovery, number can't silently leak into a
//     13C.6 decision
//
// Add your own credentials to a local, gitignored env file (e.g.
// .env.local) or your shell environment - never paste them into a chat
// session, and never add them as NEXT_PUBLIC_*.

import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { loadCredentials, MissingCredentialsError, buildHomepageQuery, runPostHogQuery, rowsFromResponse } from "./reporting/query.mjs";

// 13C.6.1 - the other scripts/ tools in this repo load credentials from
// .env.local the same way; this CLI does too (never .env.example, never
// committed). Loading dotenv here - not in reporting/query.mjs - keeps
// the pure/testable modules free of any file-system or process.env
// side effect beyond the explicit loadCredentials(env) call they accept.
// quiet:true - dotenv's own "injected env" banner goes to stdout by
// default, which would corrupt --json mode's stdout contract (this tool
// promises pure parseable JSON on stdout for piping/automation).
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });
import { aggregateRows, buildReport } from "./reporting/aggregate.mjs";
import { formatText } from "./reporting/format.mjs";

// Phase 13C.6.2 - TWO distinct timestamps, deliberately kept separate and
// both preserved (neither one erases the other):
//
//   ANALYTICS_INSTRUMENTATION_START - when event instrumentation itself
//   became complete and trustworthy. The production deploy
//   (dpl_ARKnvBTmHn2GQMYrLjdjhWumS48U, Phase 13C.5.1) at which every
//   homepage-funnel measurement fix (13C.5 + 13C.5.1) was simultaneously
//   live. Data from before this instant reflects a broken/incomplete
//   MEASUREMENT (dropped Discover/example events, double-counted
//   affiliate clicks, missing mobile section impressions, no sticky-
//   search events) - a measurement-integrity boundary, not a product
//   one. Kept here purely as a documented historical fact.
//
//   CURRENT_PRODUCT_MEASUREMENT_START - when the CURRENT product state
//   became the one worth measuring. P0.2 (2026-09-04) fixed a real
//   stale/sold-deal leakage bug and materially changed deal eligibility:
//   the availability-integrity code deployed at 2026-09-04T22:23:25Z,
//   Best Deals/Auctions recovered at 2026-09-04T22:55:22Z, and Just Added
//   (plus the final homepage-wide healthy state) recovered at
//   2026-09-04T23:20:02Z. Data between the two timestamps above mixes
//   pre-fix and recovering-lane inventory with the stable post-fix
//   product - not comparable to what a visitor sees today. This is the
//   constant future 13C.6 analysis should default to.
export const ANALYTICS_INSTRUMENTATION_START = "2026-09-04T20:18:17Z";
export const CURRENT_PRODUCT_MEASUREMENT_START = "2026-09-04T23:20:02Z";
// The two intermediate P0.2 milestones, named here only so the warning
// text below can cite them precisely - not exported/reused elsewhere,
// so this is documentation, not a second copy of a "the" timestamp.
const P0_2_DEPLOY_START = "2026-09-04T22:23:25Z";
const P0_2_BEST_DEALS_AUCTIONS_RECOVERED = "2026-09-04T22:55:22Z";

const PRODUCT_STATE = "POST-P0.2 AVAILABILITY INTEGRITY";

function parseArgs(argv) {
  const out = { from: CURRENT_PRODUCT_MEASUREMENT_START, to: new Date().toISOString(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--from") out.from = argv[++i];
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`node scripts/reportHomepageConversion.mjs [--from ISO] [--to ISO] [--json]

  --from ISO   window start (default: current-product measurement start, ${CURRENT_PRODUCT_MEASUREMENT_START})
  --to   ISO   window end   (default: now)
  --json       print the aggregate report as JSON only (no text report)

Historical instrumentation became complete at ${ANALYTICS_INSTRUMENTATION_START}
(Phase 13C.5/13C.5.1), but P0.2 changed deal-eligibility criteria on
2026-09-04 - an earlier --from is still permitted for diagnostic/
historical analysis, and prints a warning rather than being blocked.

Requires POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in the environment.
Never pass credentials as CLI flags.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  // Two separate warning tiers, deliberately worded differently - neither
  // one blocks the query, both are diagnostic-only.
  if (Date.parse(args.from) < Date.parse(ANALYTICS_INSTRUMENTATION_START)) {
    console.warn(
      `WARNING: --from (${args.from}) is BEFORE analytics instrumentation was complete (${ANALYTICS_INSTRUMENTATION_START}).\n` +
        "         Data before that instant reflects a known-broken/incomplete MEASUREMENT\n" +
        "         (see Phase 13C.5 / 13C.5.1) - dropped events, double-counted clicks, missing\n" +
        "         impressions - independent of any product change.\n"
    );
  } else if (Date.parse(args.from) < Date.parse(CURRENT_PRODUCT_MEASUREMENT_START)) {
    console.warn(
      `WARNING: --from (${args.from}) is BEFORE the current product state (${CURRENT_PRODUCT_MEASUREMENT_START}).\n` +
        `         Analytics instrumentation was complete from ${ANALYTICS_INSTRUMENTATION_START}, but P0.2 (a\n` +
        `         stale/sold-deal-leakage fix) changed deal-eligibility criteria: the availability-\n` +
        `         integrity code deployed at ${P0_2_DEPLOY_START}, and homepage premium lanes then\n` +
        `         went through a recovery period (Best Deals/Auctions ${P0_2_BEST_DEALS_AUCTIONS_RECOVERED},\n` +
        `         Just Added/full homepage ${CURRENT_PRODUCT_MEASUREMENT_START}).\n` +
        "         Data in this window mixes pre-fix and recovering-lane inventory with the stable\n" +
        "         current product - do not mix it into a current-product conversion decision.\n"
    );
  }
  if (Number.isNaN(Date.parse(args.from)) || Number.isNaN(Date.parse(args.to))) {
    console.error("Error: --from / --to must be valid ISO 8601 timestamps.");
    process.exitCode = 1;
    return;
  }

  let creds;
  try {
    creds = loadCredentials(process.env);
  } catch (e) {
    if (e instanceof MissingCredentialsError) {
      console.log(
        [
          "PostHog read credentials are not configured - nothing was queried.",
          "",
          "This report needs two environment variables (set them locally, e.g. in",
          ".env.local, or in your shell - never paste them into a chat session):",
          "",
          "  POSTHOG_PERSONAL_API_KEY   PostHog -> Settings -> Personal API Keys",
          "                             (project read access is enough; no write scopes)",
          "  POSTHOG_PROJECT_ID         PostHog -> Project Settings -> Project ID",
          "                             (the numeric id, NOT the phc_... ingest key)",
          "",
          `Missing: ${e.missing.join(", ")}`,
          "",
          "Nothing was sent to PostHog. This is expected until you add credentials.",
        ].join("\n")
      );
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  const query = buildHomepageQuery(args.from, args.to);

  let response;
  try {
    response = await runPostHogQuery({ ...creds, query });
  } catch (e) {
    console.error(`Could not fetch the PostHog report: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const rows = rowsFromResponse(response);
  const metrics = aggregateRows(rows);
  const report = buildReport(metrics, {
    from: args.from,
    to: args.to,
    instrumentationStart: ANALYTICS_INSTRUMENTATION_START,
    currentProductStart: CURRENT_PRODUCT_MEASUREMENT_START,
    productState: PRODUCT_STATE,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatText(report));
  }
}

// Only run when invoked directly (`node scripts/reportHomepageConversion.mjs`),
// never as a side effect of another module importing
// CURRENT_PRODUCT_MEASUREMENT_START / parseArgs / etc. for testing.
const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e) => {
    // Fail clean, never an opaque stack trace to the terminal.
    console.error(`Report failed: ${e && e.message ? e.message : e}`);
    process.exitCode = 1;
  });
}

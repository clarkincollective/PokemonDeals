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
//   - defaults its window to the start of the clean measurement window
//     (see CLEAN_WINDOW_START below) so a stale pre-fix number can't
//     silently leak into a 13C.6 decision
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

// 2026-09-04T20:18:17Z - the production deploy (dpl_ARKnvBTmHn2GQMYrLjdjhWumS48U,
// Phase 13C.5.1) at which every homepage-funnel fix (13C.5 + 13C.5.1) was
// simultaneously live. Data from before this instant reflects a broken
// or incomplete funnel (dropped Discover/example events, double-counted
// affiliate clicks, missing mobile section impressions, no sticky-search
// events) and must not be used for a 13C.6 decision.
export const CLEAN_WINDOW_START = "2026-09-04T20:18:17Z";

function parseArgs(argv) {
  const out = { from: CLEAN_WINDOW_START, to: new Date().toISOString(), json: false };
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

  --from ISO   window start (default: clean measurement window start, ${CLEAN_WINDOW_START})
  --to   ISO   window end   (default: now)
  --json       print the aggregate report as JSON only (no text report)

Requires POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in the environment.
Never pass credentials as CLI flags.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (Date.parse(args.from) < Date.parse(CLEAN_WINDOW_START)) {
    console.warn(
      `WARNING: --from (${args.from}) is BEFORE the clean measurement window start (${CLEAN_WINDOW_START}).\n` +
        "         Data before that instant reflects a known-broken/incomplete homepage funnel\n" +
        "         (see Phase 13C.5 / 13C.5.1) and should not be used for a 13C.6 decision.\n"
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
  const report = buildReport(metrics, { from: args.from, to: args.to });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatText(report));
  }
}

// Only run when invoked directly (`node scripts/reportHomepageConversion.mjs`),
// never as a side effect of another module importing CLEAN_WINDOW_START /
// parseArgs / etc. for testing.
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

#!/usr/bin/env node
// Phase CRM-1 - read-only subscriber summary.
//
//   npm run crm:summary            human-readable
//   npm run crm:summary -- --json  machine-readable
//
// Reads at most MAX_ROWS minimal rows from newsletter_subscribers
// (status / timestamps / attribution source only - NEVER the email
// address) and prints aggregate counts. No write, no email, no eBay call.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { summarizeSubscribers } from "../lib/crm/summary.js";

const JSON_OUT = process.argv.includes("--json");
const MAX_ROWS = 50000;

async function main() {
  const db = supabaseAdmin();
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += 1000) {
    const { data, error } = await db
      .from("newsletter_subscribers")
      // deliberately NOT selecting `email`
      .select("status, confirmed, unsubscribed_at, created_at, source, utm_source")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) {
      console.error(`crm:summary - query failed: ${error.message}`);
      process.exit(1);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const summary = summarizeSubscribers(rows);

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("\n  SUBSCRIBERS (newsletter_subscribers) — read-only, no addresses\n");
  console.log(`  active .............. ${summary.active}`);
  console.log(`  pending ............. ${summary.pending}`);
  console.log(`  unsubscribed ........ ${summary.unsubscribed}`);
  console.log(`  bounced ............. ${summary.bounced}`);
  console.log(`  complained ......... ${summary.complained}`);
  console.log(`  ─────`);
  console.log(`  signups 7d / 30d ... ${summary.signups_7d} / ${summary.signups_30d}`);
  console.log(`  top signup source .. ${summary.top_signup_source ?? "—"}`);
  console.log("");
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});

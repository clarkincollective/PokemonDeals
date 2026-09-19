#!/usr/bin/env node
// 2026-09-19 growth brief §6 - migration verification.
//
//   node scripts/alertCriteriaMigrationCheck.mjs
//
// Read-only. Confirms supabase/price_alerts_criteria_migration.sql has been
// applied: every criteria column is selectable. Makes NO schema change and
// writes NO rows. Exit 0 when applied, 2 when not.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const COLS = "id,marketplace,condition,grader,grade,target_amount,target_currency,target_scope,alert_kind,min_discount,criteria,digest";
const db = supabaseAdmin();
const { error } = await db.from("price_alerts").select(COLS).limit(1);
if (error) {
  console.log(JSON.stringify({ applied: false, detail: error.message, next: "run supabase/price_alerts_criteria_migration.sql in the SQL Editor" }, null, 2));
  process.exit(2);
}
console.log(JSON.stringify({ applied: true, columns: COLS.split(",") }, null, 2));

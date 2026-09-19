#!/usr/bin/env node
// 2026-09-19 - verification for supabase/integrity_migration.sql.
//
//   node scripts/integrityMigrationCheck.mjs
//
// Read-only: confirms deals.deactivated_at and integrity_snapshots exist.
// Exit 0 when both are present, 2 otherwise. Writes nothing.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const db = supabaseAdmin();
const col = await db.from("deals").select("id,deactivated_at").limit(1);
const tbl = await db.from("integrity_snapshots").select("day,active_shown,withheld_active,checked_24h,stopped_24h,withheld_by_reason").limit(1);
const out = {
  applied: !col.error && !tbl.error,
  deactivated_at: col.error ? `MISSING: ${col.error.message}` : "OK",
  integrity_snapshots: tbl.error ? `MISSING: ${tbl.error.message}` : "OK",
  next: !col.error && !tbl.error ? null : "run supabase/integrity_migration.sql in the SQL Editor",
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.applied ? 0 : 2);

#!/usr/bin/env node
// Phase SOCIAL-NEWSROOM-2 - migration verification (§2).
//
//   node scripts/socialNewsroomMigrationCheck.mjs
//
// Read-only. Confirms supabase/social_editorial_newsroom_migration.sql
// has been applied: the 3 tables exist with the expected columns, and a
// non-destructive probe insert/delete round-trips (so RLS + service-role
// access work). Makes NO schema change and leaves NO rows behind.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const db = supabaseAdmin();
const EXPECT = {
  social_stories: "story_id,series,pillar,bucket,content_goal,cta_intensity,shelf_life_class,lane,subject_type,subject_id,pokemon,set_id,card_ids,deal_ids,created_at,captured_at,valid_from,valid_until,latest_safe_publish_at,shelf_basis,organic_score,conversion_score,originality_score,professional_score,status,facts_json,experiment_id,source_commit,narrative,updated_at",
  social_story_placements: "placement_id,story_id,platform,placement_type,planned_for,status,content_id,artifact_hash,hosted_url,buffer_provider_ref,scheduled_for,provider_state,published_at,platform_post_url,caption_style,created_at,updated_at",
  social_qa_runs: "qa_id,story_id,placement_id,qa_type,result,score,blockers,detail,checked_at",
};

const out = { applied: true, tables: {}, roundtrip: null, note: null };

for (const [t, cols] of Object.entries(EXPECT)) {
  const { error } = await db.from(t).select(cols).limit(1);
  out.tables[t] = error ? `MISSING/MISMATCH: ${error.message}` : "OK (all expected columns present)";
  if (error) out.applied = false;
}

if (out.applied) {
  // non-destructive round trip on a sentinel story id
  const sid = "__migration_check__";
  const { error: insErr } = await db.from("social_stories").upsert(
    { story_id: sid, series: "METHODOLOGY", pillar: "BRAND", status: "CANCELLED", facts_json: {} },
    { onConflict: "story_id" }
  );
  const { error: delErr } = await db.from("social_stories").delete().eq("story_id", sid);
  out.roundtrip = insErr ? `write failed: ${insErr.message}` : delErr ? `cleanup failed: ${delErr.message}` : "OK (upsert + delete round-trip, no row left behind)";
  if (insErr || delErr) out.applied = false;
} else {
  out.note = "Run supabase/social_editorial_newsroom_migration.sql in the Supabase SQL editor, then re-run this check.";
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.applied ? 0 : 1);

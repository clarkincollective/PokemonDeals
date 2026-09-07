// Phase SOCIAL-NEWSROOM-1 - READ-ONLY persistence access for the
// editorial newsroom tables (§3).
//
// Mirrors lib/social/db.mjs: service-role client, LOCAL admin tooling
// only, and READ-ONLY - there is no .insert()/.update()/.delete()/.upsert()
// call in this module or anywhere else in lib/social/newsroom/. The
// backlog builder writes NOTHING to Supabase in this phase; when the
// owner has run the migration and autonomy is later enabled, the
// distribution layer (not this module) will own the writes.
//
// Until supabase/social_editorial_newsroom_migration.sql is applied,
// tablesReady() returns false and every reader returns an empty result -
// nothing errors (same cheap-probe pattern as
// app/api/verify-deals exactVerifiedColReady()).

import { supabaseAdmin } from "../../supabaseAdmin.js";

export const NEWSROOM_TABLES = Object.freeze(["social_stories", "social_story_placements", "social_qa_runs"]);

let _probe = null;
export async function tablesReady(db = supabaseAdmin()) {
  if (_probe != null) return _probe;
  const { error } = await db.from("social_stories").select("story_id").limit(1);
  _probe = !error;
  return _probe;
}

export function _resetProbe() {
  _probe = null;
}

export async function loadStories({ statuses = null, sinceIso = null, limit = 500 } = {}) {
  const db = supabaseAdmin();
  if (!(await tablesReady(db))) return { rows: [], ready: false };
  let q = db.from("social_stories").select("*").order("created_at", { ascending: false }).limit(limit);
  if (Array.isArray(statuses) && statuses.length) q = q.in("status", statuses);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) return { rows: [], ready: true, error: error.message };
  return { rows: data ?? [], ready: true };
}

export async function loadPlacements({ statuses = null, sinceIso = null, limit = 1000 } = {}) {
  const db = supabaseAdmin();
  if (!(await tablesReady(db))) return { rows: [], ready: false };
  let q = db.from("social_story_placements").select("*").order("planned_for", { ascending: true }).limit(limit);
  if (Array.isArray(statuses) && statuses.length) q = q.in("status", statuses);
  if (sinceIso) q = q.gte("planned_for", sinceIso);
  const { data, error } = await q;
  if (error) return { rows: [], ready: true, error: error.message };
  return { rows: data ?? [], ready: true };
}

export async function loadQaRuns({ storyId = null, limit = 500 } = {}) {
  const db = supabaseAdmin();
  if (!(await tablesReady(db))) return { rows: [], ready: false };
  let q = db.from("social_qa_runs").select("*").order("checked_at", { ascending: false }).limit(limit);
  if (storyId) q = q.eq("story_id", storyId);
  const { data, error } = await q;
  if (error) return { rows: [], ready: true, error: error.message };
  return { rows: data ?? [], ready: true };
}

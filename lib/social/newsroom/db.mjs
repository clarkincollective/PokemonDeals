// Phase SOCIAL-NEWSROOM-1/2 - persistence access for the editorial
// newsroom tables (§3).
//
// SOCIAL-NEWSROOM-1 shipped this read-only. SOCIAL-NEWSROOM-2 adds the
// EDITORIAL writes (upsertStory / upsertPlacements / recordQaRun) - the
// newsroom DB is now the editorial + planning source of truth. These
// writes are:
//   * idempotent  - upsert on the primary key; a repeated backlog build
//                   never creates a duplicate row (§4).
//   * scoped      - ONLY these three tables. No write touches `deals`,
//                   the distribution ledger JSON, hosted-assets.json,
//                   newsletter_subscribers, catalog_snapshot, or
//                   digest_state.
//   * gated       - every reader AND writer no-ops (returns
//                   { ready:false }) until the migration is applied.
//
// It does NOT publish, schedule to Buffer, mutate the ledger, or set a
// placement to PUBLISHED - lib/social/newsroom/bufferBacklog.mjs owns the
// (gated) provider-scheduling call and only ever writes BUFFER_QUEUED.

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

// ---- SOCIAL-NEWSROOM-2 editorial writes (idempotent, gated) --------

// Upsert one story row (primary key story_id). Repeated builds with the
// same stable id update in place - never a duplicate (§4).
export async function upsertStory(row) {
  const db = supabaseAdmin();
  if (!(await tablesReady(db))) return { ready: false, wrote: 0 };
  const { data, error } = await db
    .from("social_stories")
    .upsert(row, { onConflict: "story_id" })
    .select("story_id");
  if (error) return { ready: true, wrote: 0, error: error.message };
  return { ready: true, wrote: data?.length ?? 0, story_id: row.story_id };
}

// Upsert placement rows (primary key placement_id; also unique on
// (story_id, platform)).
export async function upsertPlacements(rows = []) {
  const db = supabaseAdmin();
  if (!(await tablesReady(db))) return { ready: false, wrote: 0 };
  if (!rows.length) return { ready: true, wrote: 0 };
  const { data, error } = await db
    .from("social_story_placements")
    .upsert(rows, { onConflict: "placement_id" })
    .select("placement_id");
  if (error) return { ready: true, wrote: 0, error: error.message };
  return { ready: true, wrote: data?.length ?? 0 };
}

// Patch one placement by id (status / provider ref / schedule / state).
// Never sets published_at unless explicitly passed a value the caller
// verified from provider evidence.
export async function patchPlacement(placementId, patch = {}) {
  const db = supabaseAdmin();
  if (!(await tablesReady(db))) return { ready: false, wrote: 0 };
  const { data, error } = await db
    .from("social_story_placements")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("placement_id", placementId)
    .select("placement_id");
  if (error) return { ready: true, wrote: 0, error: error.message };
  return { ready: true, wrote: data?.length ?? 0 };
}

// Append a QA run row (append-only audit).
export async function recordQaRun(row) {
  const db = supabaseAdmin();
  if (!(await tablesReady(db))) return { ready: false, wrote: 0 };
  const { data, error } = await db.from("social_qa_runs").insert(row).select("qa_id");
  if (error) return { ready: true, wrote: 0, error: error.message };
  return { ready: true, wrote: data?.length ?? 0 };
}

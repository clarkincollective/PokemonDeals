// graded-retention-r1 - DURABLE, ATOMIC retention attempt reservations for
// app/api/verify-deals (the graded retention lane's UNKNOWN cooldown).
//
// Storage: the existing catalog_snapshot(kind text PRIMARY KEY, data jsonb,
// updated_at timestamptz) table - one row per exact eBay item:
//   kind       = "verify_graded_retention_attempt:<eBay legacy item id>"
//   updated_at = when the current reservation was made (the cooldown clock)
//   data       = { item, at, run, status }   (status filled in after the call)
// Every existing catalog_snapshot reader selects by an exact kind, so these
// rows are invisible to them. No schema change.
//
// Why rows, not one blob: verify-deals has no run lock, so two invocations
// can overlap (a duplicated cron delivery, a manual call). A shared blob is
// read-modify-write and one run can overwrite the other's entries. Here
// every write is a single conditional statement:
//   reserve  INSERT kind            - the primary key makes it atomic; a
//                                     concurrent reservation gets 23505
//            or UPDATE ... WHERE kind = k AND updated_at < cooldown cutoff
//                                     - takes over only an EXPIRED reservation;
//                                     Postgres re-checks the WHERE under the
//                                     row lock, so two runs cannot both win
//   result   UPDATE data WHERE kind = k AND updated_at = <this reservation>
//                                     - never touches a newer reservation or
//                                     any other item's row
//   prune    DELETE WHERE kind LIKE prefix AND updated_at < now - 24 h
//                                     - far outside the 2 h cooldown, so a
//                                     live cooldown is never deleted
// None of this is availability evidence: no `deals` column is written here.

import { GRADED_RETENTION_RECHECK_HOURS } from "./verifyAllocator.mjs";

export const RETENTION_ATTEMPT_KIND_PREFIX = "verify_graded_retention_attempt:";
export const RETENTION_ATTEMPT_KEEP_HOURS = 24;
const TABLE = "catalog_snapshot";
const H = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();

export const retentionAttemptKind = (itemKey) => `${RETENTION_ATTEMPT_KIND_PREFIX}${itemKey}`;

// Items reserved within the cooldown, as a Set of item keys. null when the
// record cannot be read - the caller must then give the lane no slots.
export async function readRetentionCooldowns(db, { now = Date.now() } = {}) {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select("kind, updated_at")
      .like("kind", `${RETENTION_ATTEMPT_KIND_PREFIX}%`)
      .gte("updated_at", iso(now - GRADED_RETENTION_RECHECK_HOURS * H))
      .limit(1000);
    if (error) return null;
    return new Set((data ?? []).map((r) => String(r.kind).slice(RETENTION_ATTEMPT_KIND_PREFIX.length)));
  } catch {
    return null;
  }
}

// Atomic reservation of one eBay item. { reserved: true, at } only when the
// row was durably written by THIS call; otherwise reason "cooldown" (another
// reservation is live) or "write_error". A caller must not make the provider
// call for an item that is not reserved.
export async function reserveRetentionAttempt(db, itemKey, { now = Date.now(), run = null } = {}) {
  const kind = retentionAttemptKind(itemKey);
  const at = iso(now);
  const data = { item: itemKey, at, run, status: null };
  try {
    const ins = await db.from(TABLE).insert({ kind, data, updated_at: at });
    if (!ins.error) return { reserved: true, at };
    if (ins.error.code !== "23505") return { reserved: false, reason: "write_error" };
    const up = await db
      .from(TABLE)
      .update({ data, updated_at: at })
      .eq("kind", kind)
      .lt("updated_at", iso(now - GRADED_RETENTION_RECHECK_HOURS * H))
      .select("kind");
    if (up.error) return { reserved: false, reason: "write_error" };
    return (up.data ?? []).length === 1 ? { reserved: true, at } : { reserved: false, reason: "cooldown" };
  } catch {
    return { reserved: false, reason: "write_error" };
  }
}

// The verdict for a reservation this run holds. Conditional on the exact
// reservation time, so a newer reservation (or any other row) is never
// overwritten. Returns true when this reservation's row was updated.
export async function recordRetentionResult(db, itemKey, { at, run = null, status }) {
  try {
    const { data, error } = await db
      .from(TABLE)
      .update({ data: { item: itemKey, at, run, status } })
      .eq("kind", retentionAttemptKind(itemKey))
      .eq("updated_at", at)
      .select("kind");
    return !error && (data ?? []).length === 1;
  } catch {
    return false;
  }
}

// Bounded storage: removes reservations older than the keep horizon only.
export async function pruneRetentionAttempts(db, { now = Date.now() } = {}) {
  try {
    const { error } = await db
      .from(TABLE)
      .delete()
      .like("kind", `${RETENTION_ATTEMPT_KIND_PREFIX}%`)
      .lt("updated_at", iso(now - RETENTION_ATTEMPT_KEEP_HOURS * H));
    return !error;
  } catch {
    return false;
  }
}

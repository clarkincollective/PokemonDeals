// Phase 13E.8A - PROPOSED PLAN persistence (§17).
//
// A PLAN is NOT an approval and NEVER becomes a published job on its own.
// It is a deterministic proposal the operator can accept/reject. Stored
// separately from the publishing ledger (lib/social/distribution/ledger.json)
// so the two never blur.
//
// States: PROPOSED -> ACCEPTED | REJECTED | EXPIRED.
//   ACCEPTED does NOT create a ledger row in this phase - a human still
//   runs the existing prepare-batch/review/approve-batch flow.
//
// Pure logic + a committed JSON file (plans.json, seeded []).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLANS_PATH = join(HERE, "plans.json");

export const PLAN_STATES = Object.freeze(["PROPOSED", "ACCEPTED", "REJECTED", "EXPIRED"]);

export function loadPlans(path = PLANS_PATH) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("plans.json is not a JSON array");
  return parsed;
}

export function savePlans(rows, path = PLANS_PATH) {
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

// Mark any PROPOSED plan whose fresh_until has passed as EXPIRED. Pure -
// mutates + returns the array; the caller persists.
export function expireStale(plans, now = Date.now()) {
  let changed = 0;
  for (const p of plans) {
    if (p.state !== "PROPOSED") continue;
    const fu = p.fresh_until_utc ? Date.parse(p.fresh_until_utc) : NaN;
    if (Number.isFinite(fu) && fu < now) {
      p.state = "EXPIRED";
      p.history = Array.isArray(p.history) ? p.history : [];
      p.history.push({ at: new Date(now).toISOString(), note: "auto-expired: fresh_until passed" });
      changed++;
    }
  }
  return { plans, changed };
}

// Replace all PROPOSED plans for a horizon window with a fresh set (a new
// planning run supersedes the previous proposal for the same days).
// ACCEPTED / REJECTED / EXPIRED plans are always kept as an audit trail.
export function replaceProposed(existing, fresh, { horizonStartUtc, horizonEndUtc } = {}) {
  const start = horizonStartUtc ? Date.parse(horizonStartUtc) : -Infinity;
  const end = horizonEndUtc ? Date.parse(horizonEndUtc) : Infinity;
  const kept = existing.filter((p) => {
    if (p.state !== "PROPOSED") return true; // keep decided/expired plans
    const t = Date.parse(p.time_utc);
    return !(Number.isFinite(t) && t >= start && t <= end); // drop superseded proposals in-window
  });
  return [...kept, ...fresh];
}

export function planCounts(plans) {
  const c = { PROPOSED: 0, ACCEPTED: 0, REJECTED: 0, EXPIRED: 0 };
  for (const p of plans) if (c[p.state] != null) c[p.state]++;
  return c;
}

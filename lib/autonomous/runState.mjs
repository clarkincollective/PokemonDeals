// Phase AUTO-1 - DURABLE AUTONOMOUS-RUN STATE + CIRCUIT BREAKER.
//
// Pure logic + JSON files. No network, no provider, no secrets. Mirrors
// the ledger / batches / records pattern in this repo.
//
// Two persisted structures per surface (social | email):
//   runs.json    an append log of autonomous runs (last N kept)
//   circuit.json the durable circuit-breaker state
//
// Files live under .social-preview/autonomous/<surface>/ which is
// gitignored - run state is machine-local operational data, not source.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
export const STATE_DIR = path.join(ROOT, ".social-preview", "autonomous");
const KEEP_RUNS = 50;

function dirFor(surface) {
  const d = path.join(STATE_DIR, surface === "email" ? "email" : "social");
  mkdirSync(d, { recursive: true });
  return d;
}
function readJson(p, fb) {
  try {
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb;
  } catch {
    return fb;
  }
}
function writeJson(p, v) {
  writeFileSync(p, JSON.stringify(v, null, 2) + "\n", "utf8");
}

// --- the run record (§3) --------------------------------------------
// No secrets. `skip_reasons` / `provider_errors` are short strings.
export function newRun({ surface, mode, requestLive }) {
  return {
    run_id: `${surface}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    surface,
    started_at: new Date().toISOString(),
    finished_at: null,
    mode, // OFF | DRY_RUN | LIVE | SUSPENDED
    request_live: Boolean(requestLive),
    eligible_candidates: 0,
    selected_content_ids: [],
    planned_placements: [],
    rendered: [],
    hosted: [],
    submitted: [],
    queued: [],
    published: [],
    failed: [],
    skipped: [],
    skip_reasons: [],
    provider_errors: [],
    circuit_state: "CLOSED",
    outcome: null, // NO_CONTENT | DRY_RUN_OK | PUBLISHED | PARTIAL_SUCCESS | SUSPENDED | ERROR
  };
}

export function finishRun(run, outcome) {
  run.finished_at = new Date().toISOString();
  run.outcome = outcome ?? run.outcome ?? "DRY_RUN_OK";
  return run;
}

export function loadRuns(surface) {
  return readJson(path.join(dirFor(surface), "runs.json"), []);
}
export function appendRun(surface, run) {
  const rows = loadRuns(surface);
  rows.push(run);
  writeJson(path.join(dirFor(surface), "runs.json"), rows.slice(-KEEP_RUNS));
  return run;
}
export function lastRun(surface) {
  const rows = loadRuns(surface);
  return rows.length ? rows[rows.length - 1] : null;
}

// --- circuit breaker (§15 / §27) ----------------------------------
//
//   state: "CLOSED" (normal) | "AUTO_SUSPENDED" (tripped)
//   A trip records `tripped_at` + `reason`. It is cleared ONLY by an
//   explicit owner resume (resumeCircuit). A timer alone NEVER clears a
//   provider-failure trip.
//
// Trip rule: >= threshold mutation/provider failures inside `windowMs`.

export const CIRCUIT_THRESHOLD = 3;
export const CIRCUIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function defaultCircuit(surface) {
  return { surface, state: "CLOSED", failures: [], tripped_at: null, reason: null, resumed_at: null, resumed_by: null };
}
export function loadCircuit(surface) {
  return readJson(path.join(dirFor(surface), "circuit.json"), defaultCircuit(surface));
}
export function saveCircuit(surface, c) {
  writeJson(path.join(dirFor(surface), "circuit.json"), c);
  return c;
}

// Pure: given a circuit + a new failure, return the next circuit.
export function recordFailure(circuit, { at = Date.now(), reason = "provider_failure", detail = "" } = {}, { threshold = CIRCUIT_THRESHOLD, windowMs = CIRCUIT_WINDOW_MS } = {}) {
  const c = { ...circuit, failures: [...(circuit.failures ?? [])] };
  c.failures.push({ at: new Date(at).toISOString(), reason, detail: String(detail).slice(0, 200) });
  // keep only the last window
  const cutoff = at - windowMs;
  c.failures = c.failures.filter((f) => Date.parse(f.at) >= cutoff);
  if (c.state === "CLOSED" && c.failures.length >= threshold) {
    c.state = "AUTO_SUSPENDED";
    c.tripped_at = new Date(at).toISOString();
    c.reason = `${c.failures.length} mutation failures within ${Math.round(windowMs / 3.6e6)}h`;
  }
  return c;
}

// A successful mutating run trims the failure window but NEVER un-trips a
// tripped circuit (owner resume only).
export function recordSuccess(circuit, { at = Date.now(), windowMs = CIRCUIT_WINDOW_MS } = {}) {
  const c = { ...circuit, failures: [] };
  return c; // state unchanged; a tripped circuit stays tripped
}

export function resumeCircuit(circuit, { by = "owner", at = Date.now() } = {}) {
  return { ...circuit, state: "CLOSED", failures: [], tripped_at: null, reason: null, resumed_at: new Date(at).toISOString(), resumed_by: by };
}

export function isTripped(circuit) {
  return circuit?.state === "AUTO_SUSPENDED";
}

// The effective mode after the circuit is considered: a tripped circuit
// forces "SUSPENDED" no matter what the posture said.
export function effectiveMode(postureMode, circuit) {
  if (isTripped(circuit)) return "SUSPENDED";
  return postureMode;
}

// --- digest send history (§24 / §25) - persisted so cron alone can
// never bypass the weekly cap or resend an identical digest.
export function loadDigestHistory() {
  return readJson(path.join(dirFor("email"), "digests.json"), []);
}
export function appendDigestSend(entry) {
  const rows = loadDigestHistory();
  rows.push({
    digest_id: entry.digest_id ?? `digest_${Date.now().toString(36)}`,
    fingerprint: entry.fingerprint ?? null,
    created_at: entry.created_at ?? new Date().toISOString(),
    sent_at: entry.sent_at ?? null,
    provider_refs: entry.provider_refs ?? [],
    recipient_count: entry.recipient_count ?? 0,
    deal_ids: entry.deal_ids ?? [],
    status: entry.status ?? "DRY_RUN", // DRY_RUN | SENT | CANCELLED | FAILED | UNCERTAIN
  });
  writeJson(path.join(dirFor("email"), "digests.json"), rows.slice(-KEEP_RUNS));
  return rows[rows.length - 1];
}
export function lastDigest() {
  const rows = loadDigestHistory();
  return rows.length ? rows[rows.length - 1] : null;
}

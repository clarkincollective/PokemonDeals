// sealed-enforcement-canary-2026-09-24.
//
// Browse-budget enforcement, switched on for the SEALED LEASE KEY ONLY.
// Global enforcement must not be enabled: the ledger's own hypothetical
// record for the window ending 2026-09-24 says it would grant sweep:EBAY_US
// 81 calls of the 1,091 it used - a 93% truncation of a production workload.
//
// sealed is the safe canary because it used 196 against a 200 cap every day
// of the measured week, and its recorded `wouldGrant` was 196.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const B = require(join(REPO, "lib", "browseBudget.js"));
const ROUTE = readFileSync(join(REPO, "app", "api", "refresh-sealed-deals", "route.js"), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/(^|[^:])\/\/.*/, "$1")).join("\n");

const OBS = { remaining: 4800, limit: 5000 };
const activeLedger = (used = {}) => {
  const win = B.windowFromObservation({ ...OBS, reset: new Date(Date.now() + 6 * 3.6e6).toISOString(), timeWindow: 86400, readAt: new Date().toISOString() }, Date.now());
  const l = B.emptyLedger(win);
  l.state = "active";
  Object.assign(l.used, used);
  return l;
};

test("SEC-1. enforcement is scoped to the sealed lease key alone", () => {
  const code = stripComments(ROUTE);
  // the mode is passed PER CALL, so the global BROWSE_BUDGET_MODE is not read
  assert.match(code, /key: "sealed"/);
  assert.match(code, /\{ mode: "enforce" \}/);
  // this route leases exactly one key, and names no other consumer
  const keys = [...code.matchAll(/key:\s*"([a-z:]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)], ["sealed"]);
  assert.doesNotMatch(code, /BROWSE_BUDGET_MODE/, "must not touch the global mode");
  assert.doesNotMatch(code, /CONSUMER_GROUP_CAPS|SWEEP_COUNTRY_CAPS|ALLOCATED_COUNTRY_CAPS/);
  // and a per-call mode really does bypass the global one
  const BB = stripComments(readFileSync(join(REPO, "lib", "browseBudget.js"), "utf8"));
  assert.match(BB, /mode = browseBudgetMode\(\) \}\)/, "mode is a defaulted parameter, so a supplied one wins");
});

test("SEC-2. rollback is immediate and needs no deploy", () => {
  const code = stripComments(ROUTE);
  assert.match(code, /process\.env\.SEALED_BROWSE_ENFORCE/);
  assert.match(code, /sealedEnforceDisabled \? \{\} : \{ mode: "enforce" \}/);
  // off / 0 / false all disable it, and disabling restores the global mode
  assert.match(code, /=== "off" \|\| .*=== "0" \|\| .*=== "false"/);
});

test("SEC-3. normal sealed scanning still receives its expected allocation", () => {
  // the historical shape: 196 products, one marketplace, 196 requested
  const d = B.evaluateGrant(activeLedger(), { key: "sealed", requested: 196, minGrant: 49, observation: OBS, now: Date.now() });
  assert.equal(d.granted, 196, "the full ask is granted - the canary is behaviourally neutral");
  assert.equal(d.binding, "requested");
  assert.equal(d.capLeft, 200);
  // one more product than the cap still gets the cap, never zero
  const d2 = B.evaluateGrant(activeLedger(), { key: "sealed", requested: 204, minGrant: 51, observation: OBS, now: Date.now() });
  assert.equal(d2.granted, 200);
});

test("SEC-4. a second full pass in the same window is denied at the cap", () => {
  const d = B.evaluateGrant(activeLedger({ sealed: 196 }), { key: "sealed", requested: 196, minGrant: 49, observation: OBS, now: Date.now() });
  assert.equal(d.granted, 0);
  assert.equal(d.denied, "cap");
  // the daily cron runs once, so this cannot bite it - it bounds a re-run
  const crons = JSON.parse(readFileSync(join(REPO, "vercel.json"), "utf8")).crons.filter((c) => /refresh-sealed-deals/.test(c.path));
  assert.equal(crons.length, 1, "one scheduled sealed run per day");
});

test("SEC-5. the first enforce window is born PENDING, so day one enforces nothing", () => {
  // enforceBirthState requires the PREVIOUS window to have carried an
  // enforce ledger. None has ever existed, so the first window is pending
  // and a pending window runs as observe - activation cannot surprise us.
  const BB = stripComments(readFileSync(join(REPO, "lib", "browseBudget.js"), "utf8"));
  assert.match(BB, /return \{ state: "pending", reason: "enforce_not_configured_in_previous_window", consumed \}/);
  assert.match(BB, /const effective = mode === "enforce" && ledger\.state === "active" \? "enforce" : "observe"/);
});

test("SEC-6. retries are accounted the same way under enforcement", () => {
  // every attempt draws one unit before it is sent, in every mode - the
  // enforcement change does not alter how a retry is counted
  const EBAY = readFileSync(join(REPO, "lib", "ebay.js"), "utf8");
  const fn = EBAY.slice(EBAY.indexOf("async function fetchWithRetry"), EBAY.indexOf("async function fetchWithRetry") + 1800);
  assert.match(fn, /if \(!consumeBrowseAttempt\(\)\)/);
  const TEL = stripComments(readFileSync(join(REPO, "lib", "ebayTelemetry.js"), "utf8"));
  assert.match(TEL, /if \(mode !== "enforce"\) \{\s*if \(lease\) lease\.attempts \+= 1;/);
});

test("SEC-7. no scheduler change, and the canary reports what a comparison needs", () => {
  const vercel = JSON.parse(readFileSync(join(REPO, "vercel.json"), "utf8"));
  const sealed = vercel.crons.filter((c) => /refresh-sealed-deals/.test(c.path));
  assert.deepEqual(sealed.map((c) => `${c.schedule} ${c.path}`), ["20 7 * * * /api/refresh-sealed-deals?country=EBAY_US"]);
  const code = stripComments(ROUTE);
  for (const field of ["requested", "granted", "effective", "binding", "denied", "capLeft", "killSwitch", "productsScanned", "productsSkipped", "errorCount", "completed"]) {
    assert.ok(code.includes(field), `canary telemetry is missing ${field}`);
  }
});

#!/usr/bin/env node
// A RATCHET over the scanner suite.
//
//   npm run test:ratchet          # fail on any NEW failure, or a fixed quarantine entry
//   npm run test:ratchet -- --update   # rewrite the quarantine from the current run
//
// WHY. On 2026-09-16 the scanner suite had 38 failing tests that had been
// failing long enough that nobody read the output any more. A suite with a
// permanently red tail gives no signal: a real regression looks exactly
// like the noise, and the only way to tell them apart was to stash the
// working tree and diff two full runs by hand. Three live bugs shipped
// that week behind exactly that blind spot.
//
// This does NOT hide anything and does not edit a single test. It runs the
// whole suite, then compares the failures against tests/known-failing.json:
//
//   * a failure NOT in the list  -> FAIL (a regression, named)
//   * a listed test that PASSES  -> FAIL (fix it, then drop it from the list)
//   * a listed test that fails   -> reported as a known failure, not fatal
//
// The second rule is what makes it a ratchet: the quarantine can only ever
// shrink, and the moment someone fixes one they are told to record it.
//
// The quarantine is a to-do list, not an amnesty. Every entry is a real
// signal someone must triage.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const LIST = "tests/known-failing.json";
const UPDATE = process.argv.includes("--update");

// node --test prints, for each failure, a "test at <file>:<line>:<col>"
// line immediately followed by the "✖ <name>" line. That pairing is the
// only place the file and the test name appear together, so it is what we
// key on - a name alone is ambiguous ("5." exists in several files).
function parseFailures(stdout) {
  const lines = stdout.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = /^test at (.+?):\d+:\d+$/.exec(lines[i].trim());
    if (!m) continue;
    const next = (lines[i + 1] ?? "").trim();
    if (!next.startsWith("✖")) continue;
    const name = next.slice(1).trim().replace(/ \([\d.]+ms\)$/, "");
    const file = m[1].replace(/\\/g, "/");
    const key = `${file}::${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file, test: name });
  }
  return out;
}

// Every test the run actually executed, so a quarantined entry that no
// longer fails can be told apart from one whose file was renamed or
// deleted (which is reported separately rather than silently passing).
function parseRanTests(stdout) {
  const ran = new Set();
  for (const line of stdout.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^[✔✖]\s+(.*?)(?: \([\d.]+ms\))?$/.exec(line.trim());
    if (m) ran.add(m[1]);
  }
  return ran;
}

function run() {
  return new Promise((resolve) => {
    // shell:false deliberately - through cmd.exe the glob reached node
    // mangled and the run produced no tests at all, which the ratchet then
    // read as "0 failing" (a green run that had tested nothing). node's own
    // --test glob expansion is the thing we want, so pass it straight.
    const child = spawn(process.execPath, ["--test", "tests/scanner/*.test.mjs"], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ out, code }));
  });
}

const { out } = await run();
const failures = parseFailures(out);
const ran = parseRanTests(out);

// A run that executed almost nothing must never read as "no new failures".
// That is exactly what happened the first time this script ran: the glob
// reached node mangled, zero tests executed, and the ratchet reported a
// clean bill of health. The floor is far below the real count (~3.5k) so
// it only ever catches a harness failure, never a legitimate change.
const MIN_EXPECTED_TESTS = 1000;
if (ran.size < MIN_EXPECTED_TESTS) {
  console.error(
    `ratchet: ABORT - only ${ran.size} tests were seen (expected at least ${MIN_EXPECTED_TESTS}).\n` +
      "The suite did not run properly; this is a harness failure, not a passing run."
  );
  console.error(out.slice(-2000));
  process.exit(2);
}

if (UPDATE) {
  const existing = JSON.parse(readFileSync(LIST, "utf8"));
  const tests = [...failures].sort((a, b) => a.file.localeCompare(b.file) || a.test.localeCompare(b.test));
  writeFileSync(LIST, JSON.stringify({ ...existing, _count: tests.length, tests }, null, 2) + "\n");
  console.log(`quarantine updated: ${tests.length} known-failing tests`);
  process.exit(0);
}

const known = JSON.parse(readFileSync(LIST, "utf8")).tests ?? [];
const knownKeys = new Set(known.map((k) => `${k.file}::${k.test}`));
const failKeys = new Set(failures.map((f) => `${f.file}::${f.test}`));

const regressions = failures.filter((f) => !knownKeys.has(`${f.file}::${f.test}`));
const fixed = known.filter((k) => !failKeys.has(`${k.file}::${k.test}`) && ran.has(k.test));
const missing = known.filter((k) => !failKeys.has(`${k.file}::${k.test}`) && !ran.has(k.test));

console.log(`scanner suite: ${failures.length} failing, ${known.length} quarantined`);

if (missing.length) {
  console.log(`\n${missing.length} quarantined test(s) did not run (renamed, moved or deleted):`);
  for (const m of missing) console.log(`  ? ${m.file}\n      ${m.test}`);
}

if (fixed.length) {
  console.log(`\n${fixed.length} quarantined test(s) now PASS - remove them from ${LIST}:`);
  for (const f of fixed) console.log(`  + ${f.file}\n      ${f.test}`);
}

if (regressions.length) {
  console.log(`\n${regressions.length} NEW failure(s):`);
  for (const r of regressions) console.log(`  x ${r.file}\n      ${r.test}`);
}

if (regressions.length || fixed.length) {
  console.log("\nratchet: FAIL");
  process.exit(1);
}
console.log("\nratchet: OK (no new failures; quarantine unchanged)");

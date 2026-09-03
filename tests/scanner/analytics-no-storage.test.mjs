// Phase 13A.1 - the analytics layer creates NO browser persistence.
//
// Hard rule: nothing under lib/analytics/ or components/analytics/ may
// use localStorage, sessionStorage, document.cookie, or IndexedDB - for
// any purpose. PostHog runs in true cookieless mode (persistence:
// "memory"); our helpers derive everything fresh from the current
// URL/referrer/navigator. In-memory module state is fine; device
// storage is not.
//
// Also asserts the removed Phase-13A keys are gone from the whole tree.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const name of entries) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.jsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const ANALYTICS_FILES = [...walk("lib/analytics"), ...walk("components/analytics")];
const STORAGE_RE = /\b(localStorage|sessionStorage|indexedDB|IndexedDB|webkitIndexedDB|mozIndexedDB)\b|document\s*\.\s*cookie|\bnavigator\s*\.\s*cookieEnabled\b/;

test("there is an analytics layer to check", () => {
  assert.ok(ANALYTICS_FILES.length >= 8, `expected the analytics files, found ${ANALYTICS_FILES.length}`);
});

test("no analytics file uses localStorage / sessionStorage / cookies / IndexedDB", () => {
  const offenders = [];
  for (const f of ANALYTICS_FILES) {
    const src = stripComments(read(f));
    const m = src.match(STORAGE_RE);
    if (m) offenders.push(`${f}  (${m[0]})`);
  }
  assert.deepEqual(offenders, [], `analytics code touches device storage:\n${offenders.join("\n")}`);
});

test("the removed Phase-13A storage keys appear nowhere in the tree", () => {
  const roots = ["app", "components", "lib", "tests"];
  const offenders = [];
  for (const r of roots) {
    for (const f of walk(r).concat(walk(r).length ? [] : [])) {
      const src = read(f);
      if (/pdf:firstSeen|pdf:attribution|pdf:lastOrigin/.test(src)) {
        // the ban itself is allowed to name them
        if (f.endsWith("analytics-no-storage.test.mjs")) continue;
        offenders.push(f);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("new_vs_returning is gone from the analytics contract, tests and specs", () => {
  const roots = ["app", "components", "lib", "tests"];
  const offenders = [];
  for (const r of roots) {
    for (const f of walk(r)) {
      if (f.endsWith("analytics-no-storage.test.mjs")) continue;
      if (/new_vs_returning|newVsReturning/.test(read(f))) offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [], `new_vs_returning still referenced: ${offenders.join(", ")}`);
});

test("session helper exports only storage-free primitives", () => {
  const src = read("lib/analytics/session.js");
  assert.match(src, /export function isDoNotTrackEnabled/);
  assert.match(src, /export function readLandingAttribution/);
  assert.match(src, /export function deviceClass/);
  assert.doesNotMatch(src, /export function (newVsReturning|resolveAttribution|setLastOrigin|readLastOrigin)/);
});

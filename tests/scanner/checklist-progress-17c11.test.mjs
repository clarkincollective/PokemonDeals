// Phase 17C.11 - collector checklist utility: pure view logic.
//
// The DOM behaviour (persistence across reload, missing-only, reset,
// keyboard, print) is verified in a browser and recorded in
// docs/collector-checklist-17c11.md - it is NOT asserted here, because a
// source scan cannot establish it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPLETION_SCOPE,
  DEVICE_SCOPE,
  isOwned,
  progressCounts,
  progressLabel,
  rowKey,
  visibleRows,
} from "../../lib/checklistProgress.js";
import { storageKey } from "../../lib/checklistStorage.js";

const row = (key, over = {}) => ({ key, number: "1/64", name: "Card", href: "/cards/x", rarity: "Rare", reference: null, ...over });
const ROWS = [row("a"), row("b"), row("c"), row("d")];

test("1. owned state attaches to the EXISTING row key, not a new id scheme", () => {
  assert.equal(rowKey({ key: "42382" }), "42382");
  assert.equal(rowKey({ key: "Dark Gengar|5/105" }), "Dark Gengar|5/105");
  assert.equal(rowKey({}), null);
  assert.equal(rowKey(null), null);
});

test("2. counts are over the rows actually listed", () => {
  assert.deepEqual(progressCounts(ROWS, ["a", "c"]), { total: 4, owned: 2, missing: 2 });
  assert.deepEqual(progressCounts(ROWS, []), { total: 4, owned: 0, missing: 4 });
  assert.deepEqual(progressCounts([], ["a"]), { total: 0, owned: 0, missing: 0 });
});

test("3. a stored key whose card is no longer listed cannot inflate progress", () => {
  const c = progressCounts(ROWS, ["a", "gone", "also-gone"]);
  assert.deepEqual(c, { total: 4, owned: 1, missing: 3 });
  assert.ok(c.owned <= c.total);
});

test("4. missing-only hides owned rows; the default view hides nothing", () => {
  assert.equal(visibleRows(ROWS, ["a", "b"], "missing").length, 2);
  assert.deepEqual(visibleRows(ROWS, ["a", "b"], "missing").map((r) => r.key), ["c", "d"]);
  assert.equal(visibleRows(ROWS, ["a", "b"], "all").length, 4);
  assert.equal(visibleRows(ROWS, ["a", "b"]).length, 4, "default is the full list");
});

test("5. a row without a key is never hidden by the missing-only view", () => {
  const rows = [...ROWS, { number: "x", name: "No key" }];
  assert.equal(visibleRows(rows, ["a", "b", "c", "d"], "missing").length, 1);
});

test("6. isOwned accepts an array or a Set", () => {
  assert.equal(isOwned(row("a"), ["a"]), true);
  assert.equal(isOwned(row("a"), new Set(["a"])), true);
  assert.equal(isOwned(row("z"), ["a"]), false);
});

test("7. the label counts ENTRIES and never implies set completion", () => {
  const l = progressLabel({ total: 113, owned: 12, missing: 101 });
  assert.equal(l, "12 of 113 entries marked owned · 101 still missing");
  assert.match(progressLabel({ total: 1, owned: 0, missing: 1 }), /1 entry/);
  assert.doesNotMatch(l, /%|complete set|set value|master set/i);
});

test("8. the scope sentence states what completion counts and excludes variants", () => {
  assert.match(COMPLETION_SCOPE, /entries in this checklist/i);
  assert.match(COMPLETION_SCOPE, /foil, edition, language or master-set variant/i);
  assert.match(COMPLETION_SCOPE, /not a valuation of the complete set/i);
});

test("9. progress is described as device-local, and promises no account or cross-device sync", () => {
  // The earlier version of this test used /account|sign in|sync/ and so
  // failed on the correct sentence "Not an account, and not synced
  // anywhere". What matters is the CLAIM, not the vocabulary: the copy
  // must scope progress to this device and must not offer an account or
  // syncing as a feature.
  assert.match(DEVICE_SCOPE, /on this device/i);
  assert.doesNotMatch(DEVICE_SCOPE, /\bsign in\b|\blog in\b|\byour account\b|\bcreate an account\b/i);
  assert.doesNotMatch(DEVICE_SCOPE, /synced across|syncs to|sync your|available on (all|your other)/i);
  assert.match(DEVICE_SCOPE, /\bnot\b[^.]*\baccount\b/i, "it says what it is NOT");
});

test("9b. a storage failure states progress is unsaved, never that it was saved", () => {
  const src = readFileSync(new URL("../../components/ChecklistTable.js", import.meta.url), "utf8");
  assert.match(src, /Progress isn't saved; it will be lost on reload\./);
  // the failure branch must not reuse the reassuring device-scope line
  const failBranch = src.slice(src.indexOf("persistFailed ?"), src.indexOf("persistFailed ?") + 160);
  assert.doesNotMatch(failBranch, /Saved on this device/);
});

test("9c. printed output states whether it is all entries or missing only", () => {
  const src = readFileSync(new URL("../../components/ChecklistTable.js", import.meta.url), "utf8");
  assert.match(src, /data-checklist-print-scope/);
  assert.match(src, /MISSING ENTRIES ONLY/);
  assert.match(src, /all \$\{counts\.total\} entries/);
});

test("10. storage is one key per set under the existing pdf: prefix", () => {
  assert.equal(storageKey("Neo Destiny"), "pdf:checklist:neo destiny");
  assert.notEqual(storageKey("Jungle"), storageKey("Neo Destiny"));
  assert.match(storageKey("Jungle"), /^pdf:/);
});

test("11. nothing here computes a price, total or set valuation", () => {
  const src = readFileSync(new URL("../../lib/checklistProgress.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /refPrice|market_price|reduce\(|\bsum\b|totalValue|setValue/i);
});

test("12. the full list is server-rendered: rows come from props, not a client fetch", () => {
  const table = readFileSync(new URL("../../components/ChecklistTable.js", import.meta.url), "utf8");
  // every row is rendered by React from the server-supplied `rows` prop
  assert.match(table, /shown\.map\(/);
  assert.doesNotMatch(table, /fetch\(|useEffect\([^)]*\bfetch\b/, "no client fetch builds the list");
  // links stay plain <a> via the shared cells, never next/link
  assert.doesNotMatch(table, /from "next\/link"/);
  const row = readFileSync(new URL("../../components/ChecklistRow.js", import.meta.url), "utf8");
  assert.match(row, /<a href=\{r\.href\}>\{r\.name\}<\/a>/);
  assert.doesNotMatch(row, /from "next\/link"/);
});

test("13. no personal progress or filter state is written to the URL", () => {
  const table = readFileSync(new URL("../../components/ChecklistTable.js", import.meta.url), "utf8");
  assert.doesNotMatch(table, /router\.(push|replace)|history\.(push|replace)State|searchParams\.set|window\.location\s*=/);
});

test("14. SpeciesChecklist keeps the 4-column layout (no Own column leaked into it)", () => {
  const species = readFileSync(new URL("../../components/SpeciesChecklist.js", import.meta.url), "utf8");
  assert.match(species, /CHECKLIST_TABLE_CLASS/);
  assert.doesNotMatch(species, /CHECKLIST_TABLE_CLASS_OWNED|ChecklistTable|data-owned-toggle/);
  // and it must not pull in the set checklist's client component
  assert.doesNotMatch(species, /from "@\/components\/SetChecklist"/);
});

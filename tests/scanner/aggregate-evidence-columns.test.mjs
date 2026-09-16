// The aggregate scans (the catalog_snapshot refresh and lib/deals' live
// fallback) filter rows through lib/dealQuality.savingsClaimTrusted, which
// reads the stored reference evidence. A scan that does not SELECT those
// columns fails every row of a tracked recent release silently: the set
// never becomes deal-backed, hub counts stay at zero. 30th Celebration hit
// exactly this on release day (60 active, eligible deals; set page
// rendered catalogue-only). These tests pin both scans to one column list
// and prove the filter's behaviour with and without the columns.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);

const EVIDENCE = [
  "card_set", "title", "card_tcgplayer_id", "is_graded", "grader", "grade", "condition",
  "reference_product_id", "reference_amount", "reference_currency", "reference_fx_rate", "reference_fx_asof",
  "reference_observed_at", "reference_condition", "reference_printing", "reference_grader", "reference_grade",
];

test("1. lib/deals SAVINGS_EVIDENCE_COLUMNS is exactly the evidence list, and both aggregate selects carry it", () => {
  const src = read("lib/deals.js");
  const m = src.match(/export const SAVINGS_EVIDENCE_COLUMNS =\s*\n\s*"([^"]+)";/);
  assert.ok(m, "SAVINGS_EVIDENCE_COLUMNS not found");
  assert.deepEqual(m[1].split(",").map((s) => s.trim()), EVIDENCE);
  assert.match(src, /const AGGREGATE_SELECT =\s*\n\s*`[^`]*\$\{OFFER_ELIGIBILITY_COLUMNS\}, \$\{SAVINGS_EVIDENCE_COLUMNS\}, watchlist/);
  assert.match(src, /const AGGREGATE_SELECT_LEGACY =\s*\n\s*`[^`]*\$\{OFFER_ELIGIBILITY_COLUMNS\}, \$\{SAVINGS_EVIDENCE_COLUMNS\}, watchlist/);
});

test("2. the snapshot refresh route selects every evidence column in both its selects", () => {
  const src = read("app/api/refresh-catalog/route.js");
  for (const name of ["SELECT", "SELECT_LEGACY"]) {
    const m = src.match(new RegExp(`const ${name} =\\s*\\n\\s*"([^"]+)"`));
    assert.ok(m, `${name} not found`);
    const cols = m[1].split(",").map((s) => s.trim().split(":")[0].trim());
    for (const c of EVIDENCE) assert.ok(cols.includes(c), `${name} is missing ${c}`);
    for (const c of ["disqualified_reason", "visual_authenticity_status", "visual_authenticity_reason", "market_price", "discount_pct"]) {
      assert.ok(cols.includes(c), `${name} lost ${c}`);
    }
  }
});

test("3. savingsClaimTrusted: a tracked-release row passes with its evidence and fails without the columns", () => {
  const { savingsClaimTrusted } = require("../../lib/dealQuality.js");
  // A raw, ungraded 30th Celebration listing with a matching reference
  // observed after the (worldwide) release day began.
  const full = {
    is_active: true,
    card_set: "ME: 30th Celebration",
    title: "Pokemon 30th Celebration Pikachu 023/128 NM",
    card_tcgplayer_id: "712934",
    is_graded: false, grader: null, grade: null,
    condition: "Near Mint",
    market_price: 20, discount_pct: 0.3,
    reference_product_id: "712934", reference_amount: 20, reference_currency: "USD",
    reference_fx_rate: null, reference_fx_asof: null,
    reference_observed_at: "2026-09-16T00:00:00Z",
    reference_condition: "Near Mint", reference_printing: "Holofoil",
    reference_grader: null, reference_grade: null,
  };
  assert.equal(savingsClaimTrusted(full), true, "evidenced row after release should count");
  // The same row as the old aggregate scan saw it: evidence columns absent.
  const stripped = Object.fromEntries(Object.entries(full).filter(([k]) => !EVIDENCE.includes(k) || k === "card_set"));
  assert.equal(savingsClaimTrusted(stripped), false, "without the evidence columns the row is (correctly) untrusted - which is why the scan must load them");
  // Evidence captured before the worldwide release day began never counts.
  assert.equal(savingsClaimTrusted({ ...full, reference_observed_at: "2026-09-15T13:59:59Z" }), false);
});

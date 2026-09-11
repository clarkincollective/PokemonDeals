// Phase 17C.3 - bounded set-checklist expansion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHECKLIST_SETS,
  isChecklistSet,
  checklistIdentityCheck,
  buildChecklistRows,
  checklistSummary,
  checklistLegend,
  SET_CHECKLIST_MAX_ROWS,
} from "../../lib/setChecklist.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const code = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let seq = 0;
const card = (over = {}) => {
  seq++;
  return {
    tcgplayerId: String(1000 + seq),
    name: `Card ${seq}`,
    displayName: `Card ${seq}`,
    set: "Jungle",
    cardNumber: `${String(seq).padStart(2, "0")}/64`,
    rarity: "Common",
    refPrice: 1.5,
    refCondition: null,
    refPrinting: null,
    hubSlug: null,
    catalogSlug: `card-${seq}-jungle`,
    ...over,
  };
};

test("C3-1. the allowlist is exactly Neo Destiny plus five reviewed sets - never 'every set'", () => {
  assert.deepEqual([...CHECKLIST_SETS], ["Neo Destiny", "Jungle", "Neo Genesis", "EX Deoxys", "Diamond and Pearl", "Boundaries Crossed"]);
  assert.equal(CHECKLIST_SETS.length, 6, "the pilot plus at most five");
  for (const s of ["Base Set", "Skyridge", "World Championship Decks", "Shining Fates: Shiny Vault", "SWSH: Sword & Shield Promo Cards", "Legendary Collection"]) {
    assert.equal(isChecklistSet(s), false, s);
  }
  assert.ok(Object.isFrozen(CHECKLIST_SETS));
});

test("C3-2. identity guard: clean set passes; duplicate / missing collector numbers, shared slugs and oversized sets fall back to the plain index", () => {
  const clean = [card(), card(), card()];
  assert.deepEqual(checklistIdentityCheck(clean), { ok: true, reason: null });
  const dupNumber = [card({ cardNumber: "07/64" }), card({ cardNumber: "07/64", name: "Other", catalogSlug: "other-jungle" })];
  assert.deepEqual(checklistIdentityCheck(dupNumber), { ok: false, reason: "duplicate_collector_number" });
  assert.equal(checklistIdentityCheck([card({ cardNumber: " 07/64 " }), card({ cardNumber: "07/64" })]).reason, "duplicate_collector_number", "whitespace variants are the same number");
  assert.equal(checklistIdentityCheck([card(), card({ cardNumber: null })]).reason, "missing_collector_number");
  assert.equal(checklistIdentityCheck([card(), card({ cardNumber: "  " })]).reason, "missing_collector_number");
  assert.equal(checklistIdentityCheck([card({ catalogSlug: "unown-jungle" }), card({ catalogSlug: "unown-jungle" })]).reason, "shared_card_slug");
  const big = Array.from({ length: SET_CHECKLIST_MAX_ROWS + 1 }, (_, i) => card({ cardNumber: `${i + 1}/999` }));
  assert.equal(checklistIdentityCheck(big).reason, "too_many_rows");
  assert.equal(checklistIdentityCheck([]).reason, "empty");
  assert.equal(checklistIdentityCheck([card({ catalogSlug: null }), card({ catalogSlug: null })]).ok, true, "rows without a catalogue page don't collide");
});

test("C3-3. duplicate collector numbers never break the table itself: both rows kept, stable order, unique keys", () => {
  const a = card({ tcgplayerId: "2", cardNumber: "07/64", name: "Nidoqueen", displayName: "Nidoqueen", catalogSlug: "nidoqueen-jungle" });
  const b = card({ tcgplayerId: "1", cardNumber: "07/64", name: "Nidoqueen (Holo)", displayName: "Nidoqueen (Holo)", catalogSlug: "nidoqueen-holo-jungle" });
  for (const order of [[a, b], [b, a]]) {
    const rows = buildChecklistRows(order);
    assert.deepEqual(rows.map((r) => r.name), ["Nidoqueen", "Nidoqueen (Holo)"], "same number -> name order, independent of input order");
    assert.equal(new Set(rows.map((r) => r.key)).size, 2);
  }
});

test("C3-4. mixed known / unknown conditions: per-row label only where recorded; legend says so without inventing provider behaviour", () => {
  const rows = buildChecklistRows([
    card({ refCondition: "Near Mint" }),
    card({ refCondition: "Lightly Played", refPrinting: "Unlimited" }),
    card({ refCondition: null }),
    card({ refPrice: null }),
  ]);
  assert.deepEqual(rows.map((r) => r.reference?.conditionLabel ?? null), ["Near Mint", "Lightly Played", null, null]);
  assert.equal(rows[1].reference.printing, "Unlimited");
  const s = checklistSummary(rows);
  assert.deepEqual({ priced: s.priced, unpriced: s.unpriced, stated: s.conditionStated, mixed: s.mixedOrUnstatedConditions }, { priced: 3, unpriced: 1, stated: 2, mixed: true });
  const legend = checklistLegend(s, rows);
  assert.equal(legend.condition, "A condition is shown where our catalogue has recorded it (2 of 3); where none is shown the condition is not recorded, so references are not like-for-like across cards.");
  assert.equal(legend.unpriced, "1 card has no reliable reference right now.");
});

test("C3-5. legend branches: all unrecorded, all one recorded condition, different recorded conditions, nothing priced", () => {
  const legendOf = (cards) => { const rows = buildChecklistRows(cards); return checklistLegend(checklistSummary(rows), rows); };
  assert.match(legendOf([card(), card()]).condition, /^Condition not recorded: our catalogue has not captured which condition these references are for yet/);
  assert.equal(legendOf([card({ refCondition: "Near Mint" }), card({ refCondition: "Near Mint" })]).condition, "Every reference here is for a Near Mint copy.");
  assert.match(legendOf([card({ refCondition: "Near Mint" }), card({ refCondition: "Damaged" })]).condition, /2 of 2\); where none is shown the condition is not recorded, so references are not like-for-like/);
  const none = legendOf([card({ refPrice: null }), card({ refPrice: 9999.99 })]);
  assert.equal(none.condition, "", "no condition claim when nothing is priced");
  assert.equal(none.unpriced, "2 cards have no reliable reference right now.");
  for (const l of [legendOf([card()]), legendOf([card({ refCondition: "Near Mint" }), card()])]) {
    assert.doesNotMatch(l.condition, /provider|stated|Near Mint copy/, "never says the provider lacks it, never generalises one condition");
  }
});

test("C3-6. missing prices stay explicit, and the card keeps its link when its exact page resolves", () => {
  const rows = buildChecklistRows([card({ refPrice: null }), card({ refPrice: 0 }), card({ refPrice: 999.99 }), card({ refPrice: 12 })]);
  assert.deepEqual(rows.map((r) => r.reference?.usd ?? null), [null, null, null, 12]);
  assert.deepEqual(rows.map((r) => Boolean(r.href)), [true, true, true, true]);
  assert.match(code("components/SetChecklist.js"), /<i>No reliable reference<\/i>/);
});

test("C3-8. REGRESSION (17C.3 link preservation): unlinked only when the destination is missing or ambiguous - never because a price is missing", () => {
  // unpriced + resolvable catalogue page -> linked (the art grid links it too)
  const [unpriced] = buildChecklistRows([card({ refPrice: null, catalogSlug: "marill-boundaries-crossed", name: "Marill", displayName: "Marill" })]);
  assert.equal(unpriced.href, "/cards/marill-boundaries-crossed");
  assert.equal(unpriced.reference, null, "still reads No reliable reference");
  // unpriced + live hub -> the hub
  const [hub] = buildChecklistRows([card({ refPrice: null, hubSlug: "marill-hub" })]);
  assert.equal(hub.href, "/cards/marill-hub");
  // missing destination: no hub and no resolvable catalogue page
  const [missing] = buildChecklistRows([card({ refPrice: 3, catalogSlug: null })]);
  assert.equal(missing.href, null);
  // ambiguous destination: two rows share one slug -> only the row the URL resolves to
  const rows = buildChecklistRows([
    card({ tcgplayerId: "900", cardNumber: "10/64", refPrice: null, catalogSlug: "shared-jungle", name: "Shared (A)", displayName: "Shared (A)" }),
    card({ tcgplayerId: "800", cardNumber: "11/64", refPrice: null, catalogSlug: "shared-jungle", name: "Shared (B)", displayName: "Shared (B)" }),
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.href]), [["Shared (A)", null], ["Shared (B)", "/cards/shared-jungle"]]);
  // the component still renders a plain name (no anchor) when href is null
  assert.match(code("components/SetChecklist.js"), /\{r\.href \? <a href=\{r\.href\}>\{r\.name\}<\/a> : r\.name\}/);
});

test("C3-7. the page and data wiring are unchanged apart from the allowlist + guard: same component, same heading id, art grid, URLs and metadata", () => {
  const deals = code("lib/deals.js");
  assert.match(deals, /const checklistCards =\s*isChecklistSet\(setName\) && checklistIdentityCheck\(cards\)\.ok \? cards : null;/);
  const page = code("app/sets/[slug]/page.js");
  assert.match(page, /<SetChecklist setName=\{resolved\.set\} cards=\{checklistCards\} headingId="full-set-index" \/>/);
  assert.match(page, /<CatalogueLinkIndex label=\{resolved\.set\} cards=\{catalogueIndexItems\} headingId="full-set-index" \/>/);
  assert.match(page, /<CatalogueBrowser/);
  assert.match(page, /const canonical = `\/sets\/\$\{slug\}`;/);
  assert.match(page, /export const revalidate = 3600;/);
  const comp = code("components/SetChecklist.js");
  assert.match(comp, /<table className=\{TABLE_CLASS\}>/);
  assert.match(comp, /<a href=\{r\.href\}>\{r\.name\}<\/a>/);
});

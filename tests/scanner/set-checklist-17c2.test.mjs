// Phase 17C.2 - set-page checklist pilot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHECKLIST_SETS,
  SET_CHECKLIST_MAX_ROWS,
  isChecklistSet,
  buildChecklistRows,
  checklistSummary,
  compareCollectorNumber,
} from "../../lib/setChecklist.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = (over = {}) => ({
  tcgplayerId: "1",
  name: "Dark Gengar",
  displayName: "Dark Gengar",
  set: "Neo Destiny",
  cardNumber: "006/105",
  rarity: "Holo Rare",
  refPrice: 1103,
  refCondition: null,
  refPrinting: null,
  hubSlug: null,
  catalogSlug: "dark-gengar-neo-destiny",
  ...over,
});

test("C2-1. the pilot set stays on the allowlist, bounded to a readable size", () => {
  assert.equal(CHECKLIST_SETS[0], "Neo Destiny");
  assert.equal(isChecklistSet("Neo Destiny"), true);
  assert.equal(isChecklistSet("Base Set"), false);
  assert.equal(SET_CHECKLIST_MAX_ROWS, 400);
});

test("C2-2. collector-number order, including secret rares past the printed total", () => {
  const rows = buildChecklistRows([
    card({ tcgplayerId: "a", cardNumber: "106/105", name: "Shining Charizard", catalogSlug: "shining-charizard-neo-destiny" }),
    card({ tcgplayerId: "b", cardNumber: "010/105", name: "Dark Houndoom", catalogSlug: "x-10" }),
    card({ tcgplayerId: "c", cardNumber: "002/105", name: "Dark Crobat", catalogSlug: "x-2" }),
    card({ tcgplayerId: "d", cardNumber: null, name: "No Number", catalogSlug: "x-n" }),
  ]);
  assert.deepEqual(rows.map((r) => r.number), ["002/105", "010/105", "106/105", null]);
  assert.ok(compareCollectorNumber({ cardNumber: "2" }, { cardNumber: "10" }) < 0, "numeric, not lexical");
});

test("C2-3. names link to the exact card's permanent page: hub first, else its resolvable catalogue page (priced or not)", () => {
  const [hub] = buildChecklistRows([card({ hubSlug: "dark-gengar-neo-destiny-hub" })]);
  assert.equal(hub.href, "/cards/dark-gengar-neo-destiny-hub");
  const [cat] = buildChecklistRows([card()]);
  assert.equal(cat.href, "/cards/dark-gengar-neo-destiny");
  // 17C.3 correction: an unpriced card's page still resolves (200,
  // noindex,follow) and the art grid already links it - keep the link
  const [unpriced] = buildChecklistRows([card({ refPrice: null })]);
  assert.equal(unpriced.href, "/cards/dark-gengar-neo-destiny");
  const [sentinel] = buildChecklistRows([card({ refPrice: 9999.99 })]);
  assert.equal(sentinel.href, "/cards/dark-gengar-neo-destiny");
  const [noPage] = buildChecklistRows([card({ catalogSlug: null })]);
  assert.equal(noPage.href, null);
  assert.equal(noPage.name, "Dark Gengar", "the card is still listed by name");
});

test("C2-4. two cards whose names slugify alike: only the one the URL resolves to (lowest tcgplayer id) is linked", () => {
  const rows = buildChecklistRows([
    card({ tcgplayerId: "205", name: "Unown (!)", displayName: "Unown (!)", cardNumber: "104/105", catalogSlug: "unown-neo-destiny" }),
    card({ tcgplayerId: "117", name: "Unown (?)", displayName: "Unown (?)", cardNumber: "105/105", catalogSlug: "unown-neo-destiny" }),
  ]);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.href]));
  assert.equal(byName["Unown (?)"], "/cards/unown-neo-destiny", "lowest id wins, as lib/cardSlug.pickCatalogMatch");
  assert.equal(byName["Unown (!)"], null, "never linked to a page that shows a different card");
});

test("C2-5. rarity is shown as recorded, never inferred", () => {
  const rows = buildChecklistRows([card({ rarity: "Secret Rare" }), card({ tcgplayerId: "2", catalogSlug: "b", rarity: null })]);
  assert.equal(rows[0].rarity, "Secret Rare");
  assert.equal(rows[1].rarity, null);
});

test("C2-6. reference: USD value; condition / printing only when recorded; unavailable is explicit", () => {
  const [unknown] = buildChecklistRows([card()]);
  assert.deepEqual(unknown.reference, { usd: 1103, conditionKnown: false, conditionLabel: null, printing: null });
  const [lp] = buildChecklistRows([card({ refCondition: "Lightly Played Unlimited Holofoil", refPrinting: "Unlimited Holofoil" })]);
  assert.deepEqual(lp.reference, { usd: 1103, conditionKnown: true, conditionLabel: "Lightly Played", printing: "Unlimited Holofoil" });
  const [nm] = buildChecklistRows([card({ refCondition: "Near Mint" })]);
  assert.equal(nm.reference.conditionLabel, "Near Mint");
  for (const p of [null, 0, -1, 999.99, "abc"]) {
    const [none] = buildChecklistRows([card({ refPrice: p, refCondition: "Near Mint" })]);
    assert.equal(none.reference, null, `price ${p} -> no reference (and no condition claim)`);
  }
});

test("C2-7. the summary counts cards and flags unstated / mixed conditions - it never totals prices", () => {
  const allUnknown = checklistSummary(buildChecklistRows([card(), card({ tcgplayerId: "2", catalogSlug: "b", refPrice: null })]));
  assert.deepEqual(allUnknown, { total: 2, linked: 2, priced: 1, unpriced: 1, rarityRecorded: 2, conditionStated: 0, mixedOrUnstatedConditions: true });
  const mixed = checklistSummary(buildChecklistRows([card({ refCondition: "Near Mint" }), card({ tcgplayerId: "2", catalogSlug: "b", refCondition: "Lightly Played" })]));
  assert.equal(mixed.mixedOrUnstatedConditions, true);
  const partial = checklistSummary(buildChecklistRows([card({ refCondition: "Near Mint" }), card({ tcgplayerId: "2", catalogSlug: "b" })]));
  assert.equal(partial.mixedOrUnstatedConditions, true, "one unstated reference makes the set not like-for-like");
  const allNm = checklistSummary(buildChecklistRows([card({ refCondition: "Near Mint" }), card({ tcgplayerId: "2", catalogSlug: "b", refCondition: "Near Mint" })]));
  assert.equal(allNm.mixedOrUnstatedConditions, false);
  for (const k of Object.keys(allNm)) assert.doesNotMatch(k, /sum|total_?value|value|average|mean|median/i, k === "total" ? "" : k);
});

test("C2-8. the component: semantic table, plain crawlable <a> links, no set total, explicit unavailable state", () => {
  // 17C.11 split the checklist into three files: SetChecklist (server:
  // heading, legend, rows), ChecklistRow (shared cells + column styling)
  // and ChecklistTable (client: the table with the owned column). The
  // BEHAVIOUR asserted here is unchanged; only where each piece lives is.
  const set = code("components/SetChecklist.js");
  const row = code("components/ChecklistRow.js");
  const table = code("components/ChecklistTable.js");
  const all = set + row + table;

  // semantic table with the original headers (an "Own" column is now first)
  assert.match(table, /<table className=\{CHECKLIST_TABLE_CLASS_OWNED\}>/);
  assert.match(table, /<th scope="col"[^>]*>No\.<\/th>/);
  assert.match(table, /<th scope="col">Card<\/th>/);
  assert.match(table, /Rarity<\/th>/);
  assert.match(table, /Market reference<\/th>/);
  // plain crawlable <a>, never next/link, in the shared cells
  assert.match(row, /<a href=\{r\.href\}>\{r\.name\}<\/a>/, "plain <a>, no next/link prefetch");
  assert.doesNotMatch(all, /from "next\/link"/);
  assert.match(row, /No reliable reference/);
  assert.match(set, /not a value for the complete set/);
  // the condition sentences come from lib/setChecklist.checklistLegend
  // (17C.3); NULL provenance = our catalogue has not captured the
  // condition - never the provider lacking it
  assert.match(set, /checklistLegend\(s, rows\)/);
  const lib = code("lib/setChecklist.js");
  assert.match(lib, /not like-for-like across cards/);
  assert.match(lib, /Condition not recorded: our catalogue has not captured which condition/);
  assert.match(lib, /where none is shown the condition is not recorded/);
  assert.doesNotMatch(all + lib, /provider does not state|provider states|was not stated/);
  assert.match(row, /currency: "USD"/);
  assert.doesNotMatch(all, /\.reduce\(|\bsum\b|totalValue|setValue/i, "nothing adds references up");
  // nothing crawlable is hidden: the only hidden things are the print-only
  // scope line (hidden on screen, shown in print) and the live-region
  // status - never a row, a name or a link.
  assert.doesNotMatch(row, /display:\s*none|aria-hidden|sr-only/, "row cells hide nothing");
  assert.doesNotMatch(table, /sr-only[^"]*"[^>]*>\{r\./, "no row content inside an sr-only element");
  // the ONLY breakpoint-hidden content is DUPLICATED content: a column
  // hidden below `sm` whose value is repeated in the Card cell's <small>,
  // which in turn hides from `sm` up - in BOTH class sets.
  // 4-column (species): rarity is col 3, its <small> copy in col 2.
  // 6-column (set, 17C.11: Own | Art | No. | Card | Rarity | Ref): rarity
  // is col 5 and - since the visual follow-up - the number is col 3; both
  // are repeated in col 4's <small> ("01/64 · Holo Rare") below `sm`.
  const hiddenRules = (row.match(/[^\s"]*:hidden(?![\w-])/g) ?? []).sort();
  assert.deepEqual(hiddenRules, [
    "[&_td:nth-child(3)]:hidden", "[&_th:nth-child(3)]:hidden", "sm:[&_td:nth-child(2)_small]:hidden",
    "[&_td:nth-child(3)]:hidden", "[&_th:nth-child(3)]:hidden",
    "[&_td:nth-child(5)]:hidden", "[&_th:nth-child(5)]:hidden", "sm:[&_td:nth-child(4)_small]:hidden",
  ].sort());
  // the number really is repeated where the column hides
  assert.match(row, /compact && r\.number \? `\$\{r\.number\} · ` : ""/);
  assert.match(table, /<ChecklistCells r=\{r\} compact \/>/);
  assert.match(row, /<td>\s*\{r\.href \? <a href=\{r\.href\}>\{r\.name\}<\/a> : r\.name\}/, "card names (and links) are never inside a hidden element");
  // rows come from the server-built `rows` prop; the client never fetches
  // or rebuilds the list, so the SSR HTML carries every link
  assert.match(set, /const rows = buildChecklistRows\(cards\)/);
  assert.match(table, /shown\.map\(/);
  assert.doesNotMatch(table, /fetch\(/);
});

test("C2-9. the page: pilot set swaps the plain index for the checklist; every other set keeps the index; routes/canonical/robots untouched", () => {
  const page = code("app/sets/[slug]/page.js");
  assert.match(page, /const checklistPilot = Array\.isArray\(checklistCards\) && checklistCards\.length > 0;/);
  assert.match(page, /\{checklistPilot \? \(\s*<SetChecklist setName=\{resolved\.set\} cards=\{checklistCards\} headingId="full-set-index" \/>\s*\) : \(\s*<CatalogueLinkIndex label=\{resolved\.set\} cards=\{catalogueIndexItems\} headingId="full-set-index" \/>\s*\)\}/);
  assert.match(page, /<CatalogueBrowser/, "the art grid (search / filter / sort) is kept");
  assert.match(page, /<SetPriceSummary/);
  assert.match(page, /alternates: \{ canonical \}/);
  assert.match(page, /const canonical = `\/sets\/\$\{slug\}`;/);
  assert.match(page, /export const revalidate = 3600;/);
  assert.doesNotMatch(page, /robots: \{ index: false[^}]*\}\s*\}\s*;?\s*\n\s*return \{\s*title,/, "no new noindex");
  const deals = code("lib/deals.js");
  assert.match(deals, /isChecklistSet\(setName\) && checklistIdentityCheck\(cards\)\.ok \? cards : null/);
  assert.match(deals, /if \(error && cols !== BASE_COLS && isMissingProvenanceColumnError\(error\)\)/);
});

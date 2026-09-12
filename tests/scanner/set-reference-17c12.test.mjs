// Phase 17C.12 - set-specific reference notes.
//
// The fixture is the three pilot sets' checklist rows (number / name /
// rarity) exactly as buildChecklistRows produced them from the catalogue on
// 2026-09-12. The rendered pages were verified in a browser separately;
// this suite pins the CONTRACT: facts come from rows, every claim is
// verified against rows, nothing renders for other sets, and no copy
// infers scarcity or value from a number.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSetReference, setNumberingFacts, SET_REFERENCE_SETS, GUIDE_NUMBER_HREF } from "../../lib/setReference.js";

const FIX = JSON.parse(readFileSync(new URL("../fixtures/checklist-rows-17c12.json", import.meta.url), "utf8"));
const code = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const textOf = (ref) => ref.items.map((i) => `${i.lead} ${i.text}`).join(" ");

test("R-1. numbering facts are derived from the rows, not typed in", () => {
  assert.deepEqual(
    (({ total, printedTotal, aboveTotal }) => ({ total, printedTotal, above: aboveTotal.map((r) => r.number) }))(setNumberingFacts(FIX.jungle)),
    { total: 64, printedTotal: 64, above: [] }
  );
  const nd = setNumberingFacts(FIX["neo-destiny"]);
  assert.equal(nd.total, 113); assert.equal(nd.printedTotal, 105);
  assert.deepEqual(nd.aboveTotal.map((r) => r.name), ["Shining Celebi", "Shining Charizard", "Shining Kabutops", "Shining Mewtwo", "Shining Noctowl", "Shining Raichu", "Shining Steelix", "Shining Tyranitar"]);
  const bc = setNumberingFacts(FIX["boundaries-crossed"]);
  assert.equal(bc.total, 153); assert.equal(bc.printedTotal, 149);
  assert.deepEqual(bc.aboveTotal.map((r) => `${r.name} ${r.number}`), ["Golurk 150/149", "Terrakion 151/149", "Altaria 152/149", "Rocky Helmet (Secret) 153/149"]);
  // two printed totals in one set = no single printed total
  assert.equal(setNumberingFacts([{ number: "1/64" }, { number: "2/105" }]).printedTotal, null);
});

test("R-2. Jungle: 64 of 64, and the holo 1-16 / non-holo 17-32 pairing is stated from the rows", () => {
  const r = buildSetReference("Jungle", FIX.jungle);
  assert.ok(r);
  assert.equal(r.total, 64); assert.equal(r.printedTotal, 64); assert.equal(r.aboveTotal, 0);
  assert.deepEqual(r.items.map((i) => i.id), ["numbering", "holo-pairs", "editions"]);
  const holo = r.items[1].text;
  assert.match(holo, /Numbers 1–16 are the holofoil rares/);
  assert.match(holo, /Clefable is 01\/64 \(Holo Rare\) and 17\/64 \(Rare\)/, "example comes from the rows");
  assert.match(r.items[2].text, /1st Edition and Unlimited/);
  assert.match(r.items[2].text, /without the Jungle set symbol/);
  assert.match(r.items[2].text, /does not say which one you hold/);
  // no link needed for Jungle (nothing above the total)
  assert.ok(r.items.every((i) => !i.link));
});

test("R-3. Neo Destiny: 113 entries numbered /105, the eight Shining Pokemon 106-113 named from the rows", () => {
  const r = buildSetReference("Neo Destiny", FIX["neo-destiny"]);
  assert.ok(r);
  assert.equal(r.total, 113); assert.equal(r.printedTotal, 105); assert.equal(r.aboveTotal, 8);
  const above = r.items.find((i) => i.id === "above-total");
  assert.match(above.lead, /^Numbered out of 105, but 113 entries$/);
  assert.match(above.text, /Shining Celebi 106\/105 to Shining Tyranitar 113\/105/);
  assert.equal(above.link.href, GUIDE_NUMBER_HREF);
  const pre = r.items.find((i) => i.id === "prefixes");
  assert.match(pre.text, /^46 of the 113 entries are Dark or Light Pokemon/);
  assert.match(pre.text, /Dark Wigglytuff 040\/105 and Light Wigglytuff 054\/105, or Dark Tyranitar 011\/105 and Shining Tyranitar 113\/105, are different entries/);
  assert.match(r.items.find((i) => i.id === "editions").text, /last English expansion printed with a 1st Edition stamp/);
});

test("R-4. Boundaries Crossed: 153 entries /149, secret 150-153, same-name pairs, Full Art pairs and ACE SPEC from the rows", () => {
  const r = buildSetReference("Boundaries Crossed", FIX["boundaries-crossed"]);
  assert.ok(r);
  assert.equal(r.total, 153); assert.equal(r.printedTotal, 149); assert.equal(r.aboveTotal, 4);
  const above = r.items.find((i) => i.id === "above-total");
  assert.match(above.text, /Golurk 150\/149, Terrakion 151\/149, Altaria 152\/149 and Rocky Helmet \(Secret\) 153\/149/);
  assert.match(above.text, /so the checklist has 153 entries/);
  assert.equal(above.link.href, GUIDE_NUMBER_HREF);
  const same = r.items.find((i) => i.id === "same-name");
  assert.match(same.text, /^6 names appear on two cards with different numbers: Psyduck is 32\/149 and 33\/149; Rocky Helmet is 133\/149 and, as a secret card, 153\/149\./);
  assert.match(same.text, /The nine Full Art cards, 141\/149 to 149\/149, are separate entries from the regular cards of the same name: Celebi EX 9\/149 and 141\/149\./);
  // the catalogue lists a regular Skyla (134) but no regular Bianca or
  // Cheren under those names, so the copy must not claim three Supporter pairs
  assert.doesNotMatch(same.text, /Supporter/);
  const ace = r.items.find((i) => i.id === "ace-spec");
  assert.match(ace.text, /Computer Search, Crystal Edge, Crystal Wall and Gold Potion \(137\/149 to 140\/149\)/);
  assert.match(ace.text, /"Rare Ace"/);
});

test("R-5. a claim that no longer matches the rows withholds the WHOLE block", () => {
  const nd = FIX["neo-destiny"];
  // renamed secret rare -> the "Shining" claim fails
  assert.equal(buildSetReference("Neo Destiny", nd.map((r) => (r.number === "113/105" ? { ...r, name: "Tyranitar" } : r))), null);
  // one secret rare missing -> count claim fails
  assert.equal(buildSetReference("Neo Destiny", nd.filter((r) => r.number !== "110/105")), null);
  // Jungle: a broken holo/non-holo pair fails
  assert.equal(buildSetReference("Jungle", FIX.jungle.map((r) => (r.number === "22/64" ? { ...r, name: "Mr. Mime (error)" } : r))), null);
  // Boundaries Crossed: an ACE SPEC recorded with another rarity fails
  assert.equal(buildSetReference("Boundaries Crossed", FIX["boundaries-crossed"].map((r) => (r.number === "138/149" ? { ...r, rarity: "Uncommon" } : r))), null);
  // Boundaries Crossed: a Full Art row renamed fails the 141-149 claim
  assert.equal(buildSetReference("Boundaries Crossed", FIX["boundaries-crossed"].map((r) => (r.number === "147/149" ? { ...r, name: "Bianca" } : r))), null);
  // empty rows
  assert.equal(buildSetReference("Jungle", []), null);
});

test("R-6. non-pilot sets render nothing - no generic copy is generated", () => {
  assert.deepEqual([...SET_REFERENCE_SETS], ["Jungle", "Neo Destiny", "Boundaries Crossed"]);
  assert.equal(buildSetReference("Fossil", FIX.jungle), null);
  assert.equal(buildSetReference("Neo Genesis", FIX["neo-destiny"]), null);
  assert.equal(buildSetReference("", FIX.jungle), null);
});

test("R-7. copy never infers scarcity, value or completeness from a number", () => {
  const all = ["Jungle", "Neo Destiny", "Boundaries Crossed"]
    .map((s, i) => textOf(buildSetReference(s, FIX[["jungle", "neo-destiny", "boundaries-crossed"][i]])))
    .join(" ");
  // ("Holo Rare" / "Rare" are the catalogue's recorded rarity labels and
  // may be quoted; what is banned is inferring scarcity or value from them)
  assert.doesNotMatch(all, /\b(scarc\w*|valuable|worth|invest\w*|premium|chase|hard(er)? to find|sought[- ]after|price[sd]? (rise|drop)|master set|complete set)\b/i);
  assert.doesNotMatch(all, /\$\d/);
  // it does not restate the progress tool's own scope sentence
  assert.doesNotMatch(all, /Completion counts the entries|Saved on this device/);
  // catalogue rows are never called the printed set
  assert.doesNotMatch(all, /every card ever printed|complete checklist of the set/i);
});

test("R-9. provenance: row-derived facts are separated from externally sourced claims, each with its source URL", () => {
  const lib = code("lib/setReference.js");
  assert.match(lib, /A\. ROW-DERIVED/);
  assert.match(lib, /B\. EXTERNALLY SOURCED[\s\S]*NOT validated by the render-time checks/);
  for (const url of [
    "https://bulbapedia.bulbagarden.net/wiki/Jungle_(TCG)",
    "https://bulbapedia.bulbagarden.net/wiki/Neo_Destiny_(TCG)",
    "https://bulbapedia.bulbagarden.net/wiki/Boundaries_Crossed_(TCG)",
  ]) assert.ok(lib.includes(url), `source recorded: ${url}`);
  // the Bianca / Cheren observation is recorded as an observation, not a defect
  // the sentence wraps across comment lines, so allow "//" between words
  assert.match(lib, /A(\s|\/\/)+Full Art card does not establish that a regular counterpart belongs to(\s|\/\/)+the same set/);
  assert.match(lib, /NOT recorded as a catalogue defect/);
});

test("R-8. wiring: server-rendered inside SetChecklist above the table, hidden in print, pilot-gated in the component", () => {
  const set = code("components/SetChecklist.js");
  assert.match(set, /import SetReferenceNotes from "@\/components\/SetReferenceNotes"/);
  const notesAt = set.indexOf("<SetReferenceNotes setName={setName} rows={rows} />");
  const tableAt = set.indexOf("<ChecklistTable\n", notesAt); // the JSX element, not the header comment's "<ChecklistTable>"
  assert.ok(notesAt > 0 && tableAt > notesAt, "notes sit between the legend and the table");
  const comp = code("components/SetReferenceNotes.js");
  assert.doesNotMatch(comp, /"use client"/, "server component");
  assert.match(comp, /if \(!ref\) return null;/);
  assert.match(comp, /data-print-hide/);
  assert.match(comp, /print:hidden/);
  // compact on every viewport with no client JS: a native <details> whose
  // summary already carries the three leads; the full text sits in the HTML
  assert.match(comp, /<details[\s\S]*<summary[\s\S]*\{item\.lead\}[\s\S]*<\/summary>[\s\S]*<dl[\s\S]*\{item\.text\}/);
  assert.match(comp, /lg:grid-cols-3/, "one row of three on desktop when opened");
  assert.match(comp, /href=\{item\.link\.href\}/);
  // the page contract from 17C.3 is untouched
  const page = code("app/sets/[slug]/page.js");
  assert.match(page, /<SetChecklist setName=\{resolved\.set\} cards=\{checklistCards\} headingId="full-set-index" \/>/);
  assert.doesNotMatch(page, /SetReferenceNotes/);
});

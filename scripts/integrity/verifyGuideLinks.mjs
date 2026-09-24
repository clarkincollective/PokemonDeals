#!/usr/bin/env node
// GUIDE-LINK VERIFICATION. READ-ONLY. No write, no provider call.
//
//   node scripts/integrity/verifyGuideLinks.mjs
//   node scripts/integrity/verifyGuideLinks.mjs --json
//
// Re-reads every lib/guideLinks entry against the catalogue it claims to
// describe, and re-derives each href from the row's OWN stored name.
//
// WHY THIS EXISTS. tests/scanner/guide-card-links pins the registry
// against a VERIFIED table checked into the test file. That catches
// drift in the registry, but it cannot catch the table itself being
// wrong - and on 2026-09-23 an external audit found exactly that: two
// 30th Celebration entries carried the bare names "Mew ex" / "Mewtwo ex"
// where the catalogue stores "Mew ex - 158/128" / "Mewtwo ex - 157/128".
// href is derived from the name, so both derived to URLs that returned
// 404, and 18 anchors across six guides pointed at them. The test passed
// throughout, because the expectation held the same wrong names.
//
// A verification table only verifies if it came from the source. This
// script is how it gets re-read. Run it whenever entries are added, and
// after any catalogue re-sync that could rename a record.
//
// Exit code 1 if anything mismatches, so it can gate a release check.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { GUIDE_CARDS, GUIDE_PRODUCTS, GUIDE_SETS, sealedProductHref } from "../../lib/guideLinks.js";
import { catalogCardSlug } from "../../lib/cardSlug.js";
import { slugifySet } from "../../lib/slugify.js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const JSON_OUT = process.argv.includes("--json");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const problems = [];
const say = (s) => { if (!JSON_OUT) console.log(s); };

// --- cards ---------------------------------------------------------------
const cardKeys = Object.keys(GUIDE_CARDS);
const ids = [...new Set(cardKeys.map((k) => Number(GUIDE_CARDS[k].tcgplayerId)))].filter(Number.isFinite);
const rows = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await db
    .from("card_catalog")
    .select("tcgplayer_id,name,set,card_number")
    .in("tcgplayer_id", ids.slice(i, i + 200));
  if (error) throw new Error(`card_catalog: ${error.message}`);
  for (const r of data ?? []) rows.set(String(r.tcgplayer_id), r);
}

for (const k of cardKeys) {
  const c = GUIDE_CARDS[k];
  const r = rows.get(String(c.tcgplayerId));
  if (!r) { problems.push({ kind: "card", key: k, issue: "no catalogue row", id: c.tcgplayerId }); continue; }
  const href = `/cards/${catalogCardSlug(r.name, r.set)}`;
  if (r.name !== c.name) problems.push({ kind: "card", key: k, issue: "name", registry: c.name, catalogue: r.name });
  if (r.set !== c.set) problems.push({ kind: "card", key: k, issue: "set", registry: c.set, catalogue: r.set });
  if (r.card_number !== c.cardNumber) problems.push({ kind: "card", key: k, issue: "cardNumber", registry: c.cardNumber, catalogue: r.card_number });
  // The one that actually broke: a derived href that does not match what
  // the catalogue's own name derives to is a 404 waiting to be linked.
  if (href !== c.href) problems.push({ kind: "card", key: k, issue: "href", registry: c.href, derived: href });
}

// Two entries resolving to one page means one of them names the wrong
// record - the catalogue has no two cards at one slug.
const byHref = {};
for (const k of cardKeys) (byHref[GUIDE_CARDS[k].href] ??= []).push(k);
for (const [href, keys] of Object.entries(byHref)) {
  if (keys.length > 1) problems.push({ kind: "card", key: keys.join(" + "), issue: "duplicate href", href });
}

// --- sealed products -----------------------------------------------------
const pKeys = Object.keys(GUIDE_PRODUCTS);
const pIds = [...new Set(pKeys.map((k) => Number(GUIDE_PRODUCTS[k].tcgplayerId)))].filter(Number.isFinite);
const pRows = new Map();
for (let i = 0; i < pIds.length; i += 200) {
  const { data, error } = await db
    .from("sealed_catalog")
    .select("tcgplayer_id,name,set,product_type")
    .in("tcgplayer_id", pIds.slice(i, i + 200));
  if (error) throw new Error(`sealed_catalog: ${error.message}`);
  for (const r of data ?? []) pRows.set(String(r.tcgplayer_id), r);
}
for (const k of pKeys) {
  const p = GUIDE_PRODUCTS[k];
  const r = pRows.get(String(p.tcgplayerId));
  if (!r) { problems.push({ kind: "product", key: k, issue: "no sealed_catalog row", id: p.tcgplayerId }); continue; }
  if (r.name !== p.name) problems.push({ kind: "product", key: k, issue: "name", registry: p.name, catalogue: r.name });
  if (r.set !== p.set) problems.push({ kind: "product", key: k, issue: "set", registry: p.set, catalogue: r.set });
  if (r.product_type !== p.productType) problems.push({ kind: "product", key: k, issue: "productType", registry: p.productType, catalogue: r.product_type });
  // FINDING 4. The same check the cards already get: re-derive the href
  // from the row's OWN catalogue id and require the registry to agree. Until
  // 2026-09-25 every product href was the bare "/sealed-deals", so a reader
  // who clicked a named product landed on the whole catalogue - a defect no
  // amount of name/set checking could have caught, because the identity was
  // correct and simply not used.
  const href = sealedProductHref(r.tcgplayer_id);
  if (href !== p.href) problems.push({ kind: "product", key: k, issue: "href", registry: p.href, derived: href });
  // A destination that selects nothing is worse than a generic one: it
  // would render "no such product" for a product we know exists.
  if (!/[?&]product=\d+$/.test(p.href)) problems.push({ kind: "product", key: k, issue: "href selects no product", registry: p.href });
}

// Two products resolving to one destination means one of them names the
// wrong record - the standard and Pokemon Center editions are different ids.
const byProductHref = {};
for (const k of pKeys) (byProductHref[GUIDE_PRODUCTS[k].href] ??= []).push(k);
for (const [href, keys] of Object.entries(byProductHref)) {
  if (keys.length > 1) problems.push({ kind: "product", key: keys.join(" + "), issue: "duplicate href", href });
}

// --- sets ----------------------------------------------------------------
for (const [k, v] of Object.entries(GUIDE_SETS)) {
  const expect = `/sets/${slugifySet(v.name)}`;
  if (v.href !== expect) problems.push({ kind: "set", key: k, issue: "href", registry: v.href, derived: expect });
}

const summary = {
  checkedAt: new Date().toISOString(),
  cards: cardKeys.length,
  products: pKeys.length,
  sets: Object.keys(GUIDE_SETS).length,
  problems: problems.length,
};

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ ...summary, detail: problems }, null, 2) + "\n");
} else {
  say(`guide-link verification  ${summary.checkedAt}`);
  say(`  cards ${summary.cards}   products ${summary.products}   sets ${summary.sets}`);
  if (!problems.length) {
    say(`  OK - every entry matches the catalogue and every href is derivable from its stored name`);
  } else {
    say(`  ${problems.length} PROBLEM(S):`);
    for (const p of problems) say(`    [${p.kind}] ${p.key}: ${p.issue} ${JSON.stringify({ ...p, kind: undefined, key: undefined, issue: undefined })}`);
  }
}
process.exit(problems.length ? 1 : 0);

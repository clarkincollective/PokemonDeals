#!/usr/bin/env node
// Correct deal rows whose stored market reference is implausible against
// the catalogue's own reference for the SAME product id.
//
//   npm run deals:fix-references            # report only, writes nothing
//   npm run deals:fix-references -- --apply # correct the rows
//
// Why this exists: a deal row's market_price is the reference captured at
// scan time; card_catalog.market_price is the provider's current figure
// for the same tcgplayer id. They should agree closely. A sweep on
// 16 Sep 2026 found rows where they did not - Lugia BREAK stored at $975
// against a $48 catalogue figure, seven Psyduck rows at $82 against $16 -
// each one rendering a large, false "% below market".
//
// What it does: replaces the implausible stored reference with the
// catalogue's figure and recomputes discount_pct from it. It does NOT
// hide or disqualify anything. A row whose corrected discount is no
// longer positive simply renders as a plain listing (price, shipping,
// notes) - it stays on the site, in the feed and in the hub counts.
//
// Safe to re-run: it only ever touches rows that are currently
// implausible, and it is idempotent once they are corrected.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const require = createRequire(import.meta.url);
const { referenceIsPlausible, REFERENCE_HIGH_RATIO_CEILING } = require("../lib/dealQuality.js");

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

async function main() {
  // Every active, unheld row that carries a reference and a comparable price.
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("deals")
      .select("id, card_tcgplayer_id, market_price, discount_pct, total_price_usd, title, card_set")
      .eq("is_active", true)
      .is("disqualified_reason", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`deals read failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  const usable = rows.filter(
    (r) => Number(r.market_price) > 0 && Number(r.total_price_usd) > 0 && r.card_tcgplayer_id
  );
  console.error(`active unheld rows: ${rows.length} | with a reference and a USD price: ${usable.length}`);

  // The catalogue's own figure per product id.
  const ids = [...new Set(usable.map((r) => String(r.card_tcgplayer_id)))];
  const anchor = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db
      .from("card_catalog")
      .select("tcgplayer_id, market_price, name, set")
      .in("tcgplayer_id", ids.slice(i, i + 300));
    if (error) throw new Error(`card_catalog read failed: ${error.message}`);
    for (const c of data ?? []) anchor.set(String(c.tcgplayer_id), c);
  }

  const bad = [];
  for (const r of usable) {
    const c = anchor.get(String(r.card_tcgplayer_id));
    if (!c || !(Number(c.market_price) > 0)) continue; // no anchor -> leave alone
    if (referenceIsPlausible({ storedReference: r.market_price, catalogueReference: c.market_price })) continue;
    const corrected = Number(c.market_price);
    const discount = 1 - Number(r.total_price_usd) / corrected;
    bad.push({
      id: r.id,
      name: c.name,
      set: c.set,
      was: Number(r.market_price),
      now: corrected,
      ratio: +(Number(r.market_price) / corrected).toFixed(1),
      shownWas: Math.round(Number(r.discount_pct) * 100),
      shownNow: discount > 0 ? Math.round(discount * 100) : null,
      discount,
    });
  }

  console.error(`\nimplausible (>= ${REFERENCE_HIGH_RATIO_CEILING}x the catalogue figure): ${bad.length}`);
  for (const b of bad.sort((x, y) => y.ratio - x.ratio)) {
    console.error(
      `  x${String(b.ratio).padEnd(5)} id=${String(b.id).padEnd(6)} ${String(b.name).slice(0, 26).padEnd(26)} ` +
        `$${Math.round(b.was)} -> $${Math.round(b.now)}   shown ${b.shownWas}% -> ${b.shownNow == null ? "plain listing" : b.shownNow + "%"}`
    );
  }
  const stillDeals = bad.filter((b) => b.shownNow != null).length;
  console.error(`\nafter correction: ${stillDeals} still show a saving, ${bad.length - stillDeals} render as plain listings.`);
  console.error("None are hidden, disqualified or removed from any feed or count.");

  if (!APPLY) {
    console.error("\n--apply not given: nothing written.");
    return;
  }
  let ok = 0;
  for (const b of bad) {
    const { error } = await db
      .from("deals")
      .update({ market_price: b.now, discount_pct: b.discount })
      .eq("id", b.id);
    if (error) console.error(`  id=${b.id} UPDATE FAILED: ${error.message}`);
    else ok++;
  }
  console.error(`\ncorrected ${ok}/${bad.length} rows.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

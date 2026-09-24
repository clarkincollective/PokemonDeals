// sealed-matcher-delta-2026-09-24 - STAGE 4 harness. READ-ONLY.
//
//   node scripts/remediation/sealedMatcherDelta.mjs --freeze=<file>        # capture baseline decisions
//   node scripts/remediation/sealedMatcherDelta.mjs --compare=<file>       # diff current matcher vs that baseline
//
// Captures, for EVERY sealed_deals row, the decision the shipped matcher
// makes today plus every display gate outcome. Re-run after a candidate
// matcher edit to get an exact per-row delta. No write of any kind.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { sealedListingDecision, productKindOfTitle, productKindOfProduct, editionOfTitle, isMultiUnitLot } from "../../lib/sealedProductMatch.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const Q = require(join(REPO, "lib", "dealQuality.js"));

const productOf = (p) => (p?.name ? { name: p.name, set: p.set ?? null, productType: null } : null);

export function decideAll(rows, now = Date.now()) {
  return rows.map((r) => {
    const prod = productOf(r.sealed_watchlist);
    const d = prod ? sealedListingDecision(r.title ?? "", prod) : { ok: false, reason: "product_row_missing" };
    return {
      dealId: r.id,
      title: r.title,
      isActive: r.is_active === true,
      disqualifiedReason: r.disqualified_reason ?? null,
      productId: r.sealed_watchlist_id,
      productName: r.sealed_watchlist?.name ?? null,
      productSet: r.sealed_watchlist?.set ?? null,
      marketplace: r.marketplace,
      imageUrl: r.image_url ?? null,
      listingUrl: r.listing_url ?? null,
      ok: d.ok,
      reason: d.ok ? null : d.reason,
      titleKind: productKindOfTitle(r.title ?? ""),
      productKind: prod ? productKindOfProduct(prod) : null,
      titleEdition: editionOfTitle(r.title ?? ""),
      lot: isMultiUnitLot(r.title ?? ""),
      displayable: Q.isDisplayableSealedDeal(r, now),
      claims: Q.savingsClaimTrusted(r, now),
    };
  });
}

async function readAll(db) {
  const out = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db
      .from("sealed_deals")
      .select("*, sealed_watchlist:sealed_watchlist_id (id,name,set,tcgplayer_id)")
      .order("id")
      .range(f, f + 999);
    if (error) throw new Error(`sealed_deals: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const rows = await readAll(db);
  const decided = decideAll(rows);

  const freeze = arg("freeze");
  if (freeze) {
    if (existsSync(freeze)) throw new Error(`${freeze} exists; refusing to overwrite a baseline`);
    writeFileSync(freeze, JSON.stringify({ capturedAt: new Date().toISOString(), rows: decided }, null, 1));
    const byReason = {};
    for (const d of decided) if (!d.ok) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
    console.log(`baseline captured: ${decided.length} rows`);
    console.log(`  accepted by the identity rule : ${decided.filter((d) => d.ok).length}`);
    console.log(`  displayable                   : ${decided.filter((d) => d.displayable).length}`);
    console.log(`  refused, by reason:`);
    for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${r}`);
    console.log(`\nfrozen -> ${freeze}`);
    console.log("READ-ONLY: no row was updated, inserted or deleted.");
    return;
  }

  const cmp = arg("compare");
  if (!cmp) throw new Error("pass --freeze=<file> or --compare=<file>");
  const base = JSON.parse(readFileSync(cmp, "utf8"));
  const before = new Map(base.rows.map((d) => [d.dealId, d]));
  const changed = [];
  for (const now of decided) {
    const was = before.get(now.dealId);
    if (!was) { changed.push({ kind: "new_row", now }); continue; }
    if (was.ok === now.ok && was.reason === now.reason && was.displayable === now.displayable) continue;
    let kind;
    if (!was.ok && now.ok) kind = now.displayable && !was.displayable ? "newly_accepted_and_now_visible" : "newly_accepted_still_hidden";
    else if (was.ok && !now.ok) kind = was.displayable && !now.displayable ? "REGRESSION_was_visible_now_hidden" : "newly_rejected_was_already_hidden";
    else kind = "reason_changed_only";
    changed.push({ kind, dealId: now.dealId, title: now.title, productName: now.productName, marketplace: now.marketplace, imageUrl: now.imageUrl, listingUrl: now.listingUrl, before: { ok: was.ok, reason: was.reason, displayable: was.displayable, titleKind: was.titleKind }, after: { ok: now.ok, reason: now.reason, displayable: now.displayable, titleKind: now.titleKind } });
  }

  console.log(`baseline ${base.capturedAt}   rows ${base.rows.length} -> ${decided.length}`);
  console.log(`accepted ${base.rows.filter((d) => d.ok).length} -> ${decided.filter((d) => d.ok).length}`);
  console.log(`displayable ${base.rows.filter((d) => d.displayable).length} -> ${decided.filter((d) => d.displayable).length}`);
  console.log(`\nrows whose decision changed: ${changed.length}`);
  const byKind = {};
  for (const c of changed) (byKind[c.kind] ??= []).push(c);
  for (const [k, list] of Object.entries(byKind).sort()) {
    console.log(`\n=== ${k} (${list.length}) ===`);
    for (const c of list) {
      console.log(`  #${String(c.dealId).padStart(5)}  ${c.before.reason ?? "accepted"} -> ${c.after.reason ?? "accepted"}   visible ${c.before.displayable} -> ${c.after.displayable}`);
      console.log(`        product: ${c.productName}`);
      console.log(`        ${c.title}`);
      if (c.after.displayable && !c.before.displayable) console.log(`        IMAGE: ${c.imageUrl}`);
    }
  }
  if (!changed.length) console.log("  (no change)");
  console.log("\nREAD-ONLY: no row was updated, inserted or deleted.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

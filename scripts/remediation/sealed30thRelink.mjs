// sealed-30th-relink-2026-09-24 - STAGE 1 of the unresolved-cohort
// remediation: 2026 "30th Celebration" ETB listings that are bound to the
// 2021 Celebrations product (242811).
//
//   node scripts/remediation/sealed30thRelink.mjs                                  # dry run (read-only, default)
//   node scripts/remediation/sealed30thRelink.mjs --manifest-out=<f>               # dry run + manifest
//   node scripts/remediation/sealed30thRelink.mjs --apply --confirm=N --prior-out=<f> [--only=1,2,3]
//   node scripts/remediation/sealed30thRelink.mjs --rollback=<prior file> --confirm=N
//
// THE DESTINATION IS PROVED, NOT ASSUMED. For every candidate row the
// script runs the SHIPPED matcher against EVERY ACTIVE WATCHED PRODUCT:
// lib/dealMatching.listingMatchesSealedProduct for the name/set tokens
// (via sealedNameMatch, so the scoped 30th alias applies exactly as it
// does at ingestion), then lib/sealedProductMatch.sealedListingDecision
// for the identity decision. A row is a DETERMINISTIC candidate only when
// exactly ONE active watched product accepts its title. Zero acceptors, or
// more than one, is manual review - never a guess, and never "the obvious
// one" because the cohort pattern is strong.
//
// THE COMPARISON IS NOT CARRIED ACROSS. A relink changes which product the
// row is priced against, which invalidates the old product's market price,
// discount and reference outright (the same rule lib/sealedIngest
// .reassignmentReset applies at ingestion). This script therefore rewrites
// the comparison columns in the same write:
//
//   market_price    the DESTINATION product's own sealed_catalog reference,
//                   copied verbatim. A lookup, not a computation, and not
//                   the old product's figure. The column is NOT NULL in the
//                   live schema (a canary on 2026-09-24 proved this by
//                   failing closed with 0 rows written), so it cannot simply
//                   be emptied. A destination with no catalogue reference is
//                   therefore not a deterministic candidate at all.
//   discount_pct    0. This column is NOT NULL too (a second canary proved
//                   it, again with 0 rows written), so "unknown" cannot be
//                   encoded as NULL. 0 is the encoding of NO DISCOUNT
//                   ASSERTED, not a fallback discount: hasPositiveComparison
//                   requires pct > 0, so a 0 row can make no savings claim,
//                   cannot enter a discount-ranked view and cannot enter the
//                   sitemap. No discount is DERIVED here - pricing is the
//                   scanner's job, and it rewrites this column from the
//                   destination product's own reference on its next pass.
//   reference_*     cleared. The old product's evidence can never describe
//                   the new one.
//
// Belt and braces: every savings surface gates on
// listingPresentation().savings === "trusted", which needs reference
// evidence, so a relinked row renders as a plain listing regardless.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { sealedListingDecision, sealedNameMatch } from "../../lib/sealedProductMatch.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const Q = require(join(REPO, "lib", "dealQuality.js"));
const { listingMatchesSealedProduct } = require(join(REPO, "lib", "dealMatching.js"));
const { SEALED_REFERENCE_COLUMNS, clearedReference } = require(join(REPO, "lib", "referenceProvenance.js"));

export const FROZEN = join(REPO, ".local", "remediation", "sealed-unresolved-frozen-2026-09-24.json");
export const SOURCE_REFUSAL = "edition_mismatch:30th_vs_25th";
// Columns this stage may change. Nothing else is written, ever.
export const MUTATED_COLUMNS = Object.freeze(["sealed_watchlist_id", "market_price", "discount_pct", ...SEALED_REFERENCE_COLUMNS]);

const productOf = (p) => (p?.name ? { name: p.name, set: p.set ?? null, productType: null } : null);

// Every active watched product that ACCEPTS this title, through the real
// two-stage scanner path.
export function acceptingProducts(row, products) {
  const out = [];
  for (const p of products) {
    const prod = productOf(p);
    if (!prod) continue;
    const nm = sealedNameMatch({ title: row.title }, { name: p.name, set: p.set }, listingMatchesSealedProduct);
    if (!nm.ok) continue;
    const d = sealedListingDecision(row.title ?? "", prod);
    if (!d.ok) continue;
    out.push({ id: p.id, tcgplayerId: p.tcgplayer_id, name: p.name, set: p.set, viaAlias: nm.viaAlias });
  }
  return out;
}

export function buildManifest(rows, products) {
  const deterministic = [];
  const manual = [];
  for (const row of rows) {
    const accepts = acceptingProducts(row, products);
    const current = row.sealed_watchlist;
    const entry = {
      dealId: row.id,
      ebayListingId: row.listing_id,
      marketplace: row.marketplace,
      title: row.title,
      currentProductId: current?.id ?? null,
      currentProductName: current?.name ?? null,
      currentProductTcgplayerId: current?.tcgplayer_id ?? null,
      currentRefusal: current ? sealedListingDecision(row.title ?? "", productOf(current))?.reason ?? null : null,
      acceptingProducts: accepts,
    };
    if (accepts.length === 1) {
      const dest = accepts[0];
      deterministic.push({
        ...entry,
        proposedProductId: dest.id,
        proposedProductName: dest.name,
        proposedProductTcgplayerId: dest.tcgplayerId,
        why:
          `exactly one of the ${products.length} active watched products accepts this title through the shipped ` +
          `name-token matcher${dest.viaAlias ? " (via the scoped 30th seller-title alias)" : ""} and the shipped identity decision; ` +
          `the current product ${entry.currentProductId} refuses it with ${entry.currentRefusal}`,
      });
    } else {
      manual.push({ ...entry, why: accepts.length === 0 ? "no active watched product accepts this title" : `${accepts.length} active watched products accept this title` });
    }
  }
  return { deterministic, manual };
}

// What the row becomes once the relink is persisted, run through the SAME
// gate that will run in production afterwards.
export function simulate(row, destProduct, destinationReference) {
  const after = {
    ...row,
    sealed_watchlist_id: destProduct.id,
    sealed_watchlist: { id: destProduct.id, name: destProduct.name, set: destProduct.set, tcgplayer_id: destProduct.tcgplayer_id },
    market_price: destinationReference ?? null,
    discount_pct: 0,
    ...clearedReference(SEALED_REFERENCE_COLUMNS),
  };
  const before = { decision: sealedListingDecision(row.title ?? "", productOf(row.sealed_watchlist)), displayable: Q.isDisplayableSealedDeal(row), claims: Q.savingsClaimTrusted(row) };
  const now = { decision: sealedListingDecision(after.title ?? "", productOf(after.sealed_watchlist)), displayable: Q.isDisplayableSealedDeal(after), claims: Q.savingsClaimTrusted(after) };
  return { before, after: now };
}

export async function readCandidates(db, ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("sealed_deals")
      .select("*, sealed_watchlist:sealed_watchlist_id (id, name, set, tcgplayer_id, active)")
      .in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`sealed_deals read failed: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

export async function readActiveProducts(db) {
  const out = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db.from("sealed_watchlist").select("id,name,set,tcgplayer_id,active").eq("active", true).order("id").range(f, f + 999);
    if (error) throw new Error(`sealed_watchlist read failed: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

// The destination product's OWN catalogue reference, keyed by watchlist id.
// A destination without one cannot be written to (market_price is NOT NULL
// and nothing may be invented), so such a row stays manual review.
export async function readDestinationReferences(db, products) {
  const ids = [...new Set(products.map((p) => p.tcgplayer_id).filter((v) => v != null).map(String))];
  const byTcg = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("sealed_catalog").select("tcgplayer_id,market_price").in("tcgplayer_id", ids.slice(i, i + 200));
    if (error) throw new Error(`sealed_catalog read failed: ${error.message}`);
    for (const c of data ?? []) byTcg.set(String(c.tcgplayer_id), c.market_price);
  }
  const byProduct = new Map();
  for (const p of products) {
    const v = byTcg.get(String(p.tcgplayer_id));
    if (typeof v === "number" && Number.isFinite(v) && v > 0) byProduct.set(p.id, v);
  }
  return byProduct;
}

export async function applyRelink(db, targets, { confirm, priorOut, now = new Date().toISOString() }) {
  if (Number(confirm) !== targets.length) throw new Error(`--confirm=${confirm} does not match the ${targets.length} targeted rows; nothing written`);
  const prior = {
    stage: "sealed-30th-relink-2026-09-24",
    appliedAt: now,
    mutatedColumns: [...MUTATED_COLUMNS],
    rows: targets.map((t) => ({ dealId: t.dealId, ebayListingId: t.ebayListingId, marketplace: t.marketplace, title: t.title, prior: t.priorValues })),
  };
  if (priorOut) writeFileSync(priorOut, JSON.stringify(prior, null, 1)); // BEFORE any write
  let written = 0;
  const results = [];
  for (const t of targets) {
    if (!(typeof t.destinationReference === "number" && t.destinationReference > 0)) {
      results.push({ dealId: t.dealId, updated: 0, error: "no destination catalogue reference; refusing to write" });
      continue;
    }
    const { data, error } = await db
      .from("sealed_deals")
      .update({ sealed_watchlist_id: t.proposedProductId, market_price: t.destinationReference, discount_pct: 0, ...clearedReference(SEALED_REFERENCE_COLUMNS) })
      .eq("id", t.dealId)
      .eq("sealed_watchlist_id", t.currentProductId) // still on the product we planned from
      .eq("listing_id", t.ebayListingId)
      .eq("marketplace", t.marketplace)
      .eq("title", t.title)
      .eq("is_active", true)
      .select("id");
    const n = error ? 0 : (data ?? []).length;
    written += n;
    results.push({ dealId: t.dealId, updated: n, error: error?.message ?? null });
  }
  return { expected: targets.length, written, results, prior };
}

export async function rollbackRelink(db, prior, { confirm }) {
  if (Number(confirm) !== prior.rows.length) throw new Error(`--confirm=${confirm} does not match the ${prior.rows.length} rows in the prior file; nothing written`);
  let restored = 0;
  const results = [];
  for (const r of prior.rows) {
    const { data, error } = await db.from("sealed_deals").update(r.prior).eq("id", r.dealId).eq("listing_id", r.ebayListingId).select("id");
    const n = error ? 0 : (data ?? []).length;
    restored += n;
    results.push({ dealId: r.dealId, restored: n, error: error?.message ?? null });
  }
  return { expected: prior.rows.length, restored, results };
}

async function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const has = (n) => process.argv.includes(`--${n}`);
  for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (arg("rollback")) {
    const prior = JSON.parse(readFileSync(arg("rollback"), "utf8"));
    const out = await rollbackRelink(db, prior, { confirm: arg("confirm") });
    console.log(JSON.stringify(out, null, 1));
    process.exit(out.restored === out.expected ? 0 : 2);
  }

  // The cohort comes from the FROZEN snapshot - never from a fresh query -
  // so the population this stage acts on is the one that was reviewed.
  const frozen = JSON.parse(readFileSync(FROZEN, "utf8"));
  const ids = frozen.cohort.filter((e) => e.refusal === SOURCE_REFUSAL).map((e) => e.dealId);
  console.log(`frozen snapshot : ${frozen.readAt}`);
  console.log(`cohort for this stage (${SOURCE_REFUSAL}): ${ids.length}`);

  const rows = await readCandidates(db, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const drifted = frozen.cohort
    .filter((e) => e.refusal === SOURCE_REFUSAL)
    .filter((e) => {
      const r = byId.get(e.dealId);
      return !r || r.title !== e.title || r.sealed_watchlist_id !== e.linkedProduct.id || r.is_active !== e.isActive || r.disqualified_reason !== e.disqualifiedReason;
    })
    .map((e) => e.dealId);
  console.log(`re-read live    : ${rows.length}   drifted since the freeze: ${drifted.length}${drifted.length ? " -> " + drifted.join(",") : ""}`);

  const products = await readActiveProducts(db);
  const destRefs = await readDestinationReferences(db, products);
  console.log(`active watched products tested against each title: ${products.length}`);
  console.log(`of those, carrying their own catalogue reference   : ${destRefs.size}\n`);

  const eligible = rows.filter((r) => !drifted.includes(r.id));
  const built = buildManifest(eligible, products);
  const manual = [...built.manual];
  const deterministic = [];
  // A destination with no catalogue reference cannot be written to, because
  // market_price is NOT NULL and nothing may be invented for it.
  for (const t of built.deterministic) {
    const ref = destRefs.get(t.proposedProductId);
    if (!(typeof ref === "number" && ref > 0)) {
      manual.push({ ...t, why: `destination product ${t.proposedProductId} has no usable catalogue reference; market_price is NOT NULL and nothing may be invented` });
      continue;
    }
    deterministic.push({ ...t, destinationReference: ref });
  }

  // Dry-run each deterministic relink through the real identity + display logic.
  const dests = new Map(products.map((p) => [p.id, p]));
  const outcome = { accepted: 0, stillRefused: 0, reasonChanged: 0 };
  for (const t of deterministic) {
    const row = byId.get(t.dealId);
    const sim = simulate(row, dests.get(t.proposedProductId), t.destinationReference);
    t.simulated = sim;
    t.priorValues = Object.fromEntries(MUTATED_COLUMNS.map((c) => [c, row[c] ?? null]));
    if (sim.after.decision.ok) outcome.accepted++;
    else if (sim.after.decision.reason === sim.before.decision.reason) outcome.stillRefused++;
    else outcome.reasonChanged++;
  }

  console.log(`=== MANIFEST ===`);
  console.log(`  deterministic relink candidates : ${deterministic.length}`);
  console.log(`  manual review                   : ${manual.length}`);
  const destCounts = {};
  for (const t of deterministic) destCounts[`${t.proposedProductId} ${t.proposedProductName}`] = (destCounts[`${t.proposedProductId} ${t.proposedProductName}`] ?? 0) + 1;
  for (const [d, n] of Object.entries(destCounts).sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(4)} -> ${d}`);
  console.log(`\n=== DRY RUN through the shipped identity + display logic ===`);
  console.log(`  becomes ACCEPTED by the identity rule : ${outcome.accepted}`);
  console.log(`  still refused, same reason            : ${outcome.stillRefused}`);
  console.log(`  still refused, different reason       : ${outcome.reasonChanged}`);
  const willDisplay = deterministic.filter((t) => t.simulated.after.displayable).length;
  const willClaim = deterministic.filter((t) => t.simulated.after.claims).length;
  console.log(`  displayable after the write           : ${willDisplay}`);
  console.log(`  making a savings claim after the write: ${willClaim}  (must be 0 - the comparison is cleared)`);

  if (manual.length) {
    console.log(`\n=== MANUAL REVIEW (${manual.length}) ===`);
    for (const m of manual) {
      console.log(`  #${String(m.dealId).padStart(5)}  ${m.why}`);
      console.log(`        ${m.title}`);
      for (const a of m.acceptingProducts) console.log(`          candidate: ${a.id} ${a.name} | ${a.set}${a.viaAlias ? " (alias)" : ""}`);
    }
  }

  const mOut = arg("manifest-out");
  if (mOut) {
    if (existsSync(mOut)) throw new Error(`${mOut} exists; refusing to overwrite a manifest`);
    writeFileSync(mOut, JSON.stringify({ stage: "sealed-30th-relink-2026-09-24", builtAt: new Date().toISOString(), frozenReadAt: frozen.readAt, cohort: ids.length, drifted, deterministic, manual, outcome }, null, 1));
    console.log(`\nmanifest -> ${mOut}`);
  }

  if (!has("apply")) {
    console.log("\nDRY RUN - no write made.");
    return;
  }
  const only = arg("only")?.split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
  const targets = only ? deterministic.filter((t) => only.includes(Number(t.dealId))) : deterministic;
  const priorOut = arg("prior-out");
  if (!priorOut) throw new Error("--apply requires --prior-out=<file> for rollback");
  if (existsSync(priorOut)) throw new Error(`${priorOut} exists; refusing to overwrite a prior-values file`);
  const out = await applyRelink(db, targets, { confirm: arg("confirm"), priorOut });
  console.log(JSON.stringify({ expected: out.expected, written: out.written, results: out.results }, null, 1));
  console.log("/sealed-deals and /sealed-deals/[id] are ISR revalidate=600; both refresh within 10 minutes.");
  process.exit(out.written === out.expected ? 0 : 2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

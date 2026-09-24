// sealed-deterministic-relink-2026-09-24 - STAGE 3: the small cohorts whose
// correct destination is an ALREADY-WATCHED product, so no watchlist
// expansion and no new scan cost is involved (the Stage 2 quota question
// does not apply here).
//
//   node scripts/remediation/sealedDeterministicRelink.mjs                                  # dry run (read-only, default)
//   node scripts/remediation/sealedDeterministicRelink.mjs --manifest-out=<f>
//   node scripts/remediation/sealedDeterministicRelink.mjs --apply --confirm=N --prior-out=<f> [--only=1,2]
//   node scripts/remediation/sealedDeterministicRelink.mjs --rollback=<prior file> --confirm=N
//
// Same proof and same write contract as Stage 1 (scripts/remediation/
// sealed30thRelink.mjs): a row qualifies only when EXACTLY ONE active
// watched product accepts its title through the real two-stage scanner path,
// and the write moves sealed_watchlist_id while replacing the comparison
// with the destination's own catalogue reference, a zero discount and
// cleared reference provenance - so a relinked row can make no savings claim
// until the destination's own scan reprices it.
//
// EXCLUSIONS, deliberately:
//   - the 84 kind_mismatch:booster_bundle_vs_booster_box rows. Their
//     destinations are NOT watched (Stage 2), and they stay safely hidden
//     and unresolved while the targeted-scan question is decided.
//   - deal 1386, held for manual review by Stage 1.
// Neither is touched here.
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
// edition_mismatch:30th_vs_25th belongs to Stage 1, which has already
// relinked 115 of its 116 rows. Re-reading them here would report them as
// "drifted" - they changed because Stage 1 changed them, by design.
export const EXCLUDED_REFUSALS = Object.freeze(["kind_mismatch:booster_bundle_vs_booster_box", "edition_mismatch:30th_vs_25th"]);
export const EXCLUDED_DEAL_IDS = Object.freeze([1386]);
export const MUTATED_COLUMNS = Object.freeze(["sealed_watchlist_id", "market_price", "discount_pct", ...SEALED_REFERENCE_COLUMNS]);

const productOf = (p) => (p?.name ? { name: p.name, set: p.set ?? null, productType: null } : null);

export function acceptingProducts(title, products) {
  const out = [];
  for (const p of products) {
    const prod = productOf(p);
    if (!prod) continue;
    const nm = sealedNameMatch({ title }, { name: p.name, set: p.set }, listingMatchesSealedProduct);
    if (!nm.ok) continue;
    if (!sealedListingDecision(title ?? "", prod).ok) continue;
    out.push({ id: p.id, tcgplayerId: p.tcgplayer_id, name: p.name, set: p.set, viaAlias: nm.viaAlias });
  }
  return out;
}

export function simulate(row, dest, destinationReference) {
  const after = {
    ...row,
    sealed_watchlist_id: dest.id,
    sealed_watchlist: { id: dest.id, name: dest.name, set: dest.set, tcgplayer_id: dest.tcgplayer_id },
    market_price: destinationReference,
    discount_pct: 0,
    ...clearedReference(SEALED_REFERENCE_COLUMNS),
  };
  return {
    before: { decision: sealedListingDecision(row.title ?? "", productOf(row.sealed_watchlist)), displayable: Q.isDisplayableSealedDeal(row), claims: Q.savingsClaimTrusted(row) },
    after: { decision: sealedListingDecision(after.title ?? "", productOf(after.sealed_watchlist)), displayable: Q.isDisplayableSealedDeal(after), claims: Q.savingsClaimTrusted(after) },
  };
}

const page = async (db, t, sel, tweak, order = "id") => {
  const out = [];
  for (let f = 0; ; f += 1000) {
    let q = db.from(t).select(sel).order(order).range(f, f + 999);
    if (tweak) q = tweak(q);
    const { data, error } = await q;
    if (error) throw new Error(`${t}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
};

export async function applyRelink(db, targets, { confirm, priorOut, now = new Date().toISOString() }) {
  if (Number(confirm) !== targets.length) throw new Error(`--confirm=${confirm} does not match the ${targets.length} targeted rows; nothing written`);
  const prior = { stage: "sealed-deterministic-relink-2026-09-24", appliedAt: now, mutatedColumns: [...MUTATED_COLUMNS], rows: targets.map((t) => ({ dealId: t.dealId, ebayListingId: t.ebayListingId, marketplace: t.marketplace, title: t.title, prior: t.priorValues })) };
  if (priorOut) writeFileSync(priorOut, JSON.stringify(prior, null, 1));
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
      .eq("sealed_watchlist_id", t.currentProductId)
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
  if (Number(confirm) !== prior.rows.length) throw new Error(`--confirm=${confirm} does not match the ${prior.rows.length} rows; nothing written`);
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

  const frozen = JSON.parse(readFileSync(FROZEN, "utf8"));
  const candidates = frozen.cohort.filter((e) => !EXCLUDED_REFUSALS.includes(e.refusal) && !EXCLUDED_DEAL_IDS.includes(e.dealId));
  console.log(`frozen snapshot : ${frozen.readAt}`);
  console.log(`cohort 262 minus 84 booster-bundle minus 1 held (#1386) = ${candidates.length} in scope`);

  const ids = candidates.map((e) => e.dealId);
  const rows = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("sealed_deals").select("*, sealed_watchlist:sealed_watchlist_id (id,name,set,tcgplayer_id,active)").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`sealed_deals: ${error.message}`);
    rows.push(...(data ?? []));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const drifted = candidates.filter((e) => {
    const r = byId.get(e.dealId);
    return !r || r.title !== e.title || r.sealed_watchlist_id !== e.linkedProduct.id || r.is_active !== e.isActive || r.disqualified_reason !== e.disqualifiedReason;
  }).map((e) => e.dealId);
  console.log(`re-read live    : ${rows.length}   drifted since the freeze: ${drifted.length}${drifted.length ? " -> " + drifted.join(",") : ""}`);

  const products = (await page(db, "sealed_watchlist", "id,name,set,tcgplayer_id,active", (q) => q.eq("active", true)));
  const catIds = [...new Set(products.map((p) => String(p.tcgplayer_id)))];
  const refByTcg = new Map();
  for (let i = 0; i < catIds.length; i += 200) {
    const { data } = await db.from("sealed_catalog").select("tcgplayer_id,market_price").in("tcgplayer_id", catIds.slice(i, i + 200));
    for (const c of data ?? []) if (typeof c.market_price === "number" && c.market_price > 0) refByTcg.set(String(c.tcgplayer_id), c.market_price);
  }
  console.log(`active watched products: ${products.length} (with a catalogue reference: ${[...new Set(products.filter((p) => refByTcg.has(String(p.tcgplayer_id))).map((p) => p.id))].length})\n`);

  const deterministic = [];
  const manual = [];
  for (const e of candidates) {
    const row = byId.get(e.dealId);
    if (!row || drifted.includes(e.dealId)) { manual.push({ dealId: e.dealId, title: e.title, refusal: e.refusal, why: "drifted since the freeze or not found" }); continue; }
    const accepts = acceptingProducts(row.title, products);
    const base = { dealId: row.id, ebayListingId: row.listing_id, marketplace: row.marketplace, title: row.title, refusal: e.refusal, currentProductId: row.sealed_watchlist_id, currentProductName: row.sealed_watchlist?.name ?? null, acceptingProducts: accepts };
    if (accepts.length !== 1) { manual.push({ ...base, why: accepts.length === 0 ? "no active watched product accepts this title" : `${accepts.length} active watched products accept this title` }); continue; }
    const dest = accepts[0];
    if (dest.id === row.sealed_watchlist_id) { manual.push({ ...base, why: "the only acceptor is the product it is already on" }); continue; }
    const ref = refByTcg.get(String(dest.tcgplayerId));
    if (!(typeof ref === "number" && ref > 0)) { manual.push({ ...base, why: `destination ${dest.id} has no usable catalogue reference` }); continue; }
    const t = { ...base, proposedProductId: dest.id, proposedProductName: dest.name, proposedProductTcgplayerId: dest.tcgplayerId, destinationReference: ref, why: `exactly one of the ${products.length} active watched products accepts this title through the shipped name-token matcher${dest.viaAlias ? " (via alias)" : ""} and the shipped identity decision` };
    t.simulated = simulate(row, { id: dest.id, name: dest.name, set: dest.set, tcgplayer_id: dest.tcgplayerId }, ref);
    t.priorValues = Object.fromEntries(MUTATED_COLUMNS.map((c) => [c, row[c] ?? null]));
    deterministic.push(t);
  }

  console.log(`=== MANIFEST ===`);
  console.log(`  deterministic relink candidates : ${deterministic.length}`);
  console.log(`  no action / manual review       : ${manual.length}`);
  const byRefusal = {};
  for (const t of deterministic) (byRefusal[t.refusal] ??= []).push(t.dealId);
  for (const [r, list] of Object.entries(byRefusal).sort((a, b) => b[1].length - a[1].length)) console.log(`      ${String(list.length).padStart(4)}  ${r}  -> ids ${list.join(",")}`);
  console.log(`\n  destinations:`);
  const dc = {};
  for (const t of deterministic) dc[`${t.proposedProductId} ${t.proposedProductName}`] = (dc[`${t.proposedProductId} ${t.proposedProductName}`] ?? 0) + 1;
  for (const [d, n] of Object.entries(dc).sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(4)} -> ${d}`);
  for (const t of deterministic) console.log(`      #${String(t.dealId).padStart(5)}  ${t.currentProductName} -> ${t.proposedProductName}\n            ${t.title}`);

  const acc = deterministic.filter((t) => t.simulated.after.decision.ok).length;
  const disp = deterministic.filter((t) => t.simulated.after.displayable).length;
  const clm = deterministic.filter((t) => t.simulated.after.claims).length;
  console.log(`\n=== DRY RUN through the shipped identity + display logic ===`);
  console.log(`  becomes ACCEPTED by the identity rule : ${acc}/${deterministic.length}`);
  console.log(`  displayable after the write           : ${disp}`);
  console.log(`  making a savings claim after the write: ${clm}  (must be 0)`);

  console.log(`\n=== manual review by reason (${manual.length}) ===`);
  const mr = {};
  for (const m of manual) mr[m.why] = (mr[m.why] ?? 0) + 1;
  for (const [w, n] of Object.entries(mr).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${w}`);

  const mOut = arg("manifest-out");
  if (mOut) {
    if (existsSync(mOut)) throw new Error(`${mOut} exists; refusing to overwrite a manifest`);
    writeFileSync(mOut, JSON.stringify({ stage: "sealed-deterministic-relink-2026-09-24", builtAt: new Date().toISOString(), frozenReadAt: frozen.readAt, inScope: candidates.length, excluded: { refusals: [...EXCLUDED_REFUSALS], dealIds: [...EXCLUDED_DEAL_IDS] }, drifted, deterministic, manual }, null, 1));
    console.log(`\nmanifest -> ${mOut}`);
  }

  if (!has("apply")) { console.log("\nDRY RUN - no write made."); return; }
  const only = arg("only")?.split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
  const targets = only ? deterministic.filter((t) => only.includes(Number(t.dealId))) : deterministic;
  const priorOut = arg("prior-out");
  if (!priorOut) throw new Error("--apply requires --prior-out=<file>");
  if (existsSync(priorOut)) throw new Error(`${priorOut} exists; refusing to overwrite a prior-values file`);
  const out = await applyRelink(db, targets, { confirm: arg("confirm"), priorOut });
  console.log(JSON.stringify({ expected: out.expected, written: out.written, results: out.results }, null, 1));
  process.exit(out.written === out.expected ? 0 : 2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

// sealed-identity-2026-09-24 - QUARANTINE the stored sealed_deals rows whose
// listing is NOT the sealed product they are bound to (audit 2026-09-23
// finding 1: a graded promo, an accessory or an empty box that merely names
// the box it came from).
//
//   node scripts/remediation/sealedIdentityQuarantine.mjs                   # dry run (read-only, default)
//   node scripts/remediation/sealedIdentityQuarantine.mjs --snapshot-out=<f> # dry run + private snapshot
//   node scripts/remediation/sealedIdentityQuarantine.mjs --apply --confirm=N --prior-out=<f> [--only=1,2,3]
//   node scripts/remediation/sealedIdentityQuarantine.mjs --rollback=<prior file> --confirm=N
//
// THE RULE IS THE SHIPPED ONE, NOT A SECOND COPY. Eligibility is
// lib/sealedProductMatch.sealedListingDecision - the same decision the
// scanner applies at ingestion and the display gate applies to stored rows.
// A row is eligible only when that decision rejects it with one of the
// NOT_A_SEALED_PRODUCT reasons; a row rejected for any OTHER reason (edition
// ambiguity, quantity, a different box kind) is reported as `unresolved` and
// never written, because those are not this finding.
//
// Sets only sealed_deals.disqualified_reason = "product:not_a_sealed_product".
// Never touches is_active, identity, prices, references or timestamps, never
// deletes a row, and never invents a value. The display gate already hides
// these rows once the matcher ships; this persists an explicit, reviewable
// reason so the exclusion survives any later change to the matcher and shows
// up in the integrity report.
//
// PROGRESS IS TRACKED BY STABLE ROW IDS captured in the snapshot, not by a
// live query on disqualified_reason - otherwise writing the field would make
// the cohort vanish from its own report.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { sealedListingDecision, NOT_A_SEALED_PRODUCT } from "../../lib/sealedProductMatch.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);

export const QUARANTINE_REASON = "product:not_a_sealed_product";
// The reasons this pass owns. Anything else stays unresolved.
export const ELIGIBLE_REASONS = Object.freeze(NOT_A_SEALED_PRODUCT.map((k) => `kind_mismatch:${k}`));

// Read every sealed row with the product it is bound to. `*` because the
// display gate needs the display columns.
export async function readSealedRows(db) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("sealed_deals")
      .select("*, sealed_watchlist:sealed_watchlist_id (id,name,set,tcgplayer_id)")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`sealed_deals read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

// Three buckets, by the shipped decision:
//   quarantine  active, not already disqualified, and rejected for one of
//               THIS finding's reasons
//   unresolved  rejected, but for a reason this pass does not own
//   valid       the decision accepts it - left completely alone
export function classify(rows) {
  const out = { quarantine: [], unresolved: [], valid: [], alreadyDisqualified: [], inactive: [] };
  for (const row of rows) {
    const p = row.sealed_watchlist;
    // No product to compare against is not evidence of anything.
    if (!p?.name) {
      out.unresolved.push({ row, reason: "no_product_row" });
      continue;
    }
    const decision = sealedListingDecision(row.title ?? "", { name: p.name, set: p.set ?? null, productType: null });
    const entry = {
      dealId: row.id,
      ebayListingId: row.listing_id,
      marketplace: row.marketplace,
      title: row.title,
      boundTo: `${p.name} (${p.set})`,
      productId: p.id,
      decisionReason: decision.ok ? null : decision.reason,
      priorDisqualifiedReason: row.disqualified_reason ?? null,
      isActive: row.is_active === true,
      listingUrl: row.listing_url ?? null,
      imageUrl: row.image_url ?? null,
      priceUsd: row.total_price_usd ?? null,
      marketPrice: row.market_price ?? null,
    };
    if (decision.ok) {
      out.valid.push(entry);
      continue;
    }
    if (!ELIGIBLE_REASONS.includes(decision.reason)) {
      out.unresolved.push(entry);
      continue;
    }
    if (row.disqualified_reason != null) {
      out.alreadyDisqualified.push(entry);
      continue;
    }
    if (row.is_active !== true) {
      out.inactive.push(entry);
      continue;
    }
    out.quarantine.push(entry);
  }
  return out;
}

// The snapshot is written BEFORE any mutation and holds the original values
// of every field this pass could touch, plus the stable identifiers the
// report is tracked by.
export function buildSnapshot(plan, now) {
  return {
    finding: "audit-2026-09-23 finding 1 - graded singles / accessories / empty boxes bound to sealed products",
    reason: QUARANTINE_REASON,
    builtAt: now,
    eligibleReasons: [...ELIGIBLE_REASONS],
    counts: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length])),
    // every id this pass considers itself responsible for, whatever happens
    // to the classification field afterwards
    trackedIds: [...plan.quarantine, ...plan.unresolved.filter((u) => u.dealId), ...plan.alreadyDisqualified, ...plan.inactive].map((e) => e.dealId),
    quarantine: plan.quarantine,
    unresolved: plan.unresolved.map((u) => (u.dealId ? u : { dealId: u.row?.id ?? null, title: u.row?.title ?? null, reason: u.reason })),
    alreadyDisqualified: plan.alreadyDisqualified,
    inactive: plan.inactive,
  };
}

export async function applyQuarantine(db, targets, { confirm, priorOut, now = new Date().toISOString() }) {
  if (Number(confirm) !== targets.length) {
    throw new Error(`--confirm=${confirm} does not match the ${targets.length} eligible rows; nothing written`);
  }
  const prior = {
    reason: QUARANTINE_REASON,
    appliedAt: now,
    rows: targets.map((t) => ({
      dealId: t.dealId,
      ebayListingId: t.ebayListingId,
      marketplace: t.marketplace,
      title: t.title,
      prior_disqualified_reason: t.priorDisqualifiedReason,
      prior_is_active: t.isActive,
      prior_sealed_watchlist_id: t.productId,
    })),
  };
  if (priorOut) writeFileSync(priorOut, JSON.stringify(prior, null, 1)); // BEFORE any write
  let written = 0;
  const results = [];
  for (const t of targets) {
    // Column-scoped and guarded: the row must still be exactly what was
    // planned, or it is skipped rather than overwritten.
    const { data, error } = await db
      .from("sealed_deals")
      .update({ disqualified_reason: QUARANTINE_REASON })
      .eq("id", t.dealId)
      .eq("is_active", true)
      .is("disqualified_reason", null)
      .eq("listing_id", t.ebayListingId)
      .eq("marketplace", t.marketplace)
      .eq("sealed_watchlist_id", t.productId)
      .eq("title", t.title)
      .select("id");
    const n = error ? 0 : (data ?? []).length;
    written += n;
    results.push({ dealId: t.dealId, updated: n, error: error?.message ?? null });
  }
  return { expected: targets.length, written, results, prior };
}

export async function rollbackQuarantine(db, prior, { confirm }) {
  if (Number(confirm) !== prior.rows.length) {
    throw new Error(`--confirm=${confirm} does not match the ${prior.rows.length} rows in the prior-values file; nothing written`);
  }
  let restored = 0;
  const results = [];
  for (const r of prior.rows) {
    const { data, error } = await db
      .from("sealed_deals")
      .update({ disqualified_reason: r.prior_disqualified_reason ?? null })
      .eq("id", r.dealId)
      .eq("listing_id", r.ebayListingId)
      .eq("disqualified_reason", prior.reason ?? QUARANTINE_REASON)
      .select("id");
    const n = error ? 0 : (data ?? []).length;
    restored += n;
    results.push({ dealId: r.dealId, restored: n, error: error?.message ?? null });
  }
  return { expected: prior.rows.length, restored, results };
}

// CACHES. The card remediations queue tag invalidation because the card
// surfaces are unstable_cache'd and tagged. The sealed surfaces are not:
// /sealed-deals and /sealed-deals/[id] are plain ISR with
// `export const revalidate = 600`, and there is no sealed cache tag to
// expire. So this script queues nothing and says so, rather than inventing
// a tag name that no reader subscribes to. Both pages pick the change up
// within their own 10-minute window.
export const CACHE_NOTE =
  "No cache invalidation queued: /sealed-deals and /sealed-deals/[id] are ISR with revalidate=600 and carry no cache tag. Both refresh within 10 minutes.";

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const has = (name) => process.argv.includes(`--${name}`);
  for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (arg("rollback")) {
    const prior = JSON.parse(readFileSync(arg("rollback"), "utf8"));
    const out = await rollbackQuarantine(db, prior, { confirm: arg("confirm") });
    console.log(JSON.stringify(out, null, 1));
    console.log(CACHE_NOTE);
    process.exit(out.restored === out.expected ? 0 : 2);
  }

  const rows = await readSealedRows(db);
  const plan = classify(rows);
  const snapshot = buildSnapshot(plan, new Date().toISOString());
  console.log(`sealed_deals rows read: ${rows.length}`);
  for (const [k, v] of Object.entries(plan)) console.log(`  ${k.padEnd(20)} ${v.length}`);

  console.log(`\n--- would quarantine (${plan.quarantine.length}) ---`);
  for (const t of plan.quarantine) {
    console.log(`  #${String(t.dealId).padStart(5)}  ${t.decisionReason.padEnd(28)}  bound to ${t.boundTo}`);
    console.log(`         ${t.title}`);
  }
  const unresolvedWithId = plan.unresolved.filter((u) => u.dealId && u.isActive);
  console.log(`\n--- unresolved, active, NOT written (${unresolvedWithId.length}) ---`);
  const byReason = {};
  for (const u of unresolvedWithId) byReason[u.decisionReason ?? u.reason] = (byReason[u.decisionReason ?? u.reason] ?? 0) + 1;
  for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`);

  const snapOut = arg("snapshot-out");
  if (snapOut) {
    if (existsSync(snapOut)) throw new Error(`${snapOut} exists; refusing to overwrite a snapshot`);
    writeFileSync(snapOut, JSON.stringify(snapshot, null, 1));
    console.log(`\nsnapshot -> ${snapOut}`);
  }

  if (!has("apply")) {
    console.log("\nDRY RUN - no write made.");
    return;
  }
  // --only=<ids> runs the canary: the same plan, restricted to named rows.
  const only = arg("only")?.split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
  const targets = only ? plan.quarantine.filter((t) => only.includes(Number(t.dealId))) : plan.quarantine;
  const priorOut = arg("prior-out");
  if (!priorOut) throw new Error("--apply requires --prior-out=<file> for rollback");
  if (existsSync(priorOut)) throw new Error(`${priorOut} exists; refusing to overwrite a prior-values file`);
  const out = await applyQuarantine(db, targets, { confirm: arg("confirm"), priorOut });
  console.log(JSON.stringify({ expected: out.expected, written: out.written, results: out.results }, null, 1));
  console.log(CACHE_NOTE);
  process.exit(out.written === out.expected ? 0 : 2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

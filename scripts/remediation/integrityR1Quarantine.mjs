// integrity-r1 collector-number QUARANTINE - PROPOSED, NOT APPROVED.
//
//   node scripts/remediation/integrityR1Quarantine.mjs                 # dry run (read-only, default)
//   node scripts/remediation/integrityR1Quarantine.mjs --out=plan.json # dry run + write the plan
//   node scripts/remediation/integrityR1Quarantine.mjs --apply --confirm=23 --prior-out=prior.json
//   node scripts/remediation/integrityR1Quarantine.mjs --rollback=prior.json --confirm=23
//
// What it does: for the HIGH-confidence rows in
// integrity-r1-quarantine-manifest.json - active listings whose title
// explicitly states a collector number that contradicts the stored card
// (e.g. "Pikachu TG05/TG30" stored as Pikachu V TG16/TG30) - it sets the
// EXISTING exclusion column deals.disqualified_reason to
// "identity:collector_number_conflict". Any non-null reason already fails
// isDisplayableDeal and isVerificationCandidate, so the row stops being
// shown or re-verified. Scanner sightings do not clear it (their row
// payload carries no disqualified_reason), so nothing re-publishes the row.
//
// What it never does: change is_active, watchlist/card identity, prices,
// discounts or timestamps; touch an "uncertain" row; reactivate anything.
//
// Safety:
// - every write is guarded on the row still being exactly what was reviewed
//   (id + is_active=true + disqualified_reason IS NULL + listing_id +
//   marketplace + card_tcgplayer_id) and the title still conflicting with
//   the CURRENT catalogue number under the shipped matcher;
// - --apply refuses unless --confirm equals the dry-run's eligible count,
//   and writes the prior values file BEFORE the first update;
// - --rollback restores each row's saved prior disqualified_reason, only
//   where the quarantine reason is still present (is_active untouched).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);

export const QUARANTINE_REASON = "identity:collector_number_conflict";
export const MANIFEST_PATH = join(HERE, "integrity-r1-quarantine-manifest.json");
const ROW_COLS =
  "id, listing_id, marketplace, source, title, listing_url, affiliate_url, image_url, display_image_url, image_verdict, listing_type, " +
  "auction_end_at, bid_count, price, shipping, total_price, total_price_usd, currency, market_price, discount_pct, condition, is_active, " +
  "is_graded, grader, grade, first_seen_at, last_seen_at, exact_verified_at, watchlist_id, card_tcgplayer_id, card_catalog_id, card_name, " +
  "card_set, card_language, discovery_source, disqualified_reason, seller_feedback_pct, seller_feedback_score, image_count, " +
  "returns_accepted, visual_authenticity_status, visual_authenticity_reason, reference_source, reference_observed_at";

export function loadLibs() {
  return {
    collectorNumberConflict: require(join(REPO, "lib", "dealMatching.js")).collectorNumberConflict,
    isDisplayableDeal: require(join(REPO, "lib", "dealQuality.js")).isDisplayableDeal,
  };
}

// Read-only. Returns one line per manifest candidate with a decision.
export async function planQuarantine(db, manifest, libs = loadLibs()) {
  const ids = manifest.candidates.map((c) => c.dealId);
  const { data: rows, error } = await db.from("deals").select(ROW_COLS).in("id", ids);
  if (error) throw new Error(`deals read failed: ${error.message}`);
  const cardIds = [...new Set((rows ?? []).map((r) => String(r.card_tcgplayer_id)))];
  const { data: cat, error: catError } = await db.from("card_catalog").select("tcgplayer_id, card_number").in("tcgplayer_id", cardIds);
  if (catError) throw new Error(`card_catalog read failed: ${catError.message}`);
  const numberOf = new Map((cat ?? []).map((c) => [String(c.tcgplayer_id), c.card_number]));
  const byId = new Map((rows ?? []).map((r) => [Number(r.id), r]));

  return manifest.candidates.map((c) => {
    const row = byId.get(Number(c.dealId));
    const base = {
      dealId: c.dealId,
      ebayListingId: c.ebayListingId,
      marketplace: c.marketplace,
      confidence: c.confidence,
      conflictKind: c.conflictKind,
      title: c.title,
      storedAs: `${c.storedIdentity.cardName} | ${c.storedIdentity.cardSet} | #${c.storedIdentity.catalogueNumber}`,
      evidence: c.evidence,
    };
    if (!row) return { ...base, decision: "skip", why: "row not found" };
    const g = c.proposedMutation?.guard;
    const liveNumber = numberOf.get(String(row.card_tcgplayer_id)) ?? null;
    const current = {
      isActive: row.is_active,
      disqualifiedReason: row.disqualified_reason,
      displayable: libs.isDisplayableDeal(row),
      conflictNow: liveNumber != null && libs.collectorNumberConflict(row.title ?? "", liveNumber),
      catalogueNumberNow: liveNumber,
    };
    if (c.confidence !== "high" || !g) return { ...base, current, decision: "review", why: "uncertain - never mutated by this script" };
    const changed = [];
    if (row.is_active !== true) changed.push("is_active");
    if (row.disqualified_reason != null) changed.push(`disqualified_reason=${row.disqualified_reason}`);
    if (row.listing_id !== g.listing_id) changed.push("listing_id");
    if (row.marketplace !== g.marketplace) changed.push("marketplace");
    if (String(row.card_tcgplayer_id) !== String(g.card_tcgplayer_id)) changed.push("card_tcgplayer_id (identity already changed)");
    if (row.title !== c.title) changed.push("title");
    if (!current.conflictNow) changed.push("no longer conflicts under the shipped matcher");
    if (changed.length) return { ...base, current, decision: "skip", why: `changed since review: ${changed.join(", ")}` };
    return { ...base, current, decision: "quarantine", mutation: { set: { disqualified_reason: QUARANTINE_REASON }, guard: g } };
  });
}

export async function applyQuarantine(db, plan, { confirm, priorOut, now = new Date().toISOString() }) {
  const targets = plan.filter((p) => p.decision === "quarantine");
  if (Number(confirm) !== targets.length) {
    throw new Error(`--confirm=${confirm} does not match the ${targets.length} eligible rows; nothing written`);
  }
  const prior = {
    reason: QUARANTINE_REASON,
    appliedAt: now,
    rows: targets.map((t) => ({ dealId: t.dealId, ebayListingId: t.ebayListingId, prior_disqualified_reason: t.current.disqualifiedReason, prior_is_active: t.current.isActive })),
  };
  if (priorOut) writeFileSync(priorOut, JSON.stringify(prior, null, 1)); // BEFORE any write
  let written = 0;
  const results = [];
  for (const t of targets) {
    const g = t.mutation.guard;
    const { data, error } = await db
      .from("deals")
      .update({ disqualified_reason: QUARANTINE_REASON })
      .eq("id", g.id)
      .eq("is_active", true)
      .is("disqualified_reason", null)
      .eq("listing_id", g.listing_id)
      .eq("marketplace", g.marketplace)
      .eq("card_tcgplayer_id", g.card_tcgplayer_id)
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
      .from("deals")
      .update({ disqualified_reason: r.prior_disqualified_reason ?? null })
      .eq("id", r.dealId)
      .eq("disqualified_reason", prior.reason ?? QUARANTINE_REASON)
      .select("id");
    const n = error ? 0 : (data ?? []).length;
    restored += n;
    results.push({ dealId: r.dealId, restored: n, error: error?.message ?? null });
  }
  return { expected: prior.rows.length, restored, results };
}

function printPlan(plan) {
  const cut = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
  for (const p of plan) {
    console.log(
      [
        p.decision.padEnd(10),
        String(p.dealId).padEnd(6),
        cut(p.ebayListingId, 20).padEnd(20),
        p.marketplace.padEnd(8),
        p.confidence.padEnd(9),
        `displayable=${p.current?.displayable}`,
        `conflictNow=${p.current?.conflictNow}`,
        "|",
        cut(p.storedAs, 60),
        "|",
        cut(p.title, 70),
        p.why ? `| ${p.why}` : "",
      ].join(" ")
    );
  }
  const q = plan.filter((p) => p.decision === "quarantine").length;
  console.log(`\nquarantine: ${q}   review (uncertain, untouched): ${plan.filter((p) => p.decision === "review").length}   skip (changed): ${plan.filter((p) => p.decision === "skip").length}`);
  console.log(`expected affected rows if applied: ${q}`);
}

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const has = (name) => process.argv.includes(`--${name}`);
  for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

  if (arg("rollback")) {
    const prior = JSON.parse(readFileSync(arg("rollback"), "utf8"));
    const out = await rollbackQuarantine(db, prior, { confirm: arg("confirm") });
    console.log(JSON.stringify(out, null, 1));
    process.exit(out.restored === out.expected ? 0 : 2);
  }
  const plan = await planQuarantine(db, manifest);
  printPlan(plan);
  if (arg("out")) writeFileSync(arg("out"), JSON.stringify({ at: new Date().toISOString(), plan }, null, 1));
  if (!has("apply")) {
    console.log("\nDRY RUN - no write made. Re-run with --apply --confirm=<count> --prior-out=<file> only on explicit approval.");
    return;
  }
  const priorOut = arg("prior-out");
  if (!priorOut) throw new Error("--apply requires --prior-out=<file> for rollback");
  if (existsSync(priorOut)) throw new Error(`${priorOut} exists; refusing to overwrite a prior-values file`);
  const out = await applyQuarantine(db, plan, { confirm: arg("confirm"), priorOut });
  console.log(JSON.stringify({ expected: out.expected, written: out.written, results: out.results }, null, 1));
  process.exit(out.written === out.expected ? 0 : 2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

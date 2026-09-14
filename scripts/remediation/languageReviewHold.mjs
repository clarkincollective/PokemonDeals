// Language REVIEW HOLD - PROPOSED, NOT APPROVED.
//
//   node scripts/remediation/languageReviewHold.mjs                 # dry run (read-only, default)
//   node scripts/remediation/languageReviewHold.mjs --out=plan.json # dry run + write the plan
//   node scripts/remediation/languageReviewHold.mjs --apply --confirm=4 --prior-out=prior.json
//   node scripts/remediation/languageReviewHold.mjs --rollback=prior.json --confirm=4   # release the hold
//
// What it does: for the 4 listings in language-review-hold-manifest.json -
// EBAY_IT titles that say "giapponese" but also carry German-print markers,
// stored against an English identity and English reference - it sets the
// EXISTING exclusion column deals.disqualified_reason to
// "review:language_unverified". Any non-null reason hides the row, so a
// possibly wrong comparison stops being shown while the print language is
// resolved. It is a hold, not a finding.
//
// What it never does: assert or store a language; change is_active,
// watchlist/card identity, prices, discounts or timestamps; reactivate
// anything. Releasing the hold is the rollback. With integrity follow-up r2
// deployed, availability retirements keep the hold instead of replacing it.
//
// Safety (same contract as the applied quarantine scripts):
// - every write is guarded on the row still being exactly what was reviewed
//   (id + is_active=true + disqualified_reason IS NULL + listing_id +
//   marketplace + card_tcgplayer_id + card_language='english'); the plan
//   also requires the title to be unchanged;
// - --apply refuses unless --confirm equals the dry-run's eligible count,
//   and writes the prior values file BEFORE the first update;
// - --rollback restores each row's saved prior disqualified_reason, only
//   where the hold reason is still present (is_active untouched).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);

export const HOLD_REASON = "review:language_unverified";
export const MANIFEST_PATH = join(HERE, "language-review-hold-manifest.json");
const ROW_COLS =
  "id, listing_id, marketplace, source, title, listing_url, affiliate_url, image_url, display_image_url, image_verdict, listing_type, " +
  "auction_end_at, bid_count, price, shipping, total_price, total_price_usd, currency, market_price, discount_pct, condition, is_active, " +
  "is_graded, grader, grade, first_seen_at, last_seen_at, exact_verified_at, watchlist_id, card_tcgplayer_id, card_catalog_id, card_name, " +
  "card_set, card_language, discovery_source, disqualified_reason, seller_feedback_pct, seller_feedback_score, image_count, " +
  "returns_accepted, visual_authenticity_status, visual_authenticity_reason, reference_source, reference_observed_at";

export function loadLibs() {
  return { isDisplayableDeal: require(join(REPO, "lib", "dealQuality.js")).isDisplayableDeal };
}

// Read-only. Returns one line per manifest candidate with a decision.
export async function planHold(db, manifest, libs = loadLibs()) {
  const ids = manifest.candidates.map((c) => c.dealId);
  const { data: rows, error } = await db.from("deals").select(ROW_COLS).in("id", ids);
  if (error) throw new Error(`deals read failed: ${error.message}`);
  const byId = new Map((rows ?? []).map((r) => [Number(r.id), r]));
  return manifest.candidates.map((c) => {
    const row = byId.get(Number(c.dealId));
    const base = { dealId: c.dealId, ebayListingId: c.ebayListingId, marketplace: c.marketplace, title: c.title };
    if (!row) return { ...base, decision: "skip", why: "row not found" };
    const current = { isActive: row.is_active, disqualifiedReason: row.disqualified_reason, displayable: libs.isDisplayableDeal(row), cardLanguage: row.card_language };
    const g = c.proposedMutation?.guard;
    if (!g) return { ...base, current, decision: "skip", why: "no reviewed mutation" };
    const changed = [];
    if (row.is_active !== true) changed.push("is_active");
    if (row.disqualified_reason != null) changed.push(`disqualified_reason=${row.disqualified_reason}`);
    if (row.listing_id !== g.listing_id) changed.push("listing_id");
    if (row.marketplace !== g.marketplace) changed.push("marketplace");
    if (String(row.card_tcgplayer_id) !== String(g.card_tcgplayer_id)) changed.push("card_tcgplayer_id (identity already changed)");
    if (row.card_language !== g.card_language) changed.push("card_language (identity already changed)");
    if (row.title !== c.title) changed.push("title");
    if (changed.length) return { ...base, current, decision: "skip", why: `changed since review: ${changed.join(", ")}` };
    return { ...base, current, decision: "hold", mutation: { set: { disqualified_reason: HOLD_REASON }, guard: g } };
  });
}

export async function applyHold(db, plan, { confirm, priorOut, now = new Date().toISOString() }) {
  const targets = plan.filter((p) => p.decision === "hold");
  if (Number(confirm) !== targets.length) {
    throw new Error(`--confirm=${confirm} does not match the ${targets.length} eligible rows; nothing written`);
  }
  const prior = {
    reason: HOLD_REASON,
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
      .update({ disqualified_reason: HOLD_REASON })
      .eq("id", g.id)
      .eq("is_active", true)
      .is("disqualified_reason", null)
      .eq("listing_id", g.listing_id)
      .eq("marketplace", g.marketplace)
      .eq("card_tcgplayer_id", g.card_tcgplayer_id)
      .eq("card_language", g.card_language)
      .select("id");
    const n = error ? 0 : (data ?? []).length;
    written += n;
    results.push({ dealId: t.dealId, updated: n, error: error?.message ?? null });
  }
  return { expected: targets.length, written, results, prior };
}

export async function releaseHold(db, prior, { confirm }) {
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
      .eq("disqualified_reason", prior.reason ?? HOLD_REASON)
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
    console.log([p.decision.padEnd(5), String(p.dealId).padEnd(6), cut(p.ebayListingId, 20).padEnd(20), p.marketplace.padEnd(8), `displayable=${p.current?.displayable}`, "|", cut(p.title, 80), p.why ? `| ${p.why}` : ""].join(" "));
  }
  const h = plan.filter((p) => p.decision === "hold").length;
  console.log(`\nhold: ${h}   skip (changed): ${plan.filter((p) => p.decision === "skip").length}`);
  console.log(`expected affected rows if applied: ${h}`);
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
    const out = await releaseHold(db, prior, { confirm: arg("confirm") });
    console.log(JSON.stringify(out, null, 1));
    process.exit(out.restored === out.expected ? 0 : 2);
  }
  const plan = await planHold(db, manifest);
  printPlan(plan);
  if (arg("out")) writeFileSync(arg("out"), JSON.stringify({ at: new Date().toISOString(), plan }, null, 1));
  if (!has("apply")) {
    console.log("\nDRY RUN - no write made. Re-run with --apply --confirm=<count> --prior-out=<file> only on explicit approval.");
    return;
  }
  const priorOut = arg("prior-out");
  if (!priorOut) throw new Error("--apply requires --prior-out=<file> for release");
  if (existsSync(priorOut)) throw new Error(`${priorOut} exists; refusing to overwrite a prior-values file`);
  const out = await applyHold(db, plan, { confirm: arg("confirm"), priorOut });
  console.log(JSON.stringify({ expected: out.expected, written: out.written, results: out.results }, null, 1));
  process.exit(out.written === out.expected ? 0 : 2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

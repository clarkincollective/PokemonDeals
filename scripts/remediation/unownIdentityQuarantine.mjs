// unown-identity-r1 - single-row collector-number QUARANTINE (owner-approved
// for deal 38057 only).
//
//   node scripts/remediation/unownIdentityQuarantine.mjs                  # dry run (read-only, default)
//   node scripts/remediation/unownIdentityQuarantine.mjs --apply --confirm=1 --prior-out=<file>
//   node scripts/remediation/unownIdentityQuarantine.mjs --rollback=<prior file> --confirm=1
//
// The row's title explicitly states the Unown letter collector number
// "R/28" while the row is stored as Unown (M) (catalogue M/28). The shipped
// matcher cannot parse letter numbers, so eligibility here is the REVIEWED
// evidence re-checked live: every guarded field is still exactly as
// reviewed, the catalogue number is still the reviewed letter pair, and the
// title still states the reviewed (different) letter pair.
//
// Sets only deals.disqualified_reason = "identity:collector_number_conflict"
// (same reason and mechanism as integrityR1Quarantine.mjs). Never changes
// is_active, identity, prices or timestamps; never touches any other row.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);

export const QUARANTINE_REASON = "identity:collector_number_conflict";
export const MANIFEST_PATH = join(HERE, "unown-identity-quarantine-manifest.json");
const ROW_COLS = "*"; // full row: isDisplayableDeal needs the display columns

// The letter half of an explicit "X/28" pair in the title (letters, ! or ?),
// or null. Only an explicit pair counts - never a guessed letter.
export function titleLetterPairs(title, den) {
  const out = new Set();
  const re = new RegExp(`(?:^|[^A-Za-z0-9])#?([A-Za-z!?])\\s*/\\s*${den}(?![0-9])`, "g");
  for (const m of String(title ?? "").matchAll(re)) out.add(m[1].toUpperCase());
  return [...out];
}

export async function planQuarantine(db, manifest, { isDisplayableDeal = require(join(REPO, "lib", "dealQuality.js")).isDisplayableDeal } = {}) {
  const ids = manifest.candidates.map((c) => c.dealId);
  const { data: rows, error } = await db.from("deals").select(ROW_COLS).in("id", ids);
  if (error) throw new Error(`deals read failed: ${error.message}`);
  const cardIds = [...new Set(manifest.candidates.map((c) => c.storedIdentity.cardTcgplayerId))];
  const { data: cat, error: catError } = await db.from("card_catalog").select("tcgplayer_id, card_number").in("tcgplayer_id", cardIds);
  if (catError) throw new Error(`card_catalog read failed: ${catError.message}`);
  const numberOf = new Map((cat ?? []).map((c) => [String(c.tcgplayer_id), c.card_number]));
  const byId = new Map((rows ?? []).map((r) => [Number(r.id), r]));

  return manifest.candidates.map((c) => {
    const row = byId.get(Number(c.dealId));
    const base = { dealId: c.dealId, ebayListingId: c.ebayListingId, marketplace: c.marketplace, title: c.title, storedAs: `${c.storedIdentity.cardName} | #${c.storedIdentity.catalogueNumber}`, evidence: c.evidence };
    if (!row) return { ...base, decision: "skip", why: "row not found" };
    const g = c.proposedMutation?.guard;
    const liveNumber = numberOf.get(String(c.storedIdentity.cardTcgplayerId)) ?? null;
    const den = String(c.storedIdentity.catalogueNumber).split("/")[1];
    const letters = titleLetterPairs(row.title, den);
    const current = { isActive: row.is_active, disqualifiedReason: row.disqualified_reason, displayable: isDisplayableDeal(row), catalogueNumberNow: liveNumber, titleLetterPairs: letters };
    if (c.confidence !== "high" || !g) return { ...base, current, decision: "review", why: "not approved for mutation" };
    const changed = [];
    if (row.is_active !== true) changed.push("is_active");
    if (row.disqualified_reason != null) changed.push(`disqualified_reason=${row.disqualified_reason}`);
    if (row.listing_id !== g.listing_id) changed.push("listing_id");
    if (row.marketplace !== g.marketplace) changed.push("marketplace");
    if (String(row.card_tcgplayer_id) !== String(g.card_tcgplayer_id)) changed.push("card_tcgplayer_id (identity already changed)");
    if (Number(row.watchlist_id) !== Number(g.watchlist_id)) changed.push("watchlist_id");
    if (row.title !== g.title) changed.push("title");
    if (liveNumber !== c.storedIdentity.catalogueNumber) changed.push(`catalogue number now ${liveNumber}`);
    if (!(letters.length === 1 && letters[0] === c.titleLetter && c.titleLetter !== c.catalogueLetter)) changed.push(`title letter evidence now [${letters.join(",")}]`);
    if (changed.length) return { ...base, current, decision: "skip", why: `changed since review: ${changed.join(", ")}` };
    return { ...base, current, decision: "quarantine", mutation: { set: { disqualified_reason: QUARANTINE_REASON }, guard: g } };
  });
}

export async function applyQuarantine(db, plan, { confirm, priorOut, now = new Date().toISOString() }) {
  const targets = plan.filter((p) => p.decision === "quarantine");
  if (Number(confirm) !== targets.length) throw new Error(`--confirm=${confirm} does not match the ${targets.length} eligible rows; nothing written`);
  const prior = {
    reason: QUARANTINE_REASON,
    appliedAt: now,
    rows: targets.map((t) => ({ dealId: t.dealId, ebayListingId: t.ebayListingId, title: t.title, prior_disqualified_reason: t.current.disqualifiedReason, prior_is_active: t.current.isActive })),
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
      .eq("watchlist_id", g.watchlist_id)
      .eq("title", g.title)
      .select("id");
    const n = error ? 0 : (data ?? []).length;
    written += n;
    results.push({ dealId: t.dealId, updated: n, error: error?.message ?? null });
  }
  return { expected: targets.length, written, results, prior };
}

export async function rollbackQuarantine(db, prior, { confirm }) {
  if (Number(confirm) !== prior.rows.length) throw new Error(`--confirm=${confirm} does not match the ${prior.rows.length} rows in the prior-values file; nothing written`);
  let restored = 0;
  const results = [];
  for (const r of prior.rows) {
    const { data, error } = await db
      .from("deals")
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

// cache-retire-r1 - after a successful write, queue the affected surfaces
// (lists, All deals chunk, set, species, the deal's own page) for the
// sweep-stale-deals cron to expire; scripts cannot expire Next caches
// themselves. Only rows actually written are queued.
export async function queueSurfaceInvalidation(db, manifest, dealIds, source) {
  const L = require(join(REPO, "lib", "listingAvailability.js"));
  const byId = new Map(manifest.candidates.map((c) => [Number(c.dealId), c]));
  const rows = [...new Set(dealIds.map(Number))]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((c) => ({ id: c.dealId, marketplace: c.marketplace, card_name: c.storedIdentity.cardName, card_set: c.storedIdentity.cardSet }));
  const plan = L.surfaceInvalidationPlan(rows, { dealPages: true });
  return L.queueCacheInvalidation(db, plan.tags, { source });
}

// The database write succeeded but no invalidation was queued: say so plainly.
const CACHE_NOT_QUEUED = (error) =>
  `WARNING: the database change was written, but cache invalidation was NOT queued (${error ?? "unknown error"}). ` +
  "Affected pages will not update promptly; they refresh only when their normal cache windows expire (up to about an hour).";

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
    const restoredIds = out.results.filter((r) => r.restored > 0).map((r) => r.dealId);
    if (restoredIds.length) out.cacheInvalidation = await queueSurfaceInvalidation(db, manifest, restoredIds, "unown-identity-quarantine:rollback");
    console.log(JSON.stringify(out, null, 1));
    if (out.restored !== out.expected) process.exit(2);
    if (restoredIds.length && !out.cacheInvalidation?.queued) {
      console.error(CACHE_NOT_QUEUED(out.cacheInvalidation?.error));
      process.exit(3);
    }
    process.exit(0);
  }
  const plan = await planQuarantine(db, manifest);
  console.log(JSON.stringify(plan, null, 1));
  const q = plan.filter((p) => p.decision === "quarantine").length;
  console.log(`\nquarantine: ${q}   skip: ${plan.filter((p) => p.decision === "skip").length}   expected affected rows if applied: ${q}`);
  if (!has("apply")) {
    console.log("DRY RUN - no write made.");
    return;
  }
  const priorOut = arg("prior-out");
  if (!priorOut) throw new Error("--apply requires --prior-out=<file> for rollback");
  if (existsSync(priorOut)) throw new Error(`${priorOut} exists; refusing to overwrite a prior-values file`);
  const out = await applyQuarantine(db, plan, { confirm: arg("confirm"), priorOut });
  const writtenIds = out.results.filter((r) => r.updated > 0).map((r) => r.dealId);
  const cacheInvalidation = writtenIds.length ? await queueSurfaceInvalidation(db, manifest, writtenIds, "unown-identity-quarantine:apply") : null;
  console.log(JSON.stringify({ expected: out.expected, written: out.written, results: out.results, cacheInvalidation }, null, 1));
  if (out.written !== out.expected) process.exit(2);
  if (writtenIds.length && !cacheInvalidation?.queued) {
    console.error(CACHE_NOT_QUEUED(cacheInvalidation?.error));
    process.exit(3);
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

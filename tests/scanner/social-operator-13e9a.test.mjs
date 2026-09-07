// Phase 13E.9A - SOCIAL OPERATOR DASHBOARD.
//
// Pins the read-only operator surface:
//   * it is a CLI-generated STATIC file - not a route, not indexed, not in
//     any sitemap;
//   * the generated HTML carries <meta robots noindex> and leaks no
//     token / key / channel id / email;
//   * the script performs NO write action - no Buffer mutation, no eBay
//     Browse call, no outreach send, no batch approval, no planner / ledger
//     mutation; the only eBay symbol it touches is the free rate-limit read;
//   * pure derivations: quota state, per-item status (EXPIRED shown),
//     independent platform states, first-live readiness (never READY with a
//     failing gate), blocker list, stale-freshness blocker;
//   * unsupported / missing metrics render as "—", never a fake 0;
//   * the no-content state renders truthfully.
// No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  quotaState,
  statusForItem,
  platformSummary,
  firstLiveOverall,
  deriveBlockers,
  recoveryStateFromLog,
  QUOTA_RESERVE,
  QUOTA_HEALTHY_FLOOR,
} from "../../lib/social/operator.mjs";
import { renderHtml, SECRET_RE } from "../../scripts/socialDashboard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const SCRIPT = read("scripts/socialDashboard.mjs");
const OPMOD = read("lib/social/operator.mjs");

// a full synthetic dashboard-data object for renderHtml()
function fakeData(over = {}) {
  return {
    generated_at: "2026-09-07T00:00:00.000Z",
    read_only: true,
    summary: {
      date_brisbane: "Monday 7 September 2026",
      date_utc: "2026-09-07",
      fresh_social_content: 0,
      planned_placements: 0,
      queued: 0,
      published: 0,
      top_blocker: "PUBLISHING_DISABLED",
      quota_state: "RESERVE",
      quota_reset: "2026-09-07T07:00:00.000Z",
      first_live_readiness: "BLOCKED",
    },
    flags: { describe: "publish switch: disabled (default)  |  mode: DRY RUN (default)", rights_publishing: "DISABLED" },
    today: { snapshot_source: "fixture:tests/fixtures/social-deals.json", snapshot_is_fixture: true, snapshot_captured_at: "2026-09-06T05:18:10.320Z", items: [], unfilled: [], not_scheduled: [], mix: null, warnings: [], plan_counts: { PROPOSED: 0, ACCEPTED: 0, REJECTED: 0, EXPIRED: 0 } },
    platforms: {
      instagram: { label: "Instagram", role: "polished", planned_today: 0, queued: 0, published: 0, failed: 0, remaining_ceiling: 2, next_proposed_brisbane: null, connection_resolved: true },
      tiktok: { label: "TikTok", role: "discovery", planned_today: 0, queued: 0, published: 0, failed: 0, remaining_ceiling: 2, next_proposed_brisbane: null, connection_resolved: true },
      x: { label: "X", role: "alerts", planned_today: 0, queued: 0, published: 0, failed: 0, remaining_ceiling: 4, next_proposed_brisbane: null, connection_resolved: true },
      youtube: { label: "YouTube Shorts", role: "evergreen", planned_today: 0, queued: 0, published: 0, failed: 0, remaining_ceiling: 1, next_proposed_brisbane: null, connection_resolved: true },
    },
    quota: { state: "RESERVE", remaining: 230, limit: 5000, reset: "2026-09-07T07:00:00.000Z", reserve: 900, source: "live", waiter_last_line: "04:30 quota=230" },
    freshness: { available: true, active_deals: 657, freshest_hours: 10.6, within_1h: 0, within_3h: 0, within_6h: 0, within_12h: 16, social_eligible: 0, ceiling_hours: 6 },
    image_recovery: { state: "WAITING", last_line: "04:37 quota=230", imageless_active_rows: 11 },
    outreach: [
      { name: "packz", status: "QUEUED", queued_at: "2026-09-06T23:47:08.521Z", sent_at: null },
      { name: "pokemonpricetracker", status: "QUEUED", queued_at: "2026-09-06T23:47:27.692Z", sent_at: null },
    ],
    metrics: { anything_published: false, state: "NOT_AVAILABLE_YET", per_placement: [] },
    first_live: {
      gates: {
        fresh_candidate: { ok: false, detail: "none" },
        batch_created: { ok: false, detail: "none" },
        owner_approved: { ok: false, detail: "no approved batch" },
        publishing_switch: { ok: false, detail: "rights=DISABLED" },
        live_mode: { ok: false, detail: "dry_run=true" },
        epn_classification: { ok: false, detail: "unset" },
        provider_auth: { ok: true, detail: "buffer" },
        channel_mapping: { ok: true, detail: "4/4 resolved" },
        media_hosted: { ok: true, detail: "4 verified" },
        fact_drift: { ok: true, detail: "n/a" },
        ready_to_send: { ok: false, detail: "" },
      },
      overall: "BLOCKED",
    },
    blockers: [{ code: "PUBLISHING_DISABLED", detail: "rights.publishing=DISABLED" }],
    review_pack: null,
    commands: { plan: "npm run social:plan -- today", send: "DISABLED" },
    ...over,
  };
}

// ---- static / not-indexable / no route ------------------------

test("13E.9A-1. the dashboard is a CLI-generated STATIC file - no route, no sitemap entry", () => {
  // no app route for an operator dashboard
  for (const p of ["app/operator", "app/dashboard", "app/social-operator", "app/admin/social"]) {
    assert.ok(!existsSync(join(ROOT, p)), `${p} route should not exist`);
  }
  // the script writes only into .social-preview/ (a gitignored tree)
  assert.match(SCRIPT, /\.social-preview[\\/]+operator-dashboard/);
  // nothing references it in the sitemap
  for (const f of ["app/sitemap.xml/route.js", "app/sitemap.js", "lib/sitemap.js"]) {
    if (existsSync(join(ROOT, f))) assert.doesNotMatch(read(f), /operator-dashboard|social-operator|social\/dashboard/i);
  }
});

test("13E.9A-2. the generated HTML is noindex and leaks no token / key / channel id / email", () => {
  const html = renderHtml(fakeData());
  assert.match(html, /<meta name="robots" content="noindex[^"]*">/);
  assert.doesNotMatch(html, SECRET_RE);
  // no Buffer channel ids (they start 6a9e0… in channels.json) and no email addresses
  assert.doesNotMatch(html, /6a9e0[0-9a-f]{6,}/);
  assert.doesNotMatch(html, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  // the renderer's own guard throws if a secret ever appears
  assert.throws(() => renderHtml(fakeData({ commands: { leak: "BUFFER_ACCESS_TOKEN=abc" } })), /secret-shaped/);
});

// ---- read-only guarantees (source scan) ---------------------

test("13E.9A-3. the dashboard script performs NO write action", () => {
  const src = SCRIPT.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const MUTATIONS = /\.createPost\s*\(|\.updatePost\s*\(|\.deletePost\s*\(|saveLedger\s*\(|savePlans\s*\(|saveBatches\s*\(|saveHostedAssets\s*\(|savePostHistory\s*\(|applyProviderAccept\s*\(|applyProviderReject\s*\(|applyProviderEvidence\s*\(|approveBatch\s*\(|\bapprove\s*\(|markReady\s*\(|\.from\([^)]*\)\.(insert|update|upsert|delete)\s*\(/;
  assert.doesNotMatch(src, MUTATIONS, "dashboard script contains a write/mutation call");
});

test("13E.9A-4. no Buffer mutation, no eBay Browse, no outreach send imports", () => {
  const src = SCRIPT.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // eBay: only the free rate-limit read, never a Browse search
  assert.doesNotMatch(src, /searchListings|searchNewlyListed|getItemsByLegacyIds|searchNewlyListed/);
  assert.match(src, /getBrowseRateLimit/); // the one allowed eBay symbol
  // outreach: no provider / send path
  assert.doesNotMatch(src, /from ["'][^"']*outreach\/provider|cmdSend\s*\(|applySyncResult\s*\(/);
  // provider is only probed for isConfigured(), never called to post
  assert.doesNotMatch(src, /PROVIDER\.(createPost|listChannels|getPostStatus)|provider\.createPost/);
  // no image-recovery trigger
  assert.doesNotMatch(src, /_screenDealImages|--recover|_recoverWhenQuota\.sh/);
});

test("13E.9A-5. quota read is the non-Browse Developer-Analytics rate-limit read", () => {
  // reused from lib/ebay.js exactly like app/api/admin/discovery-health and _waitForQuota.sh
  assert.match(SCRIPT, /import\(["']\.\.\/lib\/ebay\.js["']\)/);
  assert.match(SCRIPT, /getBrowseRateLimit\(\)/);
  assert.match(SCRIPT, /NOT a Browse call/);
});

// ---- pure derivations -------------------------------------

test("13E.9A-6. quotaState maps remaining to HEALTHY / LOW / RESERVE / RESET_PENDING / UNKNOWN", () => {
  assert.equal(quotaState(4000), "HEALTHY");
  assert.equal(quotaState(QUOTA_HEALTHY_FLOOR), "HEALTHY");
  assert.equal(quotaState(1200), "LOW");
  assert.equal(quotaState(QUOTA_RESERVE), "LOW");
  assert.equal(quotaState(230), "RESERVE");
  assert.equal(quotaState(0), "RESET_PENDING");
  assert.equal(quotaState(null), "UNKNOWN");
  assert.equal(quotaState("nope"), "UNKNOWN");
});

test("13E.9A-7. an EXPIRED plan is shown as EXPIRED; a ledger row wins over a plan state", () => {
  assert.equal(statusForItem({ planState: "EXPIRED" }), "EXPIRED");
  assert.equal(statusForItem({ planState: "EXPIRED", ledgerRow: { status: "QUEUED" } }), "EXPIRED"); // expiry is authoritative
  assert.equal(statusForItem({ planState: "PROPOSED", ledgerRow: { status: "APPROVED" } }), "APPROVED");
  assert.equal(statusForItem({ planState: "REJECTED" }), "UNAVAILABLE");
  assert.equal(statusForItem({}), "PROPOSED");
});

test("13E.9A-8. platform states are computed independently per service", () => {
  const ig = platformSummary({ label: "Instagram", planned: [{ time_utc: "t1" }, { time_utc: "t2" }], ledgerRows: [{ status: "QUEUED" }], ceiling: 2 });
  const x = platformSummary({ label: "X", planned: [], ledgerRows: [{ status: "FAILED" }, { status: "PUBLISHED" }], ceiling: 4, resolved: true });
  assert.equal(ig.planned_today, 2);
  assert.equal(ig.remaining_ceiling, 0);
  assert.equal(ig.queued, 1);
  assert.equal(ig.connection_resolved, false);
  assert.equal(x.planned_today, 0);
  assert.equal(x.remaining_ceiling, 4);
  assert.equal(x.failed, 1);
  assert.equal(x.published, 1);
  assert.equal(x.connection_resolved, true);
  // one service's rows never affect another
  assert.equal(ig.failed, 0);
});

test("13E.9A-9. first-live readiness NEVER shows READY while any infra gate fails", () => {
  const allOk = Object.fromEntries(
    ["fresh_candidate", "batch_created", "owner_approved", "publishing_switch", "live_mode", "epn_classification", "provider_auth", "channel_mapping", "media_hosted", "fact_drift", "ready_to_send"].map((k) => [k, { ok: true }])
  );
  assert.equal(firstLiveOverall(allOk), "READY FOR LIVE SEND");

  // any infra gate failing -> BLOCKED, never READY
  for (const bad of ["fresh_candidate", "provider_auth", "channel_mapping", "media_hosted"]) {
    const g = JSON.parse(JSON.stringify(allOk));
    g[bad] = { ok: false };
    g.ready_to_send = { ok: false };
    assert.equal(firstLiveOverall(g), "BLOCKED", `${bad} failing must BLOCK`);
  }

  // infra ready, only the owner's launch action pending -> READY FOR OWNER APPROVAL
  const launchPending = JSON.parse(JSON.stringify(allOk));
  for (const k of ["batch_created", "owner_approved", "publishing_switch", "live_mode", "epn_classification"]) launchPending[k] = { ok: false };
  launchPending.ready_to_send = { ok: false };
  assert.equal(firstLiveOverall(launchPending), "READY FOR OWNER APPROVAL");
});

test("13E.9A-10. the stale-freshness blocker appears truthfully when 0 rows are socially eligible", () => {
  const b = deriveBlockers({ stale_source: true, stale_detail: "0 socially-eligible; freshest 10h vs 6h" });
  assert.ok(b.some((x) => x.code === "STALE_SOURCE"));
  const none = deriveBlockers({ stale_source: false });
  assert.ok(!none.some((x) => x.code === "STALE_SOURCE"));
  // rendered banner explains social starvation is a freshness problem
  const html = renderHtml(fakeData());
  assert.match(html, /Social starvation is caused by verification freshness/i);
});

test("13E.9A-11. blocker list is deterministic and ordered most-fundamental first", () => {
  const b = deriveBlockers({
    publishing_disabled: true, epn_unclassified: true, no_fresh_live_content: true,
    no_batch: true, quota_state: "RESERVE", quota_remaining: 230,
  });
  const codes = b.map((x) => x.code);
  assert.deepEqual(codes.slice(0, 3), ["PUBLISHING_DISABLED", "EPN_UNCLASSIFIED", "NO_FRESH_LIVE_CONTENT"]);
  assert.ok(codes.includes("QUOTA_RESERVE"));
  assert.deepEqual(deriveBlockers({}), []);
});

test("13E.9A-12. recovery waiter state comes from the log tail, not process control", () => {
  assert.equal(recoveryStateFromLog("04:37 quota=230"), "WAITING");
  assert.equal(recoveryStateFromLog("QUOTA RECOVERED - resume"), "COMPLETE");
  assert.equal(recoveryStateFromLog("applying --recover"), "RUNNING");
  assert.equal(recoveryStateFromLog(null), "UNKNOWN");
  // the script only READS the log file, never spawns the recovery process
  assert.doesNotMatch(SCRIPT, /spawn\(|execSync\(|child_process/);
});

// ---- render: metrics / no-content ------------------------

test("13E.9A-13. unsupported / missing metrics render as an em-dash, never a fake 0", () => {
  const withPub = fakeData({
    metrics: {
      anything_published: true,
      state: "LIVE",
      per_placement: [
        { platform: "instagram_reel", content_id: "c1", published_at: "2026-09-08T00:00:00Z", platform_post_url: null, metrics: { views: 4210, likes: 0 /* real 0 */, clicks: null /* unsupported */ }, last_metrics_sync: null },
      ],
    },
  });
  const html = renderHtml(withPub);
  assert.match(html, />4210</); // a real reading
  assert.match(html, />0</); // a REAL zero is shown as 0
  assert.match(html, /—/); // clicks (unsupported on IG) shows as em-dash
  // nothing published -> NOT_AVAILABLE_YET, no numbers at all
  const html0 = renderHtml(fakeData());
  assert.match(html0, /NOT_AVAILABLE_YET/);
  assert.match(html0, /never a fake 0/);
});

test("13E.9A-14. the no-content state renders truthfully as a clean state, not a failure", () => {
  const html = renderHtml(fakeData());
  assert.match(html, /NO QUALIFYING CONTENT/);
  assert.match(html, /clean state, not a failure/i);
  // the fixture snapshot is flagged as NOT fresh live data
  assert.match(html, /FIXTURE — not fresh live data/);
});

test("13E.9A-15. the operator page raw HTML never contains a bearer token / service key / JWT", () => {
  // exercise several data shapes
  for (const d of [fakeData(), fakeData({ quota: { state: "HEALTHY", remaining: 4000, limit: 5000, reset: null, reserve: 900, source: "live" } }), fakeData({ metrics: { anything_published: true, state: "LIVE", per_placement: [{ platform: "x_post", content_id: "c", published_at: "t", platform_post_url: "https://x.com/pkmdealfinder/status/1", metrics: {}, last_metrics_sync: null }] } })]) {
    const html = renderHtml(d);
    assert.doesNotMatch(html, SECRET_RE);
    assert.doesNotMatch(html, /Bearer\s+[A-Za-z0-9._-]{12,}/);
  }
});

test("13E.9A-16. the pure operator module reads no file and calls no network", () => {
  const src = OPMOD.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /readFileSync|writeFileSync|fetch\(|import\(|require\(|supabase|createPost/);
});

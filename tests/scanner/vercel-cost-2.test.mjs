// VERCEL-COST-2 (27 Sep 2026) - the cost-audit fixes, pinned. See
// docs/vercel-cost-audit.md for the measured baseline each one answers.
//
//   node --test tests/scanner/vercel-cost-2.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const { stableStringify, sameJson } = await import(new URL("../../lib/stableStringify.js", import.meta.url).href);
const { cappedLogger } = await import(new URL("../../lib/runtimeLog.js", import.meta.url).href);
const jimmy = require("../../lib/jimmyFeed.js");

test("VC2-1 builds: vercel.json has the ignore command and the script fails OPEN", () => {
  const vj = JSON.parse(read("vercel.json"));
  assert.equal(vj.ignoreCommand, "bash scripts/vercelIgnoreBuild.sh");
  const sh = read("scripts/vercelIgnoreBuild.sh");
  assert.match(sh, /VERCEL_GIT_PREVIOUS_SHA/, "judges the whole pushed range, not only HEAD^");
  // every early exit on doubt is a BUILD (exit 1); only the all-skippable path exits 0
  assert.equal((sh.match(/exit 1/g) ?? []).length >= 5, true);
  assert.equal((sh.match(/exit 0/g) ?? []).length, 1);
  assert.match(sh, /skip_re='\^\(docs\/\|tests\/\|scripts\/\|supabase\/\|\\\.github\//, "docs, tests, scripts, supabase, .github skip");
  assert.doesNotMatch(sh, /\|app\/|\|lib\/|\|components\/|\|public\//, "build inputs are never skippable");
  // the deployment upload leaves the QA screenshots and docs behind, but never the ignore script's folder
  const vi = read(".vercelignore");
  for (const dir of ["_mobileqa", "_homeshots", "_p021qa", "docs", "tests"]) assert.match(vi, new RegExp(`^${dir}$`, "m"));
  assert.doesNotMatch(vi, /^scripts$/m);
});

test("VC2-2 images: every eBay listing photo renders through DealImage, never next/image directly; no quality outside the configured set", () => {
  for (const f of ["components/BoardDealCard.js", "components/HomeBudgetDeals.js", "components/SealedDealCard.js", "app/sealed-deals/[id]/page.js"]) {
    const src = read(f);
    assert.match(src, /import DealImage from "@\/components\/DealImage";/, `${f} uses DealImage`);
    assert.doesNotMatch(src, /import Image from "next\/image"/, `${f} has no direct next/image`);
  }
  const cfg = read("next.config.mjs");
  const qualities = JSON.parse(/qualities:\s*(\[[^\]]+\])/.exec(cfg)[1]);
  const offenders = [];
  const walk = (dir) => {
    for (const name of require("node:fs").readdirSync(join(REPO, dir))) {
      const p = `${dir}/${name}`;
      if (require("node:fs").statSync(join(REPO, p)).isDirectory()) walk(p);
      else if (/\.jsx?$/.test(name)) {
        for (const m of read(p).matchAll(/quality=\{(\d+)\}/g)) if (!qualities.includes(Number(m[1]))) offenders.push(`${p}: ${m[1]}`);
      }
    }
  };
  walk("app");
  walk("components");
  assert.deepEqual(offenders, [], "a quality outside next.config qualities is a 400 from the optimizer");
  assert.match(read("components/ChecklistTable.js"), /width=\{52\} height=\{73\} quality=\{75\}/, "fixed-size thumb: one variant, not six");
});

test("VC2-3 catalogue refresh: authenticated, change-gated, expires its own tag and not the deal lists", () => {
  const src = read("app/api/refresh-catalog/route.js");
  assert.match(src, /export async function GET\(request\)/);
  assert.match(src, /Bearer \$\{process\.env\.CRON_SECRET\}/, "CRON_SECRET like every other cron route");
  assert.match(src, /import \{ CATALOG_SNAPSHOT_TAG \} from "@\/lib\/listingAvailability";/);
  assert.doesNotMatch(src, /revalidateTag\(DEAL_LISTS_TAG|import \{[^}]*DEAL_LISTS_TAG/, "the broad list tag is no longer expired by the catalogue refresh");
  assert.match(src, /if \(dealWrite\.changed\.length > 0\) \{\s*try \{\s*revalidateTag\(CATALOG_SNAPSHOT_TAG, \{ expire: 0 \}\)/, "expired only when a deal-derived aggregate changed");
  assert.match(src, /sameJson\(stored\.get\(k\), next\[k\]\)/, "key-order-insensitive comparison against the stored row");
  assert.match(src, /\.update\(\{ updated_at \}\)\.in\("kind", unchanged\)/, "unchanged kinds still get a fresh updated_at (SNAPSHOT_MAX_AGE_MS)");
  const deals = read("lib/deals.js");
  for (const key of ['\\["sets-index"\\]', '\\["card-hubs"\\]', '\\["species-hubs"\\]']) {
    const idx = deals.search(new RegExp(key));
    assert.ok(idx > 0, key);
    assert.match(deals.slice(idx, idx + 260), /tags: \[CATALOG_SNAPSHOT_TAG\]/, `${key} carries the snapshot tag`);
  }
  assert.match(read("lib/listingAvailability.js"), /const CATALOG_SNAPSHOT_TAG = "catalog-snapshot";/);
  assert.match(read("app/api/check-alerts/route.js"), /Bearer \$\{process\.env\.CRON_SECRET\}/, "check-alerts is authenticated too");
});

test("VC2-4 stable JSON: key order and undefined members do not count as change; arrays do", () => {
  assert.equal(sameJson({ a: 1, b: { c: [1, 2], d: "x" } }, { b: { d: "x", c: [1, 2] }, a: 1 }), true);
  assert.equal(sameJson({ a: 1, u: undefined }, { a: 1 }), true);
  assert.equal(sameJson([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }]), false, "order is data in a ranked list");
  assert.equal(sameJson({ a: 1 }, { a: 2 }), false);
  assert.equal(stableStringify({ z: 1, a: [3, { y: 2, x: 1 }] }), '{"a":[3,{"x":1,"y":2}],"z":1}');
});

test("VC2-5 the board host block fails fast: two refusals with nothing read end the walk", async () => {
  const hits = [];
  const fetchImpl = async (url) => {
    hits.push(url);
    return { ok: false, status: 403, text: async () => "" };
  };
  const out = await jimmy.fetchJimmyFeed({ full: true, pace: 0, fetchImpl });
  assert.equal(hits.length, 2, "144 planned lists, 2 requested");
  assert.equal(out.pages, 2);
  assert.equal(out.planned > 100, true);
  assert.equal(out.stoppedBecause, "address_blocked_after_2_lists");
  assert.equal(out.listings.length, 0);
  assert.match(out.error, /HTTP 403/);
  // a healthy host is walked in full
  const ok = await jimmy.fetchJimmyFeed({ pace: 0, fetchImpl: async () => ({ ok: true, status: 200, text: async () => "<html></html>" }) });
  assert.equal(ok.pages, ok.planned);
  assert.equal(ok.stoppedBecause, null);
  // one refusal among successes does not stop it
  let n = 0;
  const mixed = await jimmy.fetchJimmyFeed({ pace: 0, fetchImpl: async () => (++n % 5 === 0 ? { ok: false, status: 403 } : { ok: true, status: 200, text: async () => "<html></html>" }) });
  assert.equal(mixed.pages, mixed.planned);
});

test("VC2-6 logging: per-item lines are capped and counted, jobs end with one summary line, chatter is debug-only", () => {
  const seen = [];
  const orig = console.error;
  console.error = (...a) => seen.push(a.join(" "));
  try {
    const log = cappedLogger("x", { cap: 2 });
    for (let i = 0; i < 10; i++) log.log("boom", i);
    assert.equal(seen.length, 2, "first two only");
    assert.match(seen[1], /suppressed/);
    assert.equal(log.count(), 10);
    log.reset();
    assert.equal(log.count(), 0);
  } finally {
    console.error = orig;
  }
  const rd = read("app/api/refresh-deals/route.js");
  assert.equal((rd.match(/console\.error\(`Failed to upsert deal/g) ?? []).length, 0, "per-listing upsert errors go through the capped logger");
  assert.equal((rd.match(/console\.error\(`Graded lookup failed/g) ?? []).length, 0);
  assert.doesNotMatch(rd, /console\.warn\(\s*`reference:price_unverified/);
  assert.equal((rd.match(/logRunSummary\("refresh_deals_complete"/g) ?? []).length, 2, "one completion line on the sweep path and one on the allocated/manual path");
  const sw = read("app/api/sync-watchlist/route.js");
  assert.doesNotMatch(sw, /console\.log\(`\[sync-watchlist\]/, "no per-set console line");
  assert.match(sw, /logRunSummary\("sync_watchlist_complete"/);
  assert.match(read("lib/searchEngine.js"), /debugLog\(\s*"\[searchEngine\]"/, "the per-search timing line is debug-only");
  assert.doesNotMatch(read("lib/searchEngine.js"), /console\.log\(\s*"\[searchEngine\]"/);
  assert.match(read("lib/runtimeLog.js"), /process\.env\.LOG_DEBUG/);
});

test("VC2-7 outreach worker stops before any network call while automation is off", () => {
  const src = read("lib/outreach/automation/worker.mjs");
  const gate = src.search(/report\.outcome = "BLOCKED";\r?\n\s*return report;/);
  const control = src.indexOf('store.getJson("state/control.json"');
  const caps = src.indexOf("client.capabilities(");
  assert.ok(gate > 0 && gate < control && gate < caps, "the disabled return precedes the control read and the capability probes");
});

test("VC2-8 user-facing dynamic routes carry an explicit duration ceiling", () => {
  for (const f of ["alerts", "card-search", "deals-page", "sealed-catalog", "rates", "newsletter", "newsletter/subscribe", "export-subscribers"]) {
    assert.match(read(`app/api/${f}/route.js`), /export const maxDuration = \d+;/, f);
  }
  assert.equal(existsSync(join(REPO, ".vercelignore")), true);
});

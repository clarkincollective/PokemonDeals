#!/usr/bin/env node
// Phase 13E.7A - SOCIAL PERFORMANCE CLI (READ-ONLY MEASUREMENT).
//
//   npm run social:metrics -- sync            poll the provider for every PUBLISHED placement, append a snapshot
//   npm run social:metrics -- report          concise per-placement performance report (§16)
//   npm run social:metrics -- baseline        show the pre-live baseline (all NOT_AVAILABLE_YET)
//
// This script CANNOT publish, schedule, edit, delete, comment, reply, or DM.
// It only ever calls the provider's READ methods: getPostMetrics,
// getPostStatus, getAggregatedMetrics. tests/scanner/social-performance-13e7a
// asserts this file references no mutating provider method.
//
// Truthfulness rules (enforced in lib/social/distribution/metrics.mjs):
//   * a metric the provider did not return  -> null   (never 0)
//   * a metric the platform cannot report   -> "—" / UNSUPPORTED   (never 0)
//   * a provider error on sync              -> keep the last good snapshot,
//                                             record the error, write no zeros
//   * nothing published yet                 -> NOT_AVAILABLE_YET   (never 0)

import { existsSync, readFileSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { loadLedger, saveLedger, findJob } from "../lib/social/distribution/ledger.mjs";
import { loadBatches } from "../lib/social/distribution/batch.mjs";
import { getSocialProvider } from "../lib/social/providers/index.mjs";
import {
  normalizeProviderMetrics,
  buildSnapshot,
  attachSnapshot,
  baselineMetrics,
  emptyMetrics,
  computeKpis,
  engagementCount,
  REPORTING_WINDOWS,
  snapshotForWindow,
  availableWindows,
  serviceOf,
  reportCell,
  METRIC_KEYS,
} from "../lib/social/distribution/metrics.mjs";
import path from "node:path";

const PROVIDER = getSocialProvider();
const ATTR_IMPORT = path.join(process.cwd(), ".social-preview", "metrics", "attribution-import.json");

function die(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}

// Optional owner-provided export of website-side attribution, keyed by
// utm_content (= content_id). Lets the KPI columns that need a website
// denominator fill in WITHOUT any scraping or analytics API wiring here.
// Shape: { "<content_id>": { attributed_visits: <int>, affiliate_outbound: <int> } }
function loadAttributionImport() {
  if (!existsSync(ATTR_IMPORT)) return {};
  try {
    return JSON.parse(readFileSync(ATTR_IMPORT, "utf8")) ?? {};
  } catch {
    return {};
  }
}

function banner() {
  console.log("\n  === social:metrics — Phase 13E.7A (READ-ONLY) ===");
  console.log(`  provider = ${PROVIDER.name}${PROVIDER.isConfigured() ? " (configured)" : " (not configured)"}\n`);
}

function age(fromIso, now = Date.now()) {
  if (!fromIso) return "—";
  const h = (now - new Date(fromIso).getTime()) / 3600_000;
  if (!Number.isFinite(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// ---- sync ---------------------------------------------------------
async function cmdSync() {
  banner();
  if (!PROVIDER.isConfigured()) die("no provider configured (BUFFER_ACCESS_TOKEN) — cannot read metrics.");
  const ledger = loadLedger();
  const targets = ledger.filter((r) => ["PUBLISHED", "QUEUED"].includes(r.status) && r.provider_ref);
  if (!targets.length) {
    console.log("  no PUBLISHED/QUEUED placements with a provider_ref — nothing to sync.");
    console.log("  (before the first live publish this is expected; the baseline is NOT_AVAILABLE_YET.)\n");
    return;
  }
  for (const row of targets) {
    const svc = serviceOf(row.platform);
    const r = await PROVIDER.getPostMetrics(row.provider_ref);
    if (!r?.ok) {
      attachSnapshot(row, buildSnapshot({ platform: row.platform, error: { reason: r?.reason ?? "unknown", detail: r?.detail ?? "" } }));
      console.log(`  ${row.platform}: sync error — ${r?.reason ?? "?"} (last good snapshot retained, no zeros written)`);
      continue;
    }
    const norm = normalizeProviderMetrics(r.metrics, row.platform);
    const snap = buildSnapshot({
      platform: row.platform,
      metrics: norm.metrics,
      unsupported: norm.unsupported,
      units: norm.units,
      metricsUpdatedAt: r.metricsUpdatedAt,
    });
    attachSnapshot(row, snap);
    const reportedList = norm.reported.length ? norm.reported.join(", ") : "(provider returned no metric values yet)";
    console.log(`  ${row.platform}: snapshot @ ${snap.captured_at}  reported: ${reportedList}`);
  }
  saveLedger(ledger);
  console.log(`\n  ${targets.length} placement(s) synced. READ-ONLY — nothing was published, scheduled, or modified at the provider.\n`);
}

// ---- report ------------------------------------------------------
function fmtKpi(k) {
  if (!k || k.value == null) return "·";
  const v = k.value <= 1 ? `${(k.value * 100).toFixed(1)}%` : k.value.toFixed(2);
  return v;
}

function cmdReport() {
  banner();
  const ledger = loadLedger();
  const batches = loadBatches();
  const attrImport = loadAttributionImport();
  const now = Date.now();

  const rows = ledger.filter((r) => r.provider_ref || ["PUBLISHED", "QUEUED", "APPROVED", "READY"].includes(r.status));
  if (!rows.length) {
    console.log("  no placements in the ledger yet.\n");
    return;
  }

  console.log("  PLATFORM      CONTENT / GOAL                         PUBLISHED  AGE    VIEWS  IMPR   ENG    ENG%    CLICKS  SITE  AFF   STATUS");
  console.log("  " + "-".repeat(122));
  for (const r of rows) {
    const published = r.published_at ?? null;
    const snaps = Array.isArray(r.metrics_snapshots) ? r.metrics_snapshots : [];
    const latest = snaps[snaps.length - 1] ?? null;
    const m = published ? latest?.metrics ?? emptyMetrics() : baselineMetrics();
    const unsup = latest?.unsupported ?? [];
    const attr = attrImport[r.content_id] ?? {};
    const kpis = published
      ? computeKpis(m, { attributedVisits: attr.attributed_visits ?? null, affiliateOutbound: attr.affiliate_outbound ?? null })
      : null;
    const eng = published ? engagementCount(m) : "n/a";

    const cell = (key) => (published ? reportCell(m[key], key, unsup) : "n/a");
    const line = [
      (r.platform ?? "?").padEnd(13),
      `${r.creative_family ?? "?"} / ${r.content_goal ?? "?"}`.slice(0, 37).padEnd(38),
      (published ? new Date(published).toISOString().slice(0, 10) : "—").padEnd(10),
      age(published, now).padEnd(6),
      cell("views").padEnd(6),
      cell("impressions").padEnd(6),
      String(eng ?? "·").padEnd(6),
      (published ? fmtKpi(kpis.engagement_rate) : "n/a").padEnd(7),
      cell("clicks").padEnd(7),
      (published ? fmtKpi(kpis.website_ctr) : "n/a").padEnd(5),
      (published ? fmtKpi(kpis.affiliate_outbound_rate) : "n/a").padEnd(5),
      r.status,
    ].join(" ");
    console.log("  " + line);
    if (published && kpis) {
      console.log(`                eng basis: ${kpis.engagement_rate.basis ?? "—"}   windows with data: ${availableWindows(snaps, published, now).map((w) => w.key).join(", ") || "none yet"}`);
    }
    if (r.metrics_error) console.log(`                last sync error: ${r.metrics_error.reason} @ ${r.metrics_error.at} (last good snapshot retained)`);
    if (r.platform_post_url) console.log(`                live post: ${r.platform_post_url}`);
    if (r.cta_attribution?.utm_content) {
      const a = r.cta_attribution;
      console.log(`                cta attribution: utm_source=${a.utm_source} utm_medium=${a.utm_medium} utm_campaign=${a.utm_campaign} utm_content=${a.utm_content}`);
    }
  }
  console.log("");
  console.log("  legend:  —  metric not supported on this platform     ·  no reading yet (NOT zero)     n/a  not published yet");
  console.log("  SITE = attributed site visits / impressions   AFF = affiliate outbound / attributed site visits");
  console.log("  (SITE / AFF need an owner export at .social-preview/metrics/attribution-import.json keyed by content_id;");
  console.log("   that export is produced from PostHog filtered on utm_content — see docs/social-performance.md.)");
  console.log(`\n  batches: ${batches.length}   placements shown: ${rows.length}\n`);
}

function cmdBaseline() {
  banner();
  console.log("  FIRST-LIVE BASELINE (§15) — nothing has published, so every platform metric is:\n");
  const b = baselineMetrics();
  for (const k of METRIC_KEYS) console.log(`    ${k.padEnd(24)} ${b[k]}`);
  console.log("\n  NOT_AVAILABLE_YET is deliberately distinct from 0. A real 0 only appears once the");
  console.log("  provider actually reports 0 for a live post.\n");
}

async function main() {
  const [cmd] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  switch (cmd) {
    case "sync":
      return cmdSync();
    case "report":
    case undefined:
      return cmdReport();
    case "baseline":
      return cmdBaseline();
    default:
      die(`unknown command "${cmd}". one of: sync, report, baseline`);
  }
}

main().catch((e) => die(e && e.message ? e.message : String(e)));

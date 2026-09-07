#!/usr/bin/env node
// Phase VERCEL-COST-1 - `npm run infra:vercel-cost`
//
// A repeatable READ-ONLY cost-surface audit. It reports the levers this
// repo controls (cron cadence, ISR windows, image-optimization config)
// and the recommended Vercel Spend Management thresholds.
//
// LIVE billing numbers: this environment has no Vercel billing API token
// and no `vercel` CLI. To pull the real cycle spend + per-product
// breakdown, run `vercel` locally:
//   npx vercel login
//   npx vercel   (link the project)
//   # then open the Usage dashboard, or:
//   npx vercel billing            (if available on your CLI version)
// The dashboard is authoritative: Vercel -> <team> -> Usage.
//
// No secrets are printed.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

// ---- crons ------------------------------------------------------
const vjson = JSON.parse(read("vercel.json"));
const crons = vjson.crons ?? [];
function perDay(schedule) {
  // rough estimate for the common "* / N" and "M * * * *" shapes
  const [min, hr] = schedule.split(" ");
  let perHour = 1;
  if (min.startsWith("*/")) perHour = Math.floor(60 / Number(min.slice(2)));
  else if (min.includes(",")) perHour = min.split(",").length;
  let hours = 24;
  if (hr && hr !== "*") {
    if (hr.startsWith("*/")) hours = Math.floor(24 / Number(hr.slice(2)));
    else hours = hr.split(",").length;
  }
  return perHour * hours;
}
const cronRows = crons
  .map((c) => ({ path: c.path.split("?")[0], schedule: c.schedule, per_day: perDay(c.schedule) }))
  .sort((a, b) => b.per_day - a.per_day);
const cronInvocationsPerDay = cronRows.reduce((s, r) => s + r.per_day, 0);

// ---- ISR windows ---------------------------------------------
const isrGlob = [
  "app/page.js", "app/best-finds/page.js", "app/japanese-cards/page.js",
  "app/deals/page.js", "app/deals/[id]/page.js",
  "app/cards/page.js", "app/cards/[slug]/page.js",
  "app/pokemon/page.js", "app/pokemon/[slug]/page.js",
  "app/sets/page.js", "app/sets/[slug]/page.js",
  "app/sealed-deals/page.js", "app/sealed-deals/[id]/page.js",
  "app/market-data/page.js", "app/sitemap.xml/route.js", "app/sitemaps/[segment]/route.js",
];
const isrRows = isrGlob
  .filter((f) => existsSync(path.join(ROOT, f)))
  .map((f) => {
    const m = read(f).match(/export const revalidate = (\d+)/);
    return { route: f.replace(/^app/, "").replace(/\/page\.js$/, "").replace(/\/route\.js$/, "") || "/", revalidate_s: m ? Number(m[1]) : null };
  })
  .filter((r) => r.revalidate_s != null)
  .sort((a, b) => a.revalidate_s - b.revalidate_s);

// ---- image optimization config -----------------------------
const nc = read("next.config.mjs");
const grab = (re) => (nc.match(re)?.[1] ?? "").trim();
const image = {
  formats: grab(/formats:\s*(\[[^\]]*\])/),
  qualities: grab(/qualities:\s*(\[[^\]]*\])/),
  deviceSizes: grab(/deviceSizes:\s*(\[[^\]]*\])/),
  imageSizes: grab(/imageSizes:\s*(\[[^\]]*\])/),
  minimumCacheTTL_days: Number(grab(/minimumCacheTTL:\s*(\d+)/)) / 86400 || null,
  remote_hosts: [...nc.matchAll(/hostname:\s*"([^"]+)"/g)].map((m) => m[1]),
  ebay_unoptimized: /unoptimized=\{isEbayPhoto\}/.test(read("components/DealImage.js")),
};

// ---- variant-matrix ceiling -------------------------------
const nWidths = (image.deviceSizes.match(/\d+/g) ?? []).length || 8;
const nFormats = (image.formats.match(/image\//g) ?? []).length || 2;
const nQual = (image.qualities.match(/\d+/g) ?? []).length || 1;
const variantCeiling = nWidths * nFormats * nQual;

const report = {
  generated_at: new Date().toISOString(),
  note: "Cost-surface audit from the repo. LIVE billing numbers require the Vercel Usage dashboard / `vercel` CLI - see the file header.",
  crons: {
    count: crons.length,
    est_invocations_per_day: cronInvocationsPerDay,
    top: cronRows.slice(0, 8),
  },
  isr: { windows: isrRows },
  image_optimization: { ...image, variant_matrix_ceiling_per_source: variantCeiling },
  recommended_spend_management: {
    soft_alert_usd: 25,
    second_alert_usd: 50,
    hard_pause_usd: 100,
    where: "Vercel -> <team> Settings -> Billing -> Spend Management: set an amount + email/webhook alerts, and (Pro) a hard pause.",
    also_review: [
      "Observability Plus add-on - disable if not actively used (it multiplies captured events).",
      "Web Analytics event volume - custom `data-analytics-*` events all bill; keep only what you act on.",
      "Deploy frequency - each push to main is a production build; batch commits / use preview branches.",
    ],
  },
};

console.log(JSON.stringify(report, null, 2));

#!/usr/bin/env node
// STRIKING DISTANCE (2026-09-21). Free, read-only Search Console.
//
//   node scripts/seo/strikingDistance.mjs
//   node scripts/seo/strikingDistance.mjs --days=28 --min-impressions=5
//
// The cheapest ranking wins are not new pages. They are queries where a
// page Google already trusts sits just off the first result page: a small
// move is worth far more there than anywhere else, because click-through
// collapses between position 10 and position 11.
//
// This pulls query x page rows for the window, keeps the ones in the
// 8-25 band, and groups them by the page that earns them - so the output
// is a list of PAGES to improve, each with the queries it is close on,
// rather than a list of keywords with nowhere to put them.
//
// READ-ONLY: one searchAnalytics.query call. No Search Console change, no
// URL submission, no sitemap touch. Nothing is printed that identifies a
// person; Search Console query data is aggregated and anonymised at
// source, and rare queries are withheld by Google itself.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const CLIENT_PATH = join(ROOT, ".secrets", "gsc-oauth-client.json");
const TOKEN_PATH = join(ROOT, ".secrets", "gsc-token.json");
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const WMX = "https://www.googleapis.com/webmasters/v3";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const DAYS = Number(args.days ?? 28);
const MIN_IMPRESSIONS = Number(args["min-impressions"] ?? 3);
// The band. Below 8 is already page one and a move is worth less; beyond
// 25 is page three or worse, where "one small push" is not true.
const BAND = [8, 25];

const die = (m) => {
  console.error(`\n  x ${m}\n`);
  process.exit(1);
};
const readJson = (p, label) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    return die(`could not read ${label} (${p}): ${e.code ?? e.message}. Run: npm run gsc:auth`);
  }
};

async function accessToken() {
  const tok = readJson(TOKEN_PATH, "the saved token");
  if (tok.access_token && Number(tok.expiry_date) > Date.now() + 30_000) return tok.access_token;
  if (!tok.refresh_token) return die("saved token has no refresh_token - re-run: npm run gsc:auth");
  const raw = readJson(CLIENT_PATH, "the OAuth client");
  const c = raw.installed ?? raw.web ?? {};
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: tok.refresh_token, grant_type: "refresh_token" }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) return die(`token refresh failed: HTTP ${res.status} - re-run: npm run gsc:auth`);
  tok.access_token = json.access_token;
  tok.expiry_date = Date.now() + (Number(json.expires_in ?? 3600) - 60) * 1000;
  writeFileSync(TOKEN_PATH, JSON.stringify(tok, null, 2) + "\n", { mode: 0o600 });
  return tok.access_token;
}

async function gsc(path, body, token) {
  const res = await fetch(`${WMX}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) die(`HTTP ${res.status} ${json?.error?.message ?? ""}`.trim());
  return json;
}

const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
const path = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

async function main() {
  const token = await accessToken();
  const sites = await gsc("/sites", null, token);
  const mine = (sites.siteEntry ?? []).filter((e) => /(^|[:/.])pokemondealfinder\.com(\/|$)/i.test(e.siteUrl));
  if (mine.length === 0) return die("no pokemondealfinder.com property on this account");
  const site = (mine.find((e) => e.siteUrl.startsWith("sc-domain:")) ?? mine[0]).siteUrl;

  // Google lags ~2 days on complete data; end the window there rather
  // than reporting a half-filled final day as a decline.
  const endDate = day(2);
  const startDate = day(2 + DAYS);
  const rows =
    (
      await gsc(
        `/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
        { startDate, endDate, dimensions: ["query", "page"], rowLimit: 25000, dataState: "final" },
        token
      )
    ).rows ?? [];

  console.log(`Striking distance - ${site}`);
  console.log(`  window ${startDate} to ${endDate} (${DAYS} days), ${rows.length} query x page rows\n`);
  if (rows.length === 0) {
    console.log("  No rows. At this traffic level Google withholds rare queries entirely;");
    console.log("  that is a data-availability fact, not evidence of zero demand.");
    return;
  }

  // --grep=<substring>: does Search Console see this family of queries at
  // all? A term we have optimised for and get zero impressions on is a
  // different problem from one we rank badly for, and only this tells
  // them apart.
  if (args.grep) {
    const needle = String(args.grep).toLowerCase();
    const hits = rows.filter((r) => r.keys[0].toLowerCase().includes(needle));
    console.log(`  QUERIES CONTAINING "${needle}": ${hits.length}`);
    for (const r of hits.sort((a, b) => b.impressions - a.impressions).slice(0, 25)) {
      console.log(`      pos ${r.position.toFixed(1).padStart(6)}  ${String(r.impressions).padStart(4)} impr  ${r.clicks} clicks  ${r.keys[0]}  ->  ${path(r.keys[1])}`);
    }
    if (hits.length === 0) {
      console.log("      none. Google recorded no impression for this family in the window -");
      console.log("      the pages are not being shown at all, which is a visibility problem,");
      console.log("      not a ranking-position one.");
    }
    console.log("");
  }

  const inBand = rows.filter(
    (r) => r.position >= BAND[0] && r.position <= BAND[1] && (r.impressions ?? 0) >= MIN_IMPRESSIONS
  );

  const byPage = new Map();
  for (const r of inBand) {
    const p = path(r.keys[1]);
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p).push({ query: r.keys[0], impressions: r.impressions, clicks: r.clicks, position: r.position });
  }
  // Rank pages by the impressions they are leaving on the table, not by
  // how many queries they touch - one query at 400 impressions beats ten
  // at four.
  const pages = [...byPage.entries()]
    .map(([p, qs]) => ({ page: p, queries: qs.sort((a, b) => b.impressions - a.impressions), impressions: qs.reduce((s, q) => s + q.impressions, 0) }))
    .sort((a, b) => b.impressions - a.impressions);

  const totalImpr = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const bandImpr = inBand.reduce((s, r) => s + (r.impressions ?? 0), 0);

  // The denominator, always printed. A "top opportunity" of 13
  // impressions means something completely different at 428 total than at
  // 428,000, and a report that hides the total invites the wrong read.
  const byQuery = new Map();
  for (const r of rows) {
    const q = r.keys[0];
    const cur = byQuery.get(q) ?? { impressions: 0, clicks: 0, best: 999 };
    cur.impressions += r.impressions ?? 0;
    cur.clicks += r.clicks ?? 0;
    cur.best = Math.min(cur.best, r.position);
    byQuery.set(q, cur);
  }
  const top = [...byQuery.entries()].sort((a, b) => b[1].impressions - a[1].impressions).slice(0, 10);
  const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  console.log(`  WHOLE WINDOW: ${totalImpr} impressions, ${totalClicks} clicks, ${byQuery.size} distinct queries.`);
  console.log("  Top queries by impressions:");
  for (const [q, v] of top) {
    console.log(`      ${String(v.impressions).padStart(4)} impr  ${String(v.clicks).padStart(2)} clicks  best pos ${v.best.toFixed(1).padStart(5)}   ${q}`);
  }
  console.log("");

  // Which TEMPLATE earns the impressions. A card-identity query answered
  // by /deals/[id] is a listing page that disappears when the listing
  // ends, holding a ranking the permanent /cards/[slug] hub should own.
  const TEMPLATE = (p) =>
    p === "/" ? "/ (home)"
    : /^\/deals\/\d+$/.test(p) ? "/deals/[id] (ephemeral)"
    : /^\/deals\/[a-z-]+$/.test(p) ? "/deals/[country|category]"
    : /^\/cards\/./.test(p) ? "/cards/[slug]"
    : /^\/sets\/./.test(p) ? "/sets/[slug]"
    : /^\/pokemon\/./.test(p) ? "/pokemon/[slug]"
    : /^\/guides\//.test(p) ? "/guides/*"
    : /^\/news\//.test(p) ? "/news/*"
    : p;
  const byTemplate = new Map();
  for (const r of rows) {
    const t = TEMPLATE(path(r.keys[1]));
    const cur = byTemplate.get(t) ?? { impressions: 0, clicks: 0, rows: 0 };
    cur.impressions += r.impressions ?? 0;
    cur.clicks += r.clicks ?? 0;
    cur.rows += 1;
    byTemplate.set(t, cur);
  }
  console.log("  Impressions by template:");
  for (const [t, v] of [...byTemplate.entries()].sort((a, b) => b[1].impressions - a[1].impressions)) {
    console.log(`      ${String(v.impressions).padStart(4)} impr  ${String(v.clicks).padStart(2)} clicks  ${String(v.rows).padStart(3)} rows   ${t}`);
  }
  console.log("");
  console.log(`  positions ${BAND[0]}-${BAND[1]} with >= ${MIN_IMPRESSIONS} impressions: ${inBand.length} rows across ${pages.length} pages`);
  console.log(`  they carry ${bandImpr} of ${totalImpr} impressions (${totalImpr ? Math.round((bandImpr / totalImpr) * 100) : 0}%)\n`);

  for (const p of pages.slice(0, 15)) {
    console.log(`  ${p.page}  (${p.impressions} impressions in band)`);
    for (const q of p.queries.slice(0, 6)) {
      console.log(`      pos ${q.position.toFixed(1).padStart(5)}  ${String(q.impressions).padStart(4)} impr  ${q.clicks} clicks   ${q.query}`);
    }
  }

  const out = args.out ?? `docs/seo/gsc/striking-distance-${endDate}.json`;
  mkdirSync(dirname(join(ROOT, out)), { recursive: true });
  writeFileSync(join(ROOT, out), JSON.stringify({ site, startDate, endDate, band: BAND, minImpressions: MIN_IMPRESSIONS, pages }, null, 2));
  console.log(`\n  saved ${out}`);
}

main().catch((e) => die(e.message));

// SEO-GSC-1 - READ-ONLY Google Search Console audit helper.
//
// Reuses the local OAuth token at .secrets/gsc-token.json (auto-refreshes
// the access token from the stored refresh_token, exactly like
// scripts/gsc-test.mjs). NOTHING here writes to Search Console: only
// searchAnalytics/query, sitemaps.list, and urlInspection are called.
// No token / secret is ever printed.
//
//   node scripts/_gscAudit.mjs perf     --start 2026-08-01 --end 2026-08-28 --dims page,query --limit 25000 [--filter 'page~~/cards/'] [--out file.json]
//   node scripts/_gscAudit.mjs sitemaps
//   node scripts/_gscAudit.mjs inspect  https://pokemondealfinder.com/cards/charizard-...
//   node scripts/_gscAudit.mjs inspect-file urls.txt --out inspect.json
//
// GSC data lags ~2-3 days; use dataState=all to include the freshest.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CLIENT_PATH = join(ROOT, ".secrets", "gsc-oauth-client.json");
const TOKEN_PATH = join(ROOT, ".secrets", "gsc-token.json");
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const WMX = "https://www.googleapis.com/webmasters/v3";
const INSPECT_URI = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const SITE = "https://pokemondealfinder.com/";

function die(m) {
  console.error(`\n  x ${m}\n`);
  process.exit(1);
}
function readJson(p, label) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    return die(`could not read ${label} (${p}): ${e.code ?? e.message}. Run: npm run gsc:auth`);
  }
}

async function accessToken() {
  const tok = readJson(TOKEN_PATH, "the saved token");
  if (tok.access_token && Number(tok.expiry_date) > Date.now() + 30_000) return tok.access_token;
  if (!tok.refresh_token) return die("saved token has no refresh_token - re-run: npm run gsc:auth");
  const raw = readJson(CLIENT_PATH, "the OAuth client");
  const c = raw.installed ?? raw.web ?? {};
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.client_id,
      client_secret: c.client_secret,
      refresh_token: tok.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    return die(`token refresh failed: HTTP ${res.status} ${json.error ?? ""} ${json.error_description ?? ""} - re-run: npm run gsc:auth`);
  }
  tok.access_token = json.access_token;
  tok.expiry_date = Date.now() + (Number(json.expires_in ?? 3600) - 60) * 1000;
  tok.refreshed_at = new Date().toISOString();
  writeFileSync(TOKEN_PATH, JSON.stringify(tok, null, 2) + "\n", { mode: 0o600 });
  return tok.access_token;
}

async function api(url, { method = "GET", body } = {}, token) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) die(`${method} ${url.replace(WMX, "").replace(INSPECT_URI, "urlInspection")} -> HTTP ${res.status} ${json?.error?.message ?? json?.error ?? ""}`);
  return json;
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) a[t.slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i];
    else a._.push(t);
  }
  return a;
}

// --filter 'page~~/cards/'  ->  { dimension:"page", operator:"contains", expression:"/cards/" }
// operators: ~~ contains, == equals, !~ notContains, != notEquals, re~ includingRegex
function parseFilter(s) {
  const m = s.match(/^(page|query|country|device|searchAppearance)(~~|==|!~|!=|re~)(.*)$/s);
  if (!m) die(`bad --filter "${s}"`);
  const op = { "~~": "contains", "==": "equals", "!~": "notContains", "!=": "notEquals", "re~": "includingRegex" }[m[2]];
  return { dimension: m[1], operator: op, expression: m[3] };
}

async function perf(args, token) {
  const dims = String(args.dims ?? "page").split(",").map((s) => s.trim()).filter(Boolean);
  const body = {
    startDate: args.start,
    endDate: args.end,
    dimensions: dims,
    rowLimit: Math.min(Number(args.limit ?? 25000), 25000),
    dataState: args.datastate ?? "all",
    type: args.type ?? "web",
  };
  if (args.filter) body.dimensionFilterGroups = [{ filters: [parseFilter(args.filter)] }];
  const all = [];
  for (let startRow = 0; ; startRow += body.rowLimit) {
    const page = await api(
      `${WMX}/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
      { method: "POST", body: { ...body, startRow } },
      token
    );
    const rows = page.rows ?? [];
    all.push(...rows);
    if (rows.length < body.rowLimit || all.length >= Number(args.limit ?? 25000)) break;
  }
  const totals = all.reduce(
    (t, r) => ({ clicks: t.clicks + (r.clicks || 0), impressions: t.impressions + (r.impressions || 0) }),
    { clicks: 0, impressions: 0 }
  );
  const result = {
    query: { site: SITE, ...body },
    rowCount: all.length,
    totals: { ...totals, ctr: totals.impressions ? totals.clicks / totals.impressions : 0 },
    rows: all,
  };
  if (args.out) {
    writeFileSync(join(ROOT, args.out), JSON.stringify(result, null, 2));
    console.log(`  wrote ${args.out}  (${all.length} rows, ${totals.clicks} clicks / ${totals.impressions} impr)`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

async function sitemaps(_args, token) {
  const j = await api(`${WMX}/sites/${encodeURIComponent(SITE)}/sitemaps`, {}, token);
  console.log(JSON.stringify(j, null, 2));
}

async function inspectOne(url, token) {
  const j = await api(INSPECT_URI, { method: "POST", body: { inspectionUrl: url, siteUrl: SITE } }, token);
  const r = j.inspectionResult ?? {};
  const s = r.indexStatusResult ?? {};
  return {
    url,
    verdict: s.verdict ?? null,
    coverageState: s.coverageState ?? null,
    robotsTxtState: s.robotsTxtState ?? null,
    indexingState: s.indexingState ?? null,
    pageFetchState: s.pageFetchState ?? null,
    lastCrawlTime: s.lastCrawlTime ?? null,
    googleCanonical: s.googleCanonical ?? null,
    userCanonical: s.userCanonical ?? null,
    crawledAs: s.crawledAs ?? null,
    sitemap: s.sitemap ?? null,
    referringUrls: s.referringUrls ?? null,
    mobileUsability: r.mobileUsabilityResult?.verdict ?? null,
    richResults: (r.richResultsResult?.detectedItems ?? []).map((d) => d.richResultType),
  };
}

async function inspect(args, token) {
  const out = await inspectOne(args._[1], token);
  console.log(JSON.stringify(out, null, 2));
}

async function inspectFile(args, token) {
  const urls = readFileSync(join(ROOT, args._[1]), "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const results = [];
  for (const u of urls) {
    try {
      const r = await inspectOne(u, token);
      results.push(r);
      console.error(`  ${r.verdict ?? "?"} / ${r.coverageState ?? "?"}  ${u}`);
    } catch (e) {
      results.push({ url: u, error: String(e.message) });
    }
    await new Promise((r) => setTimeout(r, 350)); // be gentle on the 600/min quota
  }
  if (args.out) {
    writeFileSync(join(ROOT, args.out), JSON.stringify(results, null, 2));
    console.log(`\n  wrote ${args.out}  (${results.length} inspections)`);
  } else {
    console.log(JSON.stringify(results, null, 2));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const token = await accessToken();
  if (cmd === "perf") return perf(args, token);
  if (cmd === "sitemaps") return sitemaps(args, token);
  if (cmd === "inspect") return inspect(args, token);
  if (cmd === "inspect-file") return inspectFile(args, token);
  die(`unknown command "${cmd}". Use: perf | sitemaps | inspect | inspect-file`);
}
main().catch((e) => die(e?.message ?? String(e)));

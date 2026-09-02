// GSC CONNECTION - READ-ONLY smoke test.
//
//   npm run gsc:test
//
// Proves the saved token works: lists the Search Console properties this
// Google account can read, picks the Pokemon Deal Finder property, and
// runs ONE small Search Analytics query (<= 10 rows, `page` dimension).
//
// READ-ONLY. No Search Console change, no URL submission, no sitemap
// touch. No token is ever printed. Auto-refreshes the access token from
// the stored refresh_token when needed.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CLIENT_PATH = join(ROOT, ".secrets", "gsc-oauth-client.json");
const TOKEN_PATH = join(ROOT, ".secrets", "gsc-token.json");
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const WMX = "https://www.googleapis.com/webmasters/v3";

function die(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return die(`could not read ${label} (${path}): ${err.code ?? err.message}. Run: npm run gsc:auth`);
  }
}

async function accessToken() {
  const tok = readJson(TOKEN_PATH, "the saved token");
  if (tok.access_token && Number(tok.expiry_date) > Date.now() + 30_000) {
    return tok.access_token;
  }
  // refresh
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
    return die(
      `token refresh failed: HTTP ${res.status} ${json.error ?? ""} ${json.error_description ?? ""}`.trim() +
        " - re-run: npm run gsc:auth"
    );
  }
  tok.access_token = json.access_token;
  tok.expiry_date = Date.now() + (Number(json.expires_in ?? 3600) - 60) * 1000;
  tok.refreshed_at = new Date().toISOString();
  writeFileSync(TOKEN_PATH, JSON.stringify(tok, null, 2) + "\n", { mode: 0o600 });
  return tok.access_token;
}

async function gsc(path, { method = "GET", body } = {}, token) {
  const res = await fetch(`${WMX}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = json?.error?.message ?? json?.error ?? "";
    die(`${method} ${path} -> HTTP ${res.status} ${reason}`.trim());
  }
  return json;
}

function pickProperty(entries) {
  const mine = entries.filter((e) => /(^|[:/.])pokemondealfinder\.com(\/|$)/i.test(e.siteUrl));
  if (mine.length === 0) return null;
  // Prefer the domain property (covers every protocol/subdomain), else a URL-prefix property.
  return mine.find((e) => e.siteUrl.startsWith("sc-domain:")) ?? mine[0];
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const token = await accessToken();

  // 1) sites.list
  const sites = await gsc("/sites", {}, token);
  const entries = sites.siteEntry ?? [];
  console.log("\n  Search Console properties this account can read:");
  if (entries.length === 0) console.log("    (none)");
  for (const e of entries) console.log(`    ${e.siteUrl.padEnd(40)} ${e.permissionLevel}`);

  const prop = pickProperty(entries);
  if (!prop) {
    return die(
      "no Pokemon Deal Finder property in sites.list for this Google account.\n" +
        "  -> Confirm you signed in with the account that has Search Console access to\n" +
        "     pokemondealfinder.com, and that it is added as a test user on the OAuth app.\n" +
        "  Not guessing a property identifier."
    );
  }
  console.log(`\n  Using property : ${prop.siteUrl}`);
  console.log(`  Permission     : ${prop.permissionLevel}`);

  // 2) one small Search Analytics query
  // GSC data lags ~2-3 days; end 5 days back, 28-day window.
  const end = new Date(Date.now() - 5 * 86400_000);
  const start = new Date(end.getTime() - 27 * 86400_000);
  const q = {
    startDate: ymd(start),
    endDate: ymd(end),
    dimensions: ["page"],
    rowLimit: 10,
  };
  console.log(`\n  Search Analytics smoke test: ${q.startDate} -> ${q.endDate}  (page, <=10 rows)`);
  const data = await gsc(
    `/sites/${encodeURIComponent(prop.siteUrl)}/searchAnalytics/query`,
    { method: "POST", body: q },
    token
  );
  const rows = data.rows ?? [];
  console.log(`  rows returned : ${rows.length}`);
  if (rows.length === 0) {
    console.log(
      "  (zero rows is NOT an auth failure - sites.list succeeded. It usually means the\n" +
        "   property is new / has little Search traffic in this window, or data has not\n" +
        "   populated yet. Try a wider window later.)"
    );
  } else {
    console.log("");
    console.log("  clicks  impr    ctr     pos   page");
    console.log("  " + "-".repeat(72));
    for (const r of rows) {
      const [page] = r.keys ?? [""];
      console.log(
        "  " +
          String(r.clicks ?? 0).padEnd(7) +
          String(r.impressions ?? 0).padEnd(7) +
          ((r.ctr ?? 0) * 100).toFixed(1).padEnd(1) + "%" + "  " +
          Number(r.position ?? 0).toFixed(1).padStart(4) + "  " +
          page
      );
    }
  }
  console.log("\n  ✓ Read-only Search Console access confirmed.\n");
}

main().catch((err) => die(err?.message ?? String(err)));

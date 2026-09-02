// GSC CONNECTION - local, READ-ONLY OAuth for Google Search Console.
//
//   npm run gsc:auth
//
// Uses the Desktop OAuth client at .secrets/gsc-oauth-client.json, runs
// the standard loopback browser flow, and stores a reusable token at
// .secrets/gsc-token.json. Scope is ONLY webmasters.readonly.
//
// Nothing here is deployed. No credential is ever printed. .secrets/ is
// git-ignored. Zero npm dependencies - the OAuth loopback + token
// exchange is a handful of plain HTTPS calls, so no Google SDK is added
// to a project that has 8 runtime deps.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CLIENT_PATH = join(ROOT, ".secrets", "gsc-oauth-client.json");
const TOKEN_PATH = join(ROOT, ".secrets", "gsc-token.json");
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

function die(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}

function loadClient() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(CLIENT_PATH, "utf8"));
  } catch (err) {
    return die(`could not read ${CLIENT_PATH}: ${err.code ?? err.message}`);
  }
  const c = raw.installed ?? raw.web ?? {};
  if (!c.client_id || !c.client_secret) {
    return die(".secrets/gsc-oauth-client.json is missing client_id / client_secret (expected a Desktop OAuth client)");
  }
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    /* the URL is printed too; manual paste always works */
  }
}

async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return die(`token exchange failed: HTTP ${res.status} ${json.error ?? ""} ${json.error_description ?? ""}`.trim());
  }
  return json;
}

async function main() {
  const { clientId, clientSecret } = loadClient();
  const state = randomUUID();

  // Loopback listener on an ephemeral 127.0.0.1 port. Desktop OAuth
  // clients whose redirect_uris include http://localhost accept any port.
  const server = createServer();
  await new Promise((ok, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", ok);
  });
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}`;

  const codePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("timed out after 5 minutes waiting for the browser redirect"));
    }, 5 * 60 * 1000);
    server.on("request", (req, res) => {
      const u = new URL(req.url, redirectUri);
      if (u.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }
      const code = u.searchParams.get("code");
      const gErr = u.searchParams.get("error");
      const gState = u.searchParams.get("state");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:3rem;max-width:34rem;margin:auto">` +
          (code && gState === state
            ? `<h2>Pokemon Deal Finder &times; Search Console</h2><p>Read-only access granted. Close this tab and return to the terminal.</p>`
            : `<h2>Authorisation failed</h2><p>${gErr ?? "missing or mismatched code"} &mdash; close this tab and re-run <code>npm run gsc:auth</code>.</p>`) +
          `</body>`
      );
      clearTimeout(timer);
      server.close();
      if (gErr) return reject(new Error(`Google returned error=${gErr}`));
      if (!code) return reject(new Error("no authorization code in the redirect"));
      if (gState !== state) return reject(new Error("OAuth state mismatch - aborting"));
      resolve(code);
    });
  });

  const authUrl =
    `${AUTH_URI}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

  console.log("\n  Opening your browser to authorise READ-ONLY Search Console access.");
  console.log("  Scope: " + SCOPE);
  console.log("\n  If the browser does not open, paste this URL into it:\n");
  console.log("  " + authUrl + "\n");
  console.log(
    "  If Google shows an \"unverified app\" / \"Testing\" screen: that is expected for an\n" +
      "  External OAuth app in Testing. Sign in with the Google account that (a) has Search\n" +
      "  Console access to the property and (b) is added as a test user, then choose\n" +
      "  Advanced -> \"Go to <app> (unsafe)\" -> Continue. Nothing is bypassed in code.\n"
  );
  openBrowser(authUrl);

  let code;
  try {
    code = await codePromise;
  } catch (err) {
    return die(err.message);
  }

  const tok = await exchangeCode({ clientId, clientSecret, code, redirectUri });
  if (!tok.refresh_token) {
    return die(
      "Google did not return a refresh_token. Revoke this app at " +
        "https://myaccount.google.com/permissions and re-run (a cached prior grant is the usual cause)."
    );
  }

  mkdirSync(join(ROOT, ".secrets"), { recursive: true });
  const record = {
    scope: SCOPE,
    token_type: tok.token_type ?? "Bearer",
    refresh_token: tok.refresh_token,
    access_token: tok.access_token,
    expiry_date: Date.now() + (Number(tok.expires_in ?? 3600) - 60) * 1000,
    obtained_at: new Date().toISOString(),
  };
  writeFileSync(TOKEN_PATH, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });

  console.log("  ✓ Authorised.");
  console.log("    token stored : .secrets/gsc-token.json  (git-ignored; refresh_token present)");
  console.log("    access token : expires " + new Date(record.expiry_date).toISOString());
  console.log("    next step    : npm run gsc:test\n");
}

main().catch((err) => die(err?.message ?? String(err)));

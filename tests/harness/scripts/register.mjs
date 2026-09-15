// browse-budget-r1 - runs a REAL manual script offline: "dotenv" and
// "@supabase/supabase-js" resolve to local stubs, and globalThis.fetch is a
// recorder that answers the OAuth token and Developer Analytics endpoints and
// fails every other request. Nothing leaves the process.
//   SCRIPT_HARNESS_LEDGER = "enforce" | "observe" | "none"  (catalog_snapshot seed)
// Every request URL is written to SCRIPT_HARNESS_LOG (one per line).
import { register } from "node:module";
import { appendFileSync } from "node:fs";

register("./hooks.mjs", import.meta.url);

const now = Date.now();
const reset = new Date(Math.ceil((now + 3.6e6) / 300_000) * 300_000).toISOString(); // an hour-plus ahead, on a 5-minute boundary
const prevReset = new Date(Date.parse(reset) - 86_400_000).toISOString();
globalThis.__scriptHarness = { reset, prevReset };

globalThis.fetch = async (url) => {
  const u = String(url);
  appendFileSync(process.env.SCRIPT_HARNESS_LOG, `${u}\n`);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (u.startsWith("https://api.ebay.com/identity/")) return json({ access_token: "harness-token", expires_in: 7200 });
  if (u.startsWith("https://api.ebay.com/developer/analytics/")) {
    return json({ rateLimits: [{ resources: [{ name: "buy.browse", rates: [{ limit: 5000, remaining: 3000, reset, timeWindow: 86400 }] }] }] });
  }
  return json({ error: "harness: offline" }, 404);
};

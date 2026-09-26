#!/usr/bin/env node
// PRESERVATION - read the provider's CURRENT allowance from its own headers.
//
//   node scripts/preservation/allowance.mjs
//
// Exactly ONE request, of the cheapest family the site already issues
// (~8,000/day): /cards?tcgPlayerId=<one id>, 1 credit when it succeeds.
// Prints the status and every x-ratelimit-* / x-api-calls-consumed header.
// Never retries. A 429 here is itself the answer, not a reason to wait and
// try again. Prints nothing sensitive: no key, no body.
//
// Why this exists: lib/pptTelemetry records only the un-prefixed
// x-ratelimit-limit / -remaining / -reset names, and this provider sends
// x-ratelimit-daily-* / -minute-* / -purchased-remaining / -total-remaining
// instead - so the site's telemetry has never captured the allowance.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const require = createRequire(import.meta.url);
const { recordPptAttempt, withPptConsumer } = require("../../lib/pptTelemetry.js");

const key = process.env.POKEMONPRICETRACKER_API_KEY;
if (!key) {
  console.error("  Missing POKEMONPRICETRACKER_API_KEY");
  process.exit(2);
}

await withPptConsumer("script:preservation-allowance", async () => {
  const url = new URL("https://www.pokemonpricetracker.com/api/v2/cards");
  url.searchParams.set("tcgPlayerId", "183899");
  url.searchParams.set("language", "english");
  const at = new Date().toISOString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const text = await res.text();
  await recordPptAttempt({ url, op: "allowanceProbe", res, bodyText: res.ok ? null : text });
  console.log(`  ${at}  HTTP ${res.status}`);
  for (const [h, v] of [...res.headers.entries()].sort()) {
    if (/^x-ratelimit-|^x-api-calls-consumed$|^date$/.test(h)) console.log(`  ${h.padEnd(34)} ${v}`);
  }
  if (!res.ok) console.log(`  body: ${text.slice(0, 300)}`);
  const reset = Number(res.headers.get("x-ratelimit-daily-reset"));
  if (reset) console.log(`  daily reset at                     ${new Date(reset * 1000).toISOString()}`);
});

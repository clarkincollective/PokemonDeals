#!/usr/bin/env node
// SOCIAL-LIVE-3 - non-disclosing startup check for the scheduled social
// workers. Prints only presence booleans and pass/fail per dependency -
// never a value. Exits 1 if anything the autopilot needs is missing.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const checks = [];
const add = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail });
// the GitHub RENDER worker needs only these; Buffer + Resend stay on Vercel
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]) add(`env ${k} present`, Boolean(process.env[k]));

try {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
  const { count, error } = await supabaseAdmin().from("social_story_placements").select("placement_id", { count: "exact", head: true });
  add("supabase service-role read", !error && count != null, error ? error.message.slice(0, 80) : `${count} placements`);
} catch (e) { add("supabase service-role read", false, String(e.message).slice(0, 80)); }

try {
  const r = await fetch("https://api.openai.com/v1/models?limit=1", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(20000) });
  add("openai key accepted", r.status === 200, `http ${r.status}`);
} catch (e) { add("openai key accepted", false, String(e.message).slice(0, 80)); }

try {
  const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
  const { data, error } = await supabaseAdmin().storage.from("social-public").list("by-hash", { limit: 1 });
  add("supabase storage (hosting) reachable", !error && Array.isArray(data), error ? error.message.slice(0, 80) : "ok");
} catch (e) { add("supabase storage (hosting) reachable", false, String(e.message).slice(0, 80)); }

try {
  const { FFMPEG } = await import("../lib/social/videoRender.mjs");
  add("ffmpeg available", FFMPEG && existsSync(FFMPEG));
} catch (e) { add("ffmpeg available", false, String(e.message).slice(0, 80)); }
add("chrome available", !process.env.CHROME_BIN || existsSync(process.env.CHROME_BIN), process.env.CHROME_BIN ? "CHROME_BIN set" : "default resolution");

for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
if (checks.some((c) => !c.ok)) process.exit(1);

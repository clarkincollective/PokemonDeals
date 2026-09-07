import { supabaseAdmin } from "./lib/supabaseAdmin.js";
const db = supabaseAdmin();
const DEPLOY = "2026-09-07T10:46:13Z";
const DEADLINE = Date.now() + 85 * 60 * 1000; // ~85 min cap -> covers the 11:00 + 11:30 runs
let lastCount = -1;
async function poll() {
  const { count, error } = await db.from("deals").select("id", { count: "exact", head: true }).gt("exact_verified_at", DEPLOY);
  if (error) { console.log("poll_error", error.message); return 0; }
  return count ?? 0;
}
while (Date.now() < DEADLINE) {
  const c = await poll();
  if (c !== lastCount) { console.log(new Date().toISOString(), "rows_verified_since_deploy=", c); lastCount = c; }
  if (c >= 30) { console.log("DONE: >=2 post-deploy cron runs observed (", c, "rows)"); process.exit(0); }
  await new Promise((r) => setTimeout(r, 120000)); // 2 min
}
console.log("TIMEOUT: deadline reached, rows_verified_since_deploy=", lastCount);
process.exit(0);

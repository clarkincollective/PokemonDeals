import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await db.from("deals")
  .select("card_set,discount_pct,market_price,total_price_usd,reference_source,reference_observed_at,reference_synced_at,exact_verified_at,first_seen_at,watchlist:watchlist_id (set,language)")
  .eq("card_set","ME: 30th Celebration").eq("is_active",true).is("disqualified_reason",null).limit(200);
if (error) { console.log("err", error.message); process.exit(0); }
const rows = data ?? [];
const wl = {}; for (const r of rows) { const k = `${r.watchlist?.set}|${r.watchlist?.language}`; wl[k]=(wl[k]||0)+1; }
console.log("rows:", rows.length, "| watchlist set|language:", JSON.stringify(wl));
console.log("reference_source:", JSON.stringify(rows.reduce((a,r)=>{a[r.reference_source??"null"]=(a[r.reference_source??"null"]||0)+1;return a;},{})));
const WW = Date.parse("2026-09-15T14:00:00Z");
console.log("reference_observed_at >= Sydney midnight:", rows.filter(r=>Date.parse(r.reference_observed_at)>=WW).length, "| null:", rows.filter(r=>!r.reference_observed_at).length);
console.log("reference_synced_at >= Sydney midnight:", rows.filter(r=>Date.parse(r.reference_synced_at)>=WW).length);
console.log("sample:", JSON.stringify(rows[0]));

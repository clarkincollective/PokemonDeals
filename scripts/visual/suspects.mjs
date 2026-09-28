#!/usr/bin/env node
// The counterfeit SUSPECTS the local screen could not decide alone (28 Sep
// 2026): a material-confirmed COUNTERFEIT call that was recorded as UNKNOWN
// + suspect instead of a hold (see scripts/visual/screenLocal.mjs). For the
// owner to glance at; a confirmed fake is held with
//   node scripts/remediation/holdReportedListing.mjs --ids=<id> --apply --confirm=1 --prior-out=<file>
//
//   node scripts/visual/suspects.mjs            # list open suspects (newest first)
//   node scripts/visual/suspects.mjs --clear=<id>   # drop one from the list after review
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const clear = process.argv.find((a) => a.startsWith("--clear="))?.slice(8);

const { data } = await db.from("catalog_snapshot").select("data, updated_at").eq("kind", "visual_suspects").maybeSingle();
let items = Array.isArray(data?.data?.items) ? data.data.items : [];
if (clear) {
  const before = items.length;
  items = items.filter((s) => String(s.id) !== String(clear));
  await db.from("catalog_snapshot").upsert({ kind: "visual_suspects", data: { v: 1, items }, updated_at: new Date().toISOString() }, { onConflict: "kind" });
  console.log(`removed ${before - items.length} entr${before - items.length === 1 ? "y" : "ies"} for ${clear}; ${items.length} left`);
  process.exit(0);
}
// still-active rows only (a sold or already-held listing needs no look)
const ids = items.map((s) => s.id);
const active = new Set();
if (ids.length) {
  const { data: rows } = await db.from("deals").select("id").in("id", ids).eq("is_active", true).is("disqualified_reason", null);
  for (const r of rows ?? []) active.add(r.id);
}
const open = items.filter((s) => active.has(s.id));
console.log(`${open.length} open suspect(s) (${items.length} recorded, ${items.length - open.length} no longer active or already held)`);
for (const s of open) {
  console.log(`\n#${s.id}  ${s.title} (${s.set})  ${s.marketplace}  $${s.market} market, ${Math.round((s.discountPct ?? 0) * 100)}% below  ${s.at?.slice(0, 16)}Z`);
  console.log(`  page:     ${s.page}`);
  console.log(`  evidence: ${s.evidence}`);
  console.log(`  material: ${s.materials}${s.materialAgrees ? " (agrees)" : ""}`);
  for (const u of s.images ?? []) console.log(`  photo:    ${u}`);
}

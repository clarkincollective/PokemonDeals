#!/usr/bin/env node
// VISION RATIONALE AUDIT (2026-09-21). READ-ONLY. Changes nothing,
// screens nothing, calls no model.
//
//   node scripts/seo/visionRationaleAudit.mjs
//
// Listing 41196 was reported as counterfeit. Its Stage 2 vision step
// returned MATCH and its own stored rationale read that "the entirely
// gold metallic finish is consistent with an official gold/metal card
// variant" - for a paper promo. The screener argued the tell away.
//
// docs/listing-reports.md proposes treating a metallic finish on a
// printing the catalogue records as paper as COUNTERFEIT_MISMATCH. Before
// any such rule is written, this measures whether the language is rare
// enough to act on. "Gold" is NOT automatically suspicious - Gold Secret
// Rares are real paper cards with gold foil printing - so a naive keyword
// gate would hide genuine inventory. This prints the counts and the
// actual sentences so that judgement can be made on evidence.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Deliberately split: material claims (a metal object) vs decoration
// (gold-coloured printing on card stock). Only the first is the 41196
// shape; the second is an ordinary Pokemon rarity.
const MATERIAL = /\b(metal(?:lic)?|gold[\s-]?metal|solid gold|metal card|gold plated|gold-plated)\b/i;
const DECORATION = /\b(gold secret rare|gold star|golden|gold foil|gold border|gold trim)\b/i;

async function main() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("id, title, market_price, discount_pct, visual_authenticity_status, visual_authenticity_reason, disqualified_reason")
      .not("visual_authenticity_reason", "is", null)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error(`  x query failed: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }

  console.log(`Vision rationale audit - READ-ONLY\n`);
  console.log(`  rows with a stored vision rationale: ${rows.length}`);

  const byStatus = new Map();
  for (const r of rows) byStatus.set(r.visual_authenticity_status, (byStatus.get(r.visual_authenticity_status) ?? 0) + 1);
  console.log("  by verdict:");
  for (const [k, v] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) console.log(`      ${String(k).padEnd(22)}${v}`);

  const material = rows.filter((r) => MATERIAL.test(r.visual_authenticity_reason ?? ""));
  const decoration = rows.filter((r) => DECORATION.test(r.visual_authenticity_reason ?? ""));
  const passedAnyway = material.filter((r) => r.visual_authenticity_status === "MATCH" && !r.disqualified_reason);

  console.log("");
  console.log(`  rationale asserts a METAL/METALLIC material: ${material.length}`);
  console.log(`  rationale uses ordinary GOLD DECORATION wording: ${decoration.length}  (these must never be gated)`);
  console.log(`  metal wording AND verdict MATCH AND not held: ${passedAnyway.length}  <- the 41196 shape`);
  console.log("");

  const only = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1];
  const show = only ? rows.filter((r) => String(r.id) === only) : passedAnyway.slice(0, 12);
  for (const r of show) {
    const reason = String(r.visual_authenticity_reason ?? "").replace(/\s+/g, " ");
    console.log(`  deal ${r.id}  $${Number(r.market_price).toFixed(2)}  ${(Number(r.discount_pct) * 100).toFixed(0)} % off  verdict ${r.visual_authenticity_status}  held ${r.disqualified_reason ?? "no"}`);
    console.log(`      ${String(r.title).slice(0, 92)}`);
    if (only) {
      // Full text, wrapped - the truncated view is what made this hard to
      // judge in the first place.
      for (let i = 0; i < reason.length; i += 110) console.log(`      ${reason.slice(i, i + 110)}`);
    } else {
      const at = reason.search(MATERIAL);
      console.log(`      ...${reason.slice(Math.max(0, at - 90), at + 150)}...`);
    }
  }

  // The tighter signal. Not "does the rationale mention metal" - that is
  // dominated by the Pokemon Melmetal, foil sheen and grading-slab
  // descriptions - but "does the rationale name a counterfeit tell and
  // then return MATCH anyway". That self-contradiction is the 41196
  // failure mode stated precisely.
  const TELL = /\b(novelty|reproduction|replica|proxy|counterfeit|fake|bootleg|gold[\s-]?plated|custom card)\b/i;
  const contradictory = rows.filter(
    (r) => r.visual_authenticity_status === "MATCH" && TELL.test(r.visual_authenticity_reason ?? "")
  );
  console.log("");
  console.log(`  SELF-CONTRADICTORY: verdict MATCH while the rationale names a counterfeit tell: ${contradictory.length}`);
  for (const r of contradictory) {
    const reason = String(r.visual_authenticity_reason ?? "").replace(/\s+/g, " ");
    const at = reason.search(TELL);
    console.log(`      deal ${r.id}  $${Number(r.market_price).toFixed(2)}  ${(Number(r.discount_pct) * 100).toFixed(0)} % off  held ${r.disqualified_reason ?? "no"}`);
    console.log(`          ...${reason.slice(Math.max(0, at - 80), at + 120)}...`);
  }

  console.log("");
  console.log("  Judgement, not a rule: act only if the metal-material count is small AND");
  console.log("  the sentences really are material claims. Gold decoration wording is an");
  console.log("  ordinary Pokemon rarity and gating it would hide genuine cards.");
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
});

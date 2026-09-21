#!/usr/bin/env node
// 30th ANNIVERSARY / CELEBRATION MISMATCH AUDIT (2026-09-21). READ-ONLY.
//
//   node scripts/seo/anniversaryMismatchAudit.mjs
//
// Owner report: 30th Anniversary cards are being matched to the ORIGINAL
// set they reprint, not to the 30th set. That is the worst possible
// direction for this site, because the reprint is cheap and the original
// is not - so the listing is priced against a vintage reference and shows
// an enormous discount that is not real.
//
// This measures the size and shape of it before anything is changed. It
// writes nothing, screens nothing and calls no provider.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const req = createRequire(import.meta.url);
const { isDisplayableDeal, savingsClaimTrusted } = req("../../lib/dealQuality.js");
const { titleNamesDifferentExpansion } = req("../../lib/dealMatching.js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Reprint sets that REUSE the original card's number, which is what makes
// them indistinguishable from the original by number alone. Confirmed in
// our own catalogue:
//   Celebrations: Classic Collection  Blastoise 2/102   $15.18
//     ... the Base Set number, against a Base Set holo worth hundreds
//   ME: 30th Celebration Classic Collection  Metagross 11/113
//     ... the EX Delta Species number, against a $107 original
// Each entry is the marker a seller writes in a title, and the catalogue
// set name that marker refers to.
const REPRINT_FAMILIES = [
  { key: "30th", title: /\b(30th|thirtieth)\b/i, set: /\b30th\b/i },
  { key: "25th / Celebrations", title: /\b(25th|celebrations)\b/i, set: /\bcelebrations\b/i },
];
const ANNIVERSARY = REPRINT_FAMILIES[0].title;
// A catalogue set that IS a 30th set. NOT a bare /celebration/ - that also
// matches "Celebrations", the 2021 TWENTY-fifth anniversary set, which is
// a different release entirely. Conflating them made the first run of this
// audit report five false positives.
const IS_30TH_SET = (s) => /\b30th\b/i.test(String(s ?? ""));

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)} %` : "-");

async function main() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("*")
      .is("disqualified_reason", null)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error(`  x ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const shown = rows.filter((r) => isDisplayableDeal(r));
  console.log(`30th anniversary mismatch audit - READ-ONLY\n`);
  console.log(`  not disqualified: ${rows.length}; displayable: ${shown.length}\n`);

  // The reported shape: the TITLE says 30th, the matched SET does not.
  const suspect = shown.filter((r) => ANNIVERSARY.test(String(r.title ?? "")) && !IS_30TH_SET(r.card_set));
  const titled30 = shown.filter((r) => ANNIVERSARY.test(String(r.title ?? "")));
  const set30 = shown.filter((r) => IS_30TH_SET(r.card_set));

  console.log(`  displayable listings whose TITLE names the 30th set: ${titled30.length}`);
  console.log(`  displayable listings matched TO a 30th catalogue set : ${set30.length}`);
  console.log(`  >> title says 30th but matched set does NOT: ${suspect.length} (${pct(suspect.length, shown.length)} of displayed)\n`);

  // The decisive question for each suspect: does the 30th set contain a
  // card of this name at all? If it does not, "30th" in the title cannot
  // be naming the real set and is keyword bait. If it does, the listing is
  // genuinely ambiguous and the number in the title decides it.
  const names = [...new Set(suspect.map((r) => r.card_name).filter(Boolean))];
  const cat = new Map();
  for (const n of names) {
    // select("*"), and the error is NOT swallowed: a first version asked
    // for a "number" column that does not exist, PostgREST refused the
    // whole query, and the audit then reported "not in a 30th set" for a
    // card that plainly is one. A silently empty result is worse than a
    // crash here, because it reads as evidence.
    const { data, error } = await db.from("card_catalog").select("*").ilike("name", `%${n}%`).limit(500);
    if (error) throw new Error(`card_catalog lookup for "${n}" failed: ${error.message}`);
    cat.set(
      n,
      (data ?? []).filter((c) => IS_30TH_SET(c.set))
    );
  }

  if (suspect.length) {
    console.log("  Each row below, with what the existing guard thinks:");
    for (const r of suspect.slice(0, 25)) {
      const guard = titleNamesDifferentExpansion(r.card_set, r.title);
      const in30 = cat.get(r.card_name) ?? [];
      // Compare the WHOLE "n/total", both sides normalised for leading
      // zeros. A first version compared "33/181" against "33" and so
      // reported every shared number as unique to the vintage printing -
      // the exact opposite of the finding.
      const norm = (s) =>
        String(s ?? "")
          .split("/")
          .map((part) => part.trim().replace(/^0+(?=\d)/, ""))
          .join("/");
      const numInTitle = String(r.title).match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
      const titleNum = numInTitle ? norm(`${numInTitle[1]}/${numInTitle[2]}`) : null;
      const thirtiethNumbers = in30.map((c) => norm(c.number ?? c.card_number ?? ""));
      const matches30 = titleNum ? thirtiethNumbers.includes(titleNum) : false;
      const savings = savingsClaimTrusted(r) ? "SAVINGS SHOWN" : "no savings claim";
      console.log(
        `    deal ${String(r.id).padEnd(6)} ${savings.padEnd(16)} market $${String(r.market_price ?? "-").padEnd(9)} ${
          r.discount_pct != null ? `${(Number(r.discount_pct) * 100).toFixed(0)} % off` : "-"
        }`
      );
      console.log(`        matched set : ${r.card_set}`);
      console.log(`        title       : ${String(r.title).slice(0, 96)}`);
      console.log(`        guard says  : ${guard ?? "no different expansion detected"}`);
      console.log(
        `        in a 30th set? ${
          in30.length
            ? `YES as ${in30.map((c) => `${c.set} ${c.number ?? c.card_number ?? "?"}`).join(", ")}`
            : "no - '30th' cannot be naming the set"
        }`
      );
      console.log(
        `        title number : ${titleNum ?? "none"}  -> ${
          !titleNum
            ? "no number in the title; nothing to decide on"
            : matches30
              ? "*** AMBIGUOUS: the 30th reprint carries this same number, so the number cannot identify the printing ***"
              : "unique to the vintage printing; the 30th set has no card at this number"
        }`
      );
    }
  }

  // Every reprint family, not just the 30th: the same trap exists
  // wherever a set reprints classics under their original numbers.
  console.log("\n  --- all reprint families ---");
  for (const fam of REPRINT_FAMILIES) {
    const hits = shown.filter((r) => fam.title.test(String(r.title ?? "")) && !fam.set.test(String(r.card_set ?? "")));
    const claiming = hits.filter((r) => savingsClaimTrusted(r));
    console.log(`  ${fam.key.padEnd(20)} title says it, matched set does not: ${String(hits.length).padStart(3)}  still claiming savings: ${claiming.length}`);
    for (const r of claiming.slice(0, 6)) {
      console.log(`      deal ${String(r.id).padEnd(6)} ${String(r.card_set).slice(0, 28).padEnd(30)} $${String(r.market_price).padEnd(9)} ${(Number(r.discount_pct) * 100).toFixed(0)} % off`);
      console.log(`          ${String(r.title).slice(0, 94)}`);
    }
  }

  // The reverse: matched to a 30th set while the title names a vintage
  // one. Same pricing error, opposite direction.
  const reverse = shown.filter((r) => IS_30TH_SET(r.card_set) && !ANNIVERSARY.test(String(r.title ?? "")));
  console.log(`\n  matched TO a 30th set while the title never says 30th: ${reverse.length}`);
  for (const r of reverse.slice(0, 10)) {
    console.log(`    deal ${r.id}  ${r.card_set}`);
    console.log(`        ${String(r.title).slice(0, 96)}`);
  }
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
});

#!/usr/bin/env node
// LLM mention share (2026-09-21). Answers one question the deep audit
// could not: when an assistant answers a Pokemon card pricing question,
// whose sites does it name - and are we ever among them?
//
//   node scripts/seo/llmMentions.mjs                 # us + the three peers
//   node scripts/seo/llmMentions.mjs --budget=0.25
//   node scripts/seo/llmMentions.mjs --targets=a.com,b.com
//
// Cost: ONE /ai_optimization/llm_mentions/target_metrics/live call, about
// $0.10. Ten targets cost the same as one, so every peer goes in the same
// request rather than one call each.
//
// Why the earlier attempt failed: the endpoint was guessed at
// /v3/llm_mentions/... and /v3/serp/llm_mentions/..., which returned
// 40501/40503. The real family is /v3/ai_optimization/llm_mentions/*
// (DataForSEO AI Optimization API). Recorded here so it is not re-guessed.
//
// Zero mentions is a real, reportable answer - the expected one at three
// referring domains - and is printed as such, never smoothed over.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { postWithRetry, ledger, firstResult, balance, LOCATIONS } from "./dataforseo.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const OURS = "pokemondealfinder.com";
// The three the audit found holding the value SERPs, plus our nearest peer
// by link profile. Comparison is the point: our own zero means little
// without knowing what a site with 50 referring domains scores.
// ONE target by default. Several `include` targets are ANDed by the API -
// a single answer would have to cite all of them - so a multi-target call
// returns nothing and reads, wrongly, as zero visibility. Compare peers by
// running the script once per domain.
const DEFAULT_TARGETS = [OURS];
const TARGETS = (args.targets ? String(args.targets).split(",") : DEFAULT_TARGETS).map((t) => t.trim()).filter(Boolean);
// Local date, not UTC: the other files in docs/seo/dataforseo are named
// for the day the operator ran them, and a UTC slice filed a 21 Sep run
// under 2026-09-20.
const today = new Date();
const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const OUT = args.out ?? `docs/seo/dataforseo/${stamp}/llm-mentions.json`;
const led = ledger(Number(args.budget ?? 0.25));

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (v) => (v === null ? "-" : Number(v).toLocaleString("en-US"));

async function main() {
  const task = {
    language_code: "en",
    location_code: LOCATIONS.US,
    // ChatGPT data is US/English only; omitting `platform` returns both
    // chat_gpt and google, which is what we want to compare.
    target: TARGETS.map((domain) => ({ domain, search_filter: "include" })),
    internal_list_limit: 10,
  };

  console.log(`LLM mention share - ${TARGETS.length} targets, one request`);
  const json = await postWithRetry("/ai_optimization/llm_mentions/target_metrics/live", [task], { ledger: led });
  const result = firstResult(json);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(json, null, 2));

  // The answer is in `aggregated_metrics`, not `items`: `items` holds the
  // individual prompt/answer records and stays empty unless the account is
  // entitled to them, while `aggregated_metrics.sources_domain` carries the
  // per-domain counts - `{ key, mentions, ai_search_volume }` - for every
  // domain cited ALONGSIDE the target. That co-citation list is the useful
  // part: it names who the assistant quotes on the same questions.
  //
  // `total_count: 0` therefore does NOT mean zero mentions, and reading it
  // that way is how the first run of this script under-reported. Read the
  // aggregates.
  const agg = result?.aggregated_metrics ?? {};
  const sources = Array.isArray(agg.sources_domain) ? agg.sources_domain : [];
  const platforms = Array.isArray(agg.platform) ? agg.platform : [];

  if (sources.length === 0) {
    console.log("  ! no aggregated source domains in the response. Full payload:");
    console.log(`    ${OUT} - read it before drawing any conclusion`);
    console.log("    NOTE: multiple `include` targets are ANDed - one answer must cite them all,");
    console.log("    which is almost never true. Query ONE target per call.");
  } else {
    console.log("");
    console.log(`  domains cited alongside the target${" ".repeat(6)}${"mentions".padStart(10)}${"ai search vol".padStart(15)}`);
    for (const r of sources.slice(0, 12)) {
      console.log(`  ${String(r?.key ?? "?").padEnd(40)}${fmt(num(r?.mentions)).padStart(10)}${fmt(num(r?.ai_search_volume)).padStart(15)}`);
    }
    if (platforms.length) {
      console.log("");
      console.log("  by platform:");
      for (const p of platforms) console.log(`    ${String(p?.key ?? "?").padEnd(12)}${fmt(num(p?.mentions)).padStart(10)} mentions${fmt(num(p?.ai_search_volume)).padStart(12)} ai vol`);
      // The split matters more than the total. ChatGPT and Google's AI
      // surfaces are separate audiences, and being cited by one says
      // nothing about the other.
      if (!platforms.some((p) => p?.key === "google" && num(p?.mentions))) {
        console.log("    -> no citations on GOOGLE's AI surfaces, which is where the volume is.");
      }
    }
    const us = sources.find((r) => String(r?.key ?? "").replace(/^www\./, "") === OURS);
    console.log("");
    if (!us) console.log(`  ${OURS}: not cited in any sampled answer.`);
    else console.log(`  ${OURS}: cited ${fmt(num(us.mentions))} times (ai search volume ${fmt(num(us.ai_search_volume))}).`);
  }

  console.log("");
  console.log(`  spent $${led.spentUsd.toFixed(4)} of $${led.budgetUsd.toFixed(2)} budget`);
  console.log(`  saved ${OUT}`);
  try {
    const bal = Number(await balance());
    if (Number.isFinite(bal)) console.log(`  account balance $${bal.toFixed(2)}`);
  } catch {
    /* balance is a convenience, never a failure */
  }
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
});

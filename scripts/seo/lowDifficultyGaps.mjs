#!/usr/bin/env node
// LOW-DIFFICULTY GAPS (2026-09-21).
//
//   node scripts/seo/lowDifficultyGaps.mjs
//   node scripts/seo/lowDifficultyGaps.mjs --budget=0.60 --max-difficulty=12
//
// Batch 10 came from one observation: "pokemon card list" (8,100/mo,
// difficulty 2) and "pokemon set list" (4,400/mo, difficulty 2) were both
// answered in full by a page that had simply never used the phrase. That
// is the cheapest kind of win there is - no new content, no new page,
// just saying the words on a page that already earns them.
//
// The deep audit found those two by hand from a short keyword list. This
// searches properly: it asks DataForSEO for keyword ideas around what the
// site actually holds, keeps the low-difficulty ones with real volume,
// and then - locally and for free - checks each against the routes that
// already exist and the copy those routes already ship.
//
// The output is deliberately three columns of judgement, not a to-do
// list: a term we already rank for needs nothing, a term with no page
// behind it is a content decision, and only "page exists, phrase absent"
// is the batch-10 shape.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { post, ledger, LOCATIONS } from "./dataforseo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const MAX_DIFFICULTY = Number(args["max-difficulty"] ?? 12);
const MIN_VOLUME = Number(args["min-volume"] ?? 300);
const led = ledger(Number(args.budget ?? 0.60));

// Seeds describe what the site genuinely holds, so an idea that comes
// back is one we could plausibly already answer. No seed for anything we
// do not have (no grading service, no sealed-case breaks, no buying).
const SEEDS = [
  "pokemon card list",
  "pokemon set list",
  "pokemon card checklist",
  "pokemon card prices",
  "pokemon card value",
  "pokemon card database",
];

// The pages whose copy is checked for the phrase. Each is a real route
// that already holds the relevant content.
const PAGES = [
  ["/", "app/page.js"],
  ["/cards", "app/cards/page.js"],
  ["/sets", "app/sets/page.js"],
  ["/pokemon", "app/pokemon/page.js"],
  ["/deals", "app/deals/page.js"],
  ["/search", "app/search/page.js"],
  ["/market-data", "app/market-data/page.js"],
  ["/guides", "app/guides/page.js"],
];

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

function pageCopy() {
  const out = [];
  for (const [route, file] of PAGES) {
    const p = join(ROOT, file);
    if (!existsSync(p)) continue;
    // Strip comments: a phrase in a rationale comment is not on the page.
    const text = readFileSync(p, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    out.push({ route, text: norm(text) });
  }
  return out;
}

function alreadyRanked() {
  // Terms we already rank for are not gaps. Reuse the ranked-keywords
  // pull from the first read rather than paying for it again.
  const p = join(ROOT, "docs/seo/dataforseo/2026-09-21/labs-ranked-keywords.json");
  if (!existsSync(p)) return new Map();
  try {
    const json = JSON.parse(readFileSync(p, "utf8"));
    const items = json?.tasks?.[0]?.result?.[0]?.items ?? [];
    return new Map(
      items
        .map((i) => [norm(i?.keyword_data?.keyword), i?.ranked_serp_element?.serp_item?.rank_absolute])
        .filter(([k]) => k)
    );
  } catch {
    return new Map();
  }
}

async function main() {
  console.log(`Low-difficulty gaps - ${SEEDS.length} seeds, difficulty <= ${MAX_DIFFICULTY}, volume >= ${MIN_VOLUME}\n`);

  const json = await post(
    "/dataforseo_labs/google/keyword_ideas/live",
    [
      {
        keywords: SEEDS,
        location_code: LOCATIONS.US,
        language_code: "en",
        limit: 1000,
        filters: [
          ["keyword_info.search_volume", ">=", MIN_VOLUME],
          "and",
          ["keyword_properties.keyword_difficulty", "<=", MAX_DIFFICULTY],
        ],
        order_by: ["keyword_info.search_volume,desc"],
      },
    ],
    { ledger: led }
  );

  const out = join(ROOT, "docs/seo/dataforseo/2026-09-21/keyword-ideas-lowdiff.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(json, null, 2));

  const items = json?.tasks?.[0]?.result?.[0]?.items ?? [];
  const ranked = alreadyRanked();
  const copy = pageCopy();

  const rows = items
    .map((i) => ({
      keyword: norm(i?.keyword_info?.keyword ?? i?.keyword),
      volume: i?.keyword_info?.search_volume ?? null,
      difficulty: i?.keyword_properties?.keyword_difficulty ?? null,
    }))
    .filter((r) => r.keyword && r.volume != null);

  const gaps = [];
  for (const r of rows) {
    const rank = ranked.get(r.keyword) ?? null;
    const onPage = copy.filter((c) => c.text.includes(r.keyword)).map((c) => c.route);
    gaps.push({ ...r, rank, onPage });
  }

  const shape = (g) => (g.rank != null ? "already ranking" : g.onPage.length ? "phrase used, not ranking" : "phrase absent");
  const buckets = { "phrase absent": [], "phrase used, not ranking": [], "already ranking": [] };
  for (const g of gaps) buckets[shape(g)].push(g);

  console.log(`  ${rows.length} ideas met the filters\n`);
  for (const [label, list] of Object.entries(buckets)) {
    if (list.length === 0) continue;
    console.log(`  ${label.toUpperCase()} (${list.length})`);
    for (const g of list.slice(0, 20)) {
      const where = g.onPage.length ? `  on ${g.onPage.join(", ")}` : "";
      const pos = g.rank != null ? `  pos ${g.rank}` : "";
      console.log(`      ${String(g.volume).padStart(6)}/mo  kd ${String(g.difficulty).padStart(2)}  ${g.keyword}${where}${pos}`);
    }
    console.log("");
  }

  console.log("  Reading this: only PHRASE ABSENT with a page that genuinely answers the");
  console.log("  term is the batch-10 shape. Everything else is a content decision or");
  console.log("  already working. Check the page really answers it before using the words.");
  console.log(`\n  spent $${led.spentUsd.toFixed(4)} of $${led.budgetUsd.toFixed(2)} budget`);
  console.log(`  saved ${out.replace(ROOT, "").replace(/\\/g, "/").replace(/^\//, "")}`);
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
});

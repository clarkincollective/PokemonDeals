// DataForSEO first read (2026-09-20) - the evidence the growth record has
// been missing, bought once and written to disk:
//
//   1. Backlinks summary for our domain, the clone and the value-intent
//      competitors -> the referring-domain count stops being UNKNOWN.
//   2. Labs ranked keywords for our domain (what Google already ranks us
//      for, with volumes) and a rank overview.
//   3. Labs bulk search volume for the intents the backlog targets.
//   4. Live Google positions (US; a few UK) for the core queries.
//
//   node scripts/seo/dfsFirstRead.mjs [--budget=0.5] [--out=docs/seo/dataforseo/<date>]
//
// Stops the moment the budget is spent; prints the ledger at the end.
// Output files contain provider data only - no credentials.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOCATIONS, ledger, post, firstResult, balance, BudgetExceeded } from "./dataforseo.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const BUDGET = Number(args.budget ?? 0.5);
const DAY = new Date().toISOString().slice(0, 10);
const OUT = args.out ?? join("docs", "seo", "dataforseo", DAY);
mkdirSync(OUT, { recursive: true });
const led = ledger(BUDGET);
const save = (name, data) => writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 2));

const OUR = "pokemondealfinder.com";
const DOMAINS = [OUR, "pokedealfinder.uk", "pricecharting.com", "pokemonpricetracker.com", "pokescope.co"];
const KEYWORDS = [
  "pokemon card deals", "pokemon cards below market price", "cheap pokemon cards ebay", "pokemon deal finder",
  "charizard base set card value", "base set charizard worth", "shadowless charizard price", "shadowless arcanine",
  "pokemon card price checker", "how much is my pokemon card worth", "pokemon card value lookup",
  "pokemon 30th celebration card list", "pokemon 30th celebration price list", "pikachu ex 30th celebration price",
  "umbreon vmax alt art price", "pokemon card grading scale", "raw vs graded pokemon cards",
  "delta reign release date", "pokemon delta reign", "pokemon booster box prices",
  "is buying pokemon cards on ebay safe", "graded pokemon card deals", "pokemon card deals under 25", "vintage pokemon cards worth buying",
];
const SERP_QUERIES = [
  ["charizard base set card value", "US"], ["pokemon card deals", "US"], ["pokemon 30th celebration card list", "US"],
  ["shadowless charizard price", "US"], ["how much is my pokemon card worth", "US"], ["pokemon card price checker", "US"],
  ["delta reign release date", "US"], ["pokemon card deals", "UK"], ["pokemon 30th celebration price list", "UK"], ["pokemon card deals", "AU"],
];

const summary = { day: DAY, budgetUsd: BUDGET, backlinks: {}, rankOverview: null, rankedKeywords: null, volumes: null, serp: [], errors: [] };

async function step(name, fn) {
  try { await fn(); } catch (e) {
    if (e instanceof BudgetExceeded) { summary.errors.push(`${name}: ${e.message}`); return false; }
    summary.errors.push(`${name}: ${e.message}`);
  }
  return true;
}

// 1. backlinks summary - one task per domain (per-task pricing)
for (const d of DOMAINS) {
  const ok = await step(`backlinks:${d}`, async () => {
    const json = await post("/backlinks/summary/live", [{ target: d, include_subdomains: true, exclude_internal_backlinks: true }], { ledger: led });
    const { error, result } = firstResult(json);
    summary.backlinks[d] = error ? { error } : {
      referring_domains: result?.referring_domains ?? null,
      referring_main_domains: result?.referring_main_domains ?? null,
      backlinks: result?.backlinks ?? null,
      rank: result?.rank ?? null,
      first_seen: result?.first_seen ?? null,
      referring_domains_nofollow: result?.referring_domains_nofollow ?? null,
    };
    save(`backlinks-${d}`, json);
  });
  if (!ok) break;
}

// 2. Labs: rank overview + ranked keywords for our domain (US)
await step("labs:rank_overview", async () => {
  const json = await post("/dataforseo_labs/google/domain_rank_overview/live", [{ target: OUR, location_code: LOCATIONS.US, language_code: "en" }], { ledger: led });
  const { error, result } = firstResult(json);
  summary.rankOverview = error ? { error } : result?.items?.[0]?.metrics ?? result?.items?.[0] ?? null;
  save("labs-rank-overview", json);
});
await step("labs:ranked_keywords", async () => {
  const json = await post("/dataforseo_labs/google/ranked_keywords/live", [{ target: OUR, location_code: LOCATIONS.US, language_code: "en", limit: 100, order_by: ["keyword_data.keyword_info.search_volume,desc"] }], { ledger: led });
  const { error, result } = firstResult(json);
  summary.rankedKeywords = error ? { error } : {
    total_count: result?.total_count ?? null,
    items: (result?.items ?? []).map((i) => ({
      keyword: i.keyword_data?.keyword,
      volume: i.keyword_data?.keyword_info?.search_volume ?? null,
      position: i.ranked_serp_element?.serp_item?.rank_absolute ?? null,
      url: i.ranked_serp_element?.serp_item?.url ?? null,
      etv: i.ranked_serp_element?.serp_item?.etv ?? null,
    })),
  };
  save("labs-ranked-keywords", json);
});

// 3. Labs bulk search volume for the target intents (US)
await step("labs:bulk_search_volume", async () => {
  const json = await post("/dataforseo_labs/google/bulk_keyword_difficulty/live", [{ keywords: KEYWORDS, location_code: LOCATIONS.US, language_code: "en" }], { ledger: led }).catch(() => null);
  if (json) save("labs-keyword-difficulty", json);
  const vol = await post("/dataforseo_labs/google/bulk_search_volume/live", [{ keywords: KEYWORDS, location_code: LOCATIONS.US, language_code: "en" }], { ledger: led });
  const { error, result } = firstResult(vol);
  const kd = json ? Object.fromEntries((firstResult(json).result?.items ?? []).map((i) => [i.keyword, i.keyword_difficulty ?? null])) : {};
  summary.volumes = error ? { error } : (result?.items ?? []).map((i) => ({ keyword: i.keyword, volume: i.keyword_info?.search_volume ?? null, cpc: i.keyword_info?.cpc ?? null, difficulty: kd[i.keyword] ?? null }));
  save("labs-bulk-search-volume", vol);
});

// 4. Live SERP positions for the core queries
for (const [q, loc] of SERP_QUERIES) {
  const ok = await step(`serp:${q}:${loc}`, async () => {
    const json = await post("/serp/google/organic/live/regular", [{ keyword: q, location_code: LOCATIONS[loc], language_code: "en", depth: 30 }], { ledger: led });
    const { error, result } = firstResult(json);
    const items = (result?.items ?? []).filter((i) => i.type === "organic");
    const ours = items.find((i) => String(i.domain ?? "").includes(OUR));
    summary.serp.push({
      query: q, market: loc, error,
      our_position: ours?.rank_absolute ?? null, our_url: ours?.url ?? null,
      top10: items.slice(0, 10).map((i) => ({ pos: i.rank_absolute, domain: i.domain, title: String(i.title ?? "").slice(0, 80) })),
    });
    save(`serp-${loc}-${q.replace(/[^a-z0-9]+/gi, "-")}`, json);
  });
  if (!ok) break;
}

summary.ledger = led;
summary.balanceAfter = await balance().catch(() => null);
save("summary", summary);
console.log(JSON.stringify({ spentUsd: Number(led.spentUsd.toFixed(4)), calls: led.calls.length, balanceAfter: summary.balanceAfter?.balance ?? null, errors: summary.errors, out: OUT }, null, 1));

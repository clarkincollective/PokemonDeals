// Run with: node scripts/syncJapaneseCatalog.js
//
// One-off local run of the same crawl app/api/sync-watchlist/route.js does
// (?language=japanese), but outside the request/response cycle - the full
// 442-set crawl takes longer than Vercel's function timeout allows (a
// direct run via the deployed route hit a 504 partway through). Safe to
// re-run: every upsert is idempotent (onConflict "name,set,language").
require("dotenv").config({ path: ".env.local" });
const { listSets, listSetCards, pickMarketPrice } = require("../lib/pokemonPriceTracker");
const { supabaseAdmin } = require("../lib/supabaseAdmin");

const EXTENDED_MIN_VALUE_USD = 15;
const NON_SINGLE_PATTERN =
  /\b(booster|box|pack|tin|collection|bundle|elite trainer|deck|blister|display|case)\b/i;
const REQUEST_DELAY_MS = 300;
const UPSERT_CHUNK_SIZE = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const db = supabaseAdmin();

  const { data: manualRows } = await db.from("watchlist").select("name, set").eq("source", "manual");
  const manualKeys = new Set((manualRows ?? []).map((row) => `${row.name}|${row.set}`));

  const sets = await listSets("japanese");
  console.log(`${sets.length} Japanese sets to crawl.`);

  let extendedCount = 0;
  let skipped = 0;
  const errors = [];
  const seenKeys = new Set();

  for (const [setIndex, set] of sets.entries()) {
    process.stdout.write(`(${setIndex + 1}/${sets.length}) ${set.name} ... `);

    let cards;
    try {
      cards = await listSetCards(set.tcgPlayerId, "japanese");
    } catch (err) {
      const retryMatch = err.message.match(/"retryAfter":(\d+)/);
      if (retryMatch) {
        const waitMs = (Number(retryMatch[1]) + 2) * 1000;
        console.log(`rate limited, waiting ${waitMs}ms`);
        await sleep(waitMs);
        try {
          cards = await listSetCards(set.tcgPlayerId, "japanese");
        } catch (retryErr) {
          errors.push(`${set.name}: ${retryErr.message}`);
          console.log("failed twice, skipping");
          await sleep(REQUEST_DELAY_MS);
          continue;
        }
      } else {
        errors.push(`${set.name}: ${err.message}`);
        console.log(`failed: ${err.message}`);
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
    }

    const setRows = [];
    for (const card of cards) {
      if (NON_SINGLE_PATTERN.test(card.name)) {
        skipped++;
        continue;
      }

      const price = card.prices?.conditions?.["Near Mint"]?.price ?? pickMarketPrice(card.prices, "Near Mint");
      if (price == null || price < EXTENDED_MIN_VALUE_USD) {
        skipped++;
        continue;
      }

      const cardName = card.name;
      const cardSet = card.setName ?? set.name;
      seenKeys.add(`${cardName}|${cardSet}`);

      if (manualKeys.has(`${cardName}|${cardSet}`)) {
        skipped++;
        continue;
      }

      setRows.push({
        name: cardName,
        set: cardSet,
        justtcg_tcgplayer_id: String(card.tcgPlayerId),
        justtcg_condition: "Near Mint",
        active: true,
        source: "auto",
        tier: "extended",
        last_known_price: price,
        language: "japanese",
      });
    }

    if (setRows.length > 0) {
      for (let i = 0; i < setRows.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = setRows.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error } = await db.from("watchlist").upsert(chunk, { onConflict: "name,set,language" });
        if (error) errors.push(`${set.name} chunk ${i}: ${error.message}`);
        else extendedCount += chunk.length;
      }
    }

    console.log(`${setRows.length} added/updated`);
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("\nRetiring stale Japanese auto rows not seen this run...");
  const { data: autoRows } = await db
    .from("watchlist")
    .select("id, name, set")
    .eq("source", "auto")
    .eq("language", "japanese");
  const staleIds = (autoRows ?? [])
    .filter((row) => !seenKeys.has(`${row.name}|${row.set}`))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await db.from("watchlist").update({ active: false }).in("id", staleIds);
  }

  console.log(`\nDone. extendedCount=${extendedCount} skipped=${skipped} retired=${staleIds.length}`);
  if (errors.length > 0) {
    console.log(`\n${errors.length} errors:`);
    errors.forEach((e) => console.log(" -", e));
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

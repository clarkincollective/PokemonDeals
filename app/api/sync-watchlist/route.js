import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  listSets,
  listSetCards,
  downloadPrintingsExport,
  pickMarketPrice,
  isSentinelPrice,
} from "@/lib/pokemonPriceTracker";

// Pages through the entire Pokemon catalog, so this can take a while -
// give it room instead of the default timeout.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Checking a real competitor's live deals (pokedealfinder.uk) showed the
// overwhelming majority of genuine deals are $15-$200 cards, not $1,200+
// chase cards - the old $1,200 floor was structurally excluding almost
// the whole range where real, frequent deals actually exist. Auto-synced
// cards now all land in "extended" (a $1,200+ floor here would just
// starve the real sweet spot of budget); "priority" is reserved for your
// hand-picked manual cards, which get a faster cadence for cheap since
// there are only ~30 of them. See refresh-deals/route.js for how the
// resulting ~5,000-card extended tier is split across two days to fit
// eBay's ~5,000/day request cap.
const PRIORITY_MIN_VALUE_USD = Infinity;
const EXTENDED_MIN_VALUE_USD = 15;

// Sealed product isn't a "card" for our purposes.
const NON_SINGLE_PATTERN =
  /\b(booster|box|pack|tin|collection|bundle|elite trainer|deck|blister|display|case)\b/i;
// PokemonPriceTracker's Business tier allows 500 req/min - one request per
// set (not per page, unlike the old JustTCG pagination) comfortably fits
// with a small safety margin.
const REQUEST_DELAY_MS = 300;
const UPSERT_CHUNK_SIZE = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function classifyTier(price) {
  // A PokemonPriceTracker "no data" sentinel (999, 9999, ...) is not a
  // real value - don't add the card (and don't store the sentinel as
  // last_known_price for the scanner to trust later).
  if (!Number.isFinite(price) || isSentinelPrice(price)) return null;
  if (price >= PRIORITY_MIN_VALUE_USD) return "priority";
  if (price >= EXTENDED_MIN_VALUE_USD) return "extended";
  return null;
}

async function chunkedUpsert(db, rows) {
  let priorityCount = 0;
  let extendedCount = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await db.from("watchlist").upsert(chunk, { onConflict: "name,set,language" });
    if (error) {
      errors.push(`chunk ${i}: ${error.message}`);
    } else {
      for (const row of chunk) {
        if (row.tier === "priority") priorityCount++;
        else extendedCount++;
      }
    }
  }

  return { priorityCount, extendedCount, errors };
}

// Scoped to one language - without this, running a Japanese-only sync
// (seenKeys containing only Japanese cards) would see every existing
// English auto row as "not in this run" and retire the entire English
// catalog.
async function retireStaleAutoRows(db, seenKeys, language) {
  // Paginated - Supabase/PostgREST silently caps an unranged request at
  // 1,000 rows, and the English auto catalog alone is ~5,000+ rows (found
  // via a live audit - the same class of bug that was limiting
  // refresh-deals' watchlist queries to ~1,000 of ~8,500 real rows).
  // Without this, only the first 1,000 auto rows would ever be checked
  // for staleness - real stale rows past that point would just never get
  // retired.
  let autoRows = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("watchlist")
      .select("id, name, set")
      .eq("source", "auto")
      .eq("language", language)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    autoRows = autoRows.concat(data);
    if (data.length < 1000) break;
  }
  const staleIds = autoRows
    .filter((row) => !seenKeys.has(`${row.name}|${row.set}`))
    .map((row) => row.id);

  if (staleIds.length > 0) {
    await db.from("watchlist").update({ active: false }).in("id", staleIds);
  }
  return staleIds.length;
}

// The fast, cheap path: one CSV download (zero API credits) covering the
// entire catalog across every printing, instead of 218 individual
// fetchAllInSet requests (~29,000 credits, several minutes, and prone to
// per-minute rate limits on large sets).
//
// NOT YET LIVE-TESTED against a real downloaded file - PokemonPriceTracker
// caps exports at 2 downloads/day and both were used up while building
// this. Written against their documented CSV schema; verify column names
// and a sample of parsed rows before trusting this over the proven
// set-crawl path below. Trigger with ?useExport=true.
async function syncViaExport(db, manualKeys) {
  const rows = await downloadPrintingsExport();

  // Multiple printings share one tcgPlayerId - take the highest-value
  // printing's price so we don't undercount a card because a cheap
  // printing happens to be "primary".
  const byCard = new Map();
  let skipped = 0;

  for (const row of rows) {
    if (NON_SINGLE_PATTERN.test(row.name ?? "")) {
      skipped++;
      continue;
    }

    const price = parseFloat(row.marketNearMint || row.marketPrice);
    if (!Number.isFinite(price)) {
      skipped++;
      continue;
    }

    const existing = byCard.get(row.tcgPlayerId);
    if (!existing || price > existing.price) {
      byCard.set(row.tcgPlayerId, { name: row.name, set: row.setName, price });
    }
  }

  const seenKeys = new Set();
  const upsertRows = [];

  for (const [tcgPlayerId, card] of byCard) {
    const tier = classifyTier(card.price);
    if (!tier) {
      skipped++;
      continue;
    }

    seenKeys.add(`${card.name}|${card.set}`);
    if (manualKeys.has(`${card.name}|${card.set}`)) {
      skipped++;
      continue;
    }

    upsertRows.push({
      name: card.name,
      set: card.set,
      justtcg_tcgplayer_id: String(tcgPlayerId),
      justtcg_condition: "Near Mint",
      active: true,
      source: "auto",
      tier,
      last_known_price: card.price,
      language: "english",
    });
  }

  const { priorityCount, extendedCount, errors } = await chunkedUpsert(db, upsertRows);
  const retired = await retireStaleAutoRows(db, seenKeys, "english");

  return {
    method: "export",
    rowsInCsv: rows.length,
    uniqueCards: byCard.size,
    priorityCount,
    extendedCount,
    skipped,
    retired,
    errors,
  };
}

// The proven, slower path: one request per set (218 total). Kept as the
// default until syncViaExport is verified against real data.
async function syncViaSetCrawl(db, manualKeys, maxSets, language) {
  const allSets = await listSets(language);
  const sets = maxSets ? allSets.slice(0, maxSets) : allSets;

  let priorityCount = 0;
  let extendedCount = 0;
  let skipped = 0;
  const errors = [];
  const seenKeys = new Set();

  for (const [setIndex, set] of sets.entries()) {
    console.log(`[sync-watchlist] (${setIndex + 1}/${sets.length}) ${set.name}`);

    // A single fetchAllInSet call costs one credit per card *toward the
    // per-minute rate limit too* - a big set (200-300+ cards) can burn
    // through the whole per-minute budget in one request. Retry once
    // after the API's own suggested cooldown instead of losing that set.
    let cards;
    try {
      cards = await listSetCards(set.tcgPlayerId, language);
    } catch (err) {
      const retryMatch = err.message.match(/"retryAfter":(\d+)/);
      if (retryMatch) {
        const waitMs = (Number(retryMatch[1]) + 2) * 1000;
        console.log(`[sync-watchlist] rate limited on ${set.name}, waiting ${waitMs}ms`);
        await sleep(waitMs);
        try {
          cards = await listSetCards(set.tcgPlayerId, language);
        } catch (retryErr) {
          errors.push(`${set.name}: ${retryErr.message}`);
          await sleep(REQUEST_DELAY_MS);
          continue;
        }
      } else {
        errors.push(`${set.name}: ${err.message}`);
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
      const tier = price != null ? classifyTier(price) : null;
      if (!tier) {
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
        tier,
        last_known_price: price,
        language,
      });
    }

    if (setRows.length > 0) {
      const { error } = await db.from("watchlist").upsert(setRows, { onConflict: "name,set,language" });
      if (error) {
        errors.push(`${set.name}: ${error.message}`);
      } else {
        for (const row of setRows) {
          if (row.tier === "priority") priorityCount++;
          else extendedCount++;
        }
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const retired = maxSets ? 0 : await retireStaleAutoRows(db, seenKeys, language);

  return {
    method: "set-crawl",
    setsScanned: sets.length,
    totalSets: allSets.length,
    priorityCount,
    extendedCount,
    skipped,
    retired,
    errors,
  };
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const useExport = url.searchParams.get("useExport") === "true";
  // ?maxSets=5 for a quick, safe test pass of the set-crawl path instead
  // of the full catalog (218 English sets / 442 Japanese sets).
  const maxSets = Number(url.searchParams.get("maxSets")) || null;
  // ?language=japanese - PokemonPriceTracker's other real catalog (see
  // supabase/watchlist_language_migration.sql). useExport's CSV path is
  // English-only (untested even for that - see syncViaExport above), so
  // language only applies to the set-crawl path.
  const languageParam = url.searchParams.get("language");
  const language = languageParam === "japanese" ? "japanese" : "english";

  const db = supabaseAdmin();

  // Cards you've hand-picked must never get silently reclassified as
  // "auto" just because the catalog crawl also found them - skip
  // upserting anything that matches an existing manual entry.
  const { data: manualRows } = await db.from("watchlist").select("name, set").eq("source", "manual");
  const manualKeys = new Set((manualRows ?? []).map((row) => `${row.name}|${row.set}`));

  const result = useExport
    ? await syncViaExport(db, manualKeys)
    : await syncViaSetCrawl(db, manualKeys, maxSets, language);

  return Response.json({
    ...result,
    priorityMinValueUsd: PRIORITY_MIN_VALUE_USD,
    extendedMinValueUsd: EXTENDED_MIN_VALUE_USD,
    syncedAt: new Date().toISOString(),
  });
}

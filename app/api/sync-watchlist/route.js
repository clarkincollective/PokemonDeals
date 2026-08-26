import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listSets, listSetCards } from "@/lib/justtcg";

// Pages through JustTCG's entire Pokemon catalog, so this can take a
// while - give it room instead of the default timeout.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Two tiers, so a small set of genuinely valuable cards can be scanned
// very frequently (that's where affiliate clicks/revenue actually come
// from) while the broader catalog still gets swept for coverage without
// competing for the same request budget.
const PRIORITY_MIN_VALUE_USD = 25;
const EXTENDED_MIN_VALUE_USD = 5;

const PAGE_SIZE = 100;
// Sealed product isn't a "card" for our purposes.
const NON_SINGLE_PATTERN =
  /\b(booster|box|pack|tin|collection|bundle|elite trainer|deck|blister|display|case)\b/i;
// Keeps well under JustTCG's per-minute rate limit across the ~200-300
// requests a full catalog pass takes.
const REQUEST_DELAY_MS = 650;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function classifyTier(price) {
  if (price >= PRIORITY_MIN_VALUE_USD) return "priority";
  if (price >= EXTENDED_MIN_VALUE_USD) return "extended";
  return null;
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?maxSets=5 for a quick, safe test pass instead of the full ~216-set
  // catalog - not used in production (vercel.json calls this with no params).
  const maxSets = Number(new URL(request.url).searchParams.get("maxSets")) || null;

  const db = supabaseAdmin();
  const allSets = await listSets();
  const sets = maxSets ? allSets.slice(0, maxSets) : allSets;

  let priorityCount = 0;
  let extendedCount = 0;
  let skipped = 0;
  const errors = [];
  const seenKeys = new Set();

  for (const [setIndex, set] of sets.entries()) {
    console.log(`[sync-watchlist] (${setIndex + 1}/${sets.length}) ${set.id}`);
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let page;
      try {
        page = await listSetCards(set.id, offset, PAGE_SIZE);
      } catch (err) {
        errors.push(`${set.id} offset ${offset}: ${err.message}`);
        break;
      }

      hasMore = page.meta?.hasMore ?? false;
      offset += PAGE_SIZE;

      // Collect this page's qualifying cards and upsert them in one call
      // instead of one round-trip per card - the original full-catalog
      // run was doing hundreds of sequential single-row writes, which is
      // what actually made it so slow.
      const pageRows = [];
      for (const card of page.data ?? []) {
        if (NON_SINGLE_PATTERN.test(card.name)) {
          skipped++;
          continue;
        }

        const bestVariant =
          card.variants?.find((v) => v.condition === "Near Mint") ?? card.variants?.[0];
        const tier = bestVariant?.price != null ? classifyTier(bestVariant.price) : null;
        if (!tier) {
          skipped++;
          continue;
        }

        const cardName = card.name;
        const cardSet = card.set_name ?? card.set;
        seenKeys.add(`${cardName}|${cardSet}`);

        pageRows.push({
          name: cardName,
          set: cardSet,
          justtcg_tcgplayer_id: String(card.tcgplayerId),
          justtcg_condition: "Near Mint",
          active: true,
          source: "auto",
          tier,
        });
      }

      if (pageRows.length > 0) {
        const { error } = await db
          .from("watchlist")
          .upsert(pageRows, { onConflict: "name,set" });

        if (error) {
          errors.push(`${set.id} offset ${offset}: ${error.message}`);
        } else {
          for (const row of pageRows) {
            if (row.tier === "priority") priorityCount++;
            else extendedCount++;
          }
        }
      }

      await sleep(REQUEST_DELAY_MS);
    }
  }

  // Retire auto-added cards that dropped below the value threshold (or
  // otherwise didn't show up this pass) - never touches manually-added
  // rows, since those have source = 'manual'. Skipped entirely on a
  // partial (?maxSets=) test run, since most of the catalog wouldn't
  // have been visited.
  let staleIds = [];
  if (!maxSets) {
    const { data: autoRows } = await db
      .from("watchlist")
      .select("id, name, set")
      .eq("source", "auto");

    staleIds = (autoRows ?? [])
      .filter((row) => !seenKeys.has(`${row.name}|${row.set}`))
      .map((row) => row.id);

    if (staleIds.length > 0) {
      await db.from("watchlist").update({ active: false }).in("id", staleIds);
    }
  }

  return Response.json({
    setsScanned: sets.length,
    totalSets: allSets.length,
    priorityCount,
    extendedCount,
    skipped,
    retired: staleIds.length,
    errors,
    priorityMinValueUsd: PRIORITY_MIN_VALUE_USD,
    extendedMinValueUsd: EXTENDED_MIN_VALUE_USD,
    syncedAt: new Date().toISOString(),
  });
}

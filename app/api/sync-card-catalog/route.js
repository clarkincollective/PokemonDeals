import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listSets, listSetCards } from "@/lib/pokemonPriceTracker";
import { extractSpecies } from "@/lib/pokemonSpecies";

// Daily sync of PokemonPriceTracker's full card catalogue into our own
// `card_catalog` table - the browsing layer's source of "every card of a
// species" + a reference market price for the ones with no active eBay
// deal. Cached in our DB, never re-exposed as a feed (PPT terms - see
// IMPLEMENTATION_STATUS "Phase 1 licensing check").
//
// One request per set via listSetCards (219 English sets). PPT's own
// docs put a full set-by-set crawl at ~29,000 credits - ~15% of the
// Business tier's 200,000/day - and 219 requests is nothing against
// 500/min. `chunks`/`chunk` split it across runs for resumability;
// `maxSets` is for a quick test pass.
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const UPSERT_CHUNK = 500;
const REQUEST_DELAY_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Deterministic set -> chunk assignment (hash of set id), so `chunk=1 of
// chunks=4` is a stable ~quarter of the catalogue and a run only ever
// touches its own slice.
function chunkOf(key, totalChunks) {
  let hash = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return (hash % totalChunks) + 1;
}

function normalizeType(t) {
  if (!t) return null;
  const s = String(t).toLowerCase();
  if (s.includes("energy")) return "Energy";
  if (s.includes("trainer") || s.includes("supporter") || s.includes("stadium") || s.includes("item")) return "Trainer";
  return "Pokémon";
}

async function upsertRows(db, rows) {
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const slice = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await db.from("card_catalog").upsert(slice, { onConflict: "tcgplayer_id" });
    if (error) return { written, error: error.message };
    written += slice.length;
  }
  return { written, error: null };
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const language = url.searchParams.get("language") || "english";
  const maxSets = Number(url.searchParams.get("maxSets")) || null;
  const chunks = Number(url.searchParams.get("chunks")) || null;
  const chunk = Number(url.searchParams.get("chunk")) || null;

  const db = supabaseAdmin();
  const started = Date.now();

  let allSets;
  try {
    allSets = await listSets(language);
  } catch (err) {
    return Response.json({ ok: false, stage: "listSets", error: err.message }, { status: 200 });
  }

  let sets = allSets;
  if (chunks && chunk) sets = sets.filter((s) => chunkOf(s.id ?? s.tcgPlayerId ?? s.name, chunks) === chunk);
  if (maxSets) sets = sets.slice(0, maxSets);

  let setsScanned = 0;
  let cardsSeen = 0;
  let cardsUpserted = 0;
  let skippedNonCatalog = 0;
  const errors = [];

  for (const set of sets) {
    const setId = set.id ?? set.tcgPlayerId;
    if (!setId) continue;

    let cards;
    try {
      cards = await listSetCards(setId, language);
    } catch (err) {
      errors.push(`${set.name}: ${err.message}`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }
    setsScanned++;
    cardsSeen += cards.length;

    const rows = [];
    for (const c of cards) {
      const tcgplayerId = c.tcgPlayerId != null ? String(c.tcgPlayerId) : null;
      if (!tcgplayerId) {
        skippedNonCatalog++;
        continue;
      }
      const name = c.name ?? "";
      rows.push({
        tcgplayer_id: tcgplayerId,
        name,
        set: c.setName ?? set.name,
        set_id: setId != null ? String(setId) : null,
        card_number: c.cardNumber ?? null,
        rarity: c.rarity ?? null,
        card_type: normalizeType(c.cardType ?? c.pokemonType),
        // null for trainers / energy / anything extractSpecies can't
        // resolve - those never surface on a /pokemon/<slug> page.
        species: extractSpecies(name),
        language,
        market_price: Number.isFinite(Number(c.prices?.market)) ? Number(c.prices.market) : null,
        image_url: c.imageCdnUrl200 ?? c.imageUrl ?? c.imageCdnUrl ?? null,
        source: "pokemonpricetracker",
        synced_at: new Date().toISOString(),
      });
    }

    const res = await upsertRows(db, rows);
    cardsUpserted += res.written;
    if (res.error) errors.push(`${set.name} upsert: ${res.error}`);

    await sleep(REQUEST_DELAY_MS);
  }

  return Response.json({
    ok: true,
    language,
    totalSets: allSets.length,
    setsScanned,
    cardsSeen,
    cardsUpserted,
    skippedNonCatalog,
    // listSetCards bills roughly per card returned - a rough credit tally
    // for tuning cadence against the 200,000/day Business limit.
    creditsApprox: cardsSeen,
    chunk: chunks && chunk ? `${chunk}/${chunks}` : null,
    tookMs: Date.now() - started,
    errors,
  });
}

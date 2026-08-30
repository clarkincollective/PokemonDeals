import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { downloadPrintingsExport } from "@/lib/pokemonPriceTracker";
import { extractSpecies } from "@/lib/pokemonSpecies";

// Daily sync of PokemonPriceTracker's full card catalogue into our own
// `card_catalog` table - the browsing layer's source of "every card of a
// species" + a reference market price for cards with no active eBay deal.
//
// Uses PPT's /export (printings CSV): ONE request, ZERO API credits, the
// whole catalogue (~76k printing rows -> ~29k distinct English cards).
// Replaces the earlier per-set listSetCards crawl, which cost ~29k
// credits and kept 429-ing on PPT's per-minute window. /export is capped
// at 2 downloads/day, so this must stay a once-daily job.
//
// Cached in our DB, never re-exposed as a feed (PPT terms - see
// IMPLEMENTATION_STATUS "Phase 1 licensing check").
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const UPSERT_CHUNK = 500;
const CDN = "https://tcgplayer-cdn.tcgplayer.com/product";

// First positive number in the list, else null. PPT gives an empty
// string (not 0/null) for a condition it has no data for; a card can
// have e.g. only a Lightly Played price and no market/NM price.
function firstPrice(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function firstNonEmpty(...vals) {
  for (const v of vals) if (v != null && String(v).trim() !== "") return String(v);
  return null;
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const language = url.searchParams.get("language") || "english";
  const limit = Number(url.searchParams.get("limit")) || null; // test pass

  const db = supabaseAdmin();
  const started = Date.now();

  let rows;
  try {
    rows = await downloadPrintingsExport();
  } catch (err) {
    return Response.json({ ok: false, stage: "export", error: err.message }, { status: 200 });
  }

  // Merge the per-printing rows into one record per card (tcgPlayerId).
  const byId = new Map();
  for (const r of rows) {
    if ((r.language || "english") !== language) continue;
    const id = r.tcgPlayerId != null ? String(r.tcgPlayerId).trim() : null;
    if (!id) continue;
    const cur = byId.get(id) ?? {
      tcgplayer_id: id,
      name: null,
      set: null,
      set_id: null,
      card_number: null,
      rarity: null,
      prices: [],
    };
    cur.name = cur.name ?? firstNonEmpty(r.name);
    cur.set = cur.set ?? firstNonEmpty(r.setName);
    cur.set_id = cur.set_id ?? firstNonEmpty(r.setId);
    cur.card_number = cur.card_number ?? firstNonEmpty(r.cardNumber);
    cur.rarity = cur.rarity ?? firstNonEmpty(r.rarity);
    cur.prices.push(
      firstPrice(
        r.marketNearMint,
        r.marketPrice,
        r.marketLightlyPlayed,
        r.marketModeratelyPlayed,
        r.marketHeavilyPlayed,
        r.marketDamaged
      )
    );
    byId.set(id, cur);
  }

  let records = [...byId.values()].map((c) => ({
    tcgplayer_id: c.tcgplayer_id,
    name: c.name ?? "",
    set: c.set ?? "",
    set_id: c.set_id,
    card_number: c.card_number,
    rarity: c.rarity,
    card_type: null, // /export doesn't carry it; species null already gates non-Pokemon
    species: extractSpecies(c.name ?? ""),
    language,
    market_price: firstPrice(...c.prices),
    image_url: `${CDN}/${c.tcgplayer_id}_in_200x200.jpg`,
    source: "pokemonpricetracker",
    synced_at: new Date().toISOString(),
  }));
  if (limit) records = records.slice(0, limit);

  let upserted = 0;
  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const slice = records.slice(i, i + UPSERT_CHUNK);
    const { error } = await db.from("card_catalog").upsert(slice, { onConflict: "tcgplayer_id" });
    if (error) {
      return Response.json(
        { ok: false, stage: "upsert", upserted, error: error.message },
        { status: 200 }
      );
    }
    upserted += slice.length;
  }

  return Response.json({
    ok: true,
    language,
    exportRows: rows.length,
    distinctCards: byId.size,
    upserted,
    withPrice: records.filter((r) => r.market_price != null).length,
    withSpecies: records.filter((r) => r.species != null).length,
    creditsApprox: 0,
    tookMs: Date.now() - started,
  });
}

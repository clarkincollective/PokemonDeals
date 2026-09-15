import { loadCardPriceAnalysis } from "@/lib/cardPriceAnalysis";
import { resolveCatalogCardById } from "@/lib/deals";

// audit-r1 (card-page-cold-render) - the card hub's market panel data, read
// by components/CardMarketPanel after the page has rendered. Public, read-
// only, no writes. Why a route rather than the page: robots.txt disallows
// /api/, so a search crawler rendering a card page never fetches this and
// never spends a PokemonPriceTracker credit; a human visitor does, once per
// 300 s per card (the same cache the page used to fill inline), and the CDN
// serves repeats for 5 min.
//
// Only a card the catalogue knows is served: an unknown id costs nothing.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const json = (body, status, extra = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600", "X-Robots-Tag": "noindex", ...extra } });

export async function GET(request) {
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!/^\d{1,12}$/.test(id)) return json({ ok: false, reason: "invalid_id" }, 400, { "Cache-Control": "no-store" });
  const card = await resolveCatalogCardById(id);
  if (!card) return json({ ok: false, reason: "unknown_card" }, 404);
  const analysis = await loadCardPriceAnalysis(id);
  return json({ ok: true, analysis: analysis ?? null }, 200);
}

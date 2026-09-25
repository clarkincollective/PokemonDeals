import { loadCardPriceAnalysis } from "@/lib/cardPriceAnalysis";
import { resolveCatalogCardById } from "@/lib/deals";
import { buildEbaySearchLink } from "@/lib/ebayLinks";
import { buildCardSearchQuery } from "@/lib/cardSearchQuery";
import { cardDisplayName } from "@/lib/cardName";

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

// FINDING 8 / FINDING 5. The variant grid that consumes this response
// renders in the BROWSER, where EBAY_CAMPAIGN_ID is a server-only
// variable and therefore undefined - so a search href it builds itself
// carries no campid and earns nothing. Confirmed live on
// /cards/scizor-gx-hidden-fates-shiny-vault: correct query, correct
// customid, campid null. Same defect class as the sealed catalogue's
// (commit a6c4ae3), and the same fix: build the campaign-bearing href
// HERE, on the server, and let the client re-wrap only the customid,
// which wrapEbayAffiliateUrl does idempotently while preserving campid.
//
// One href per variant the grid can render: the raw tile and each graded
// tier, keyed the way the grid keys them. The query itself is the shared
// identity builder, so the API and the client cannot disagree about it.
function variantSearchHrefs(card, analysis) {
  if (!card) return null;
  const identity = {
    name: card.displayName ?? cardDisplayName(card),
    set: card.set ?? null,
    cardNumber: analysis?.cardNumber ?? card.cardNumber ?? card.card_number ?? null,
    language: card.language ?? null,
  };
  const href = (grade) =>
    buildEbaySearchLink(buildCardSearchQuery({ ...identity, grade }), undefined, {
      page: "card",
      placement: "variant",
    });
  const out = { raw: href(null) };
  for (const g of analysis?.graded ?? []) {
    if (g?.key) out[g.key] = href(g.label ?? null);
  }
  return out;
}

export async function GET(request) {
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!/^\d{1,12}$/.test(id)) return json({ ok: false, reason: "invalid_id" }, 400, { "Cache-Control": "no-store" });
  const card = await resolveCatalogCardById(id);
  if (!card) return json({ ok: false, reason: "unknown_card" }, 404);
  const analysis = await loadCardPriceAnalysis(id);
  return json({ ok: true, analysis: analysis ?? null, variantSearch: variantSearchHrefs(card, analysis) }, 200);
}

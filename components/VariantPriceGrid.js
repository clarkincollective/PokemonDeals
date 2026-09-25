import MiniSparkline from "@/components/MiniSparkline";
import AffiliateLink from "@/components/AffiliateLink";
import Price from "@/components/Price";
import { buildEbaySearchLink, wrapEbayAffiliateUrl } from "@/lib/ebayLinks";
import { withPlacement } from "@/lib/affiliateAttribution";
import { buildCardSearchQuery, cardSearchLabel } from "@/lib/cardSearchQuery";
import { hasPrice } from "@/lib/money";
import { referenceConditionLabels } from "@/lib/referenceCondition";

function formatDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// PokemonPriceTracker figures are USD-canonical; <Price> localises each
// to the viewer's currency after hydration so this grid matches the rest
// of the card page (Phase 6A currency closeout).
function Money({ usd }) {
  return <Price usd={usd} native={{ amount: usd, currency: "USD" }} approxPrefix="" />;
}

function TileContents({ label, badge, currentPrice, minPrice, maxPrice, saleCount, lastSaleDate, confidence, history, showBuyHint }) {
  return (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-black dark:text-zinc-50">{label}</span>
        {badge}
      </div>

      <MiniSparkline points={history} className="mt-1" />

      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-sm font-bold text-black dark:text-zinc-50">
          {hasPrice(currentPrice) ? <Money usd={currentPrice} /> : "—"}
        </span>
        {confidence === "limited" && (
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400" title="Passed the graded-integrity checks but on a small recent sample - treat as a rough guide.">
            limited data
          </span>
        )}
      </div>

      {hasPrice(minPrice) && hasPrice(maxPrice) && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          <Money usd={minPrice} /> – <Money usd={maxPrice} /> range
        </p>
      )}
      {saleCount != null && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {saleCount} sale{saleCount === 1 ? "" : "s"}
          {lastSaleDate && ` · last ${formatDate(lastSaleDate)}`}
        </p>
      )}
      {showBuyHint && (
        // FINDING 8: this is a SEARCH, and says so. It is never described
        // as available inventory and never implies every result matches.
        <p className="mt-1.5 text-[11px] font-semibold leading-tight text-red-600 dark:text-red-400">
          {showBuyHint} →
        </p>
      )}
    </>
  );
}

// isActive (this listing's own variant) renders as a plain, non-clickable
// tile - it's already the thing the page's main "View Deal" button
// points at, right above. Every OTHER tile is a real link out to a
// tracked eBay search for that specific grade - a visitor comparing
// variants who decides they'd rather have a different one should still
// leave through an affiliate-tracked link, not a dead end.
// FINDING 8 / FINDING 5: `searchHref` is the server-built href, which
// carries the campaign id the browser cannot add (EBAY_CAMPAIGN_ID is
// server-only, so a link this component builds for itself has no campid
// and earns nothing - confirmed live on the Scizor GX hub before this
// fix). Re-wrapping rewrites only customid and leaves campid intact.
// `searchQuery` is the fallback when the API supplied no href: the right
// query without the campaign id, which beats no link at all.
function Tile({ label, isActive, searchQuery, searchHref, searchLabel, eventData, surface, ...contentProps }) {
  const className = `block rounded-lg border p-3 text-left transition-colors ${
    isActive
      ? "border-red-400 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
  }`;

  if (isActive) {
    return (
      <div className={className}>
        <TileContents label={label} {...contentProps} />
      </div>
    );
  }

  return (
    <AffiliateLink
      href={
        searchHref
          ? wrapEbayAffiliateUrl(searchHref, withPlacement(surface, "variant"))
          : buildEbaySearchLink(searchQuery, undefined, withPlacement(surface, "variant"))
      }
      eventName="eBay Click"
      eventData={eventData}
      className={className}
    >
      <TileContents label={label} {...contentProps} showBuyHint={searchLabel} />
    </AffiliateLink>
  );
}

// Every variant of a card (raw + every graded tier with real recorded
// sales) side by side, each with its own real price history sparkline -
// activeKey (either "raw" or a grade key like "psa10") highlights whichever
// variant the deal being viewed actually is.
// `surface` is the caller page's affiliate attribution (see
// lib/affiliateAttribution.js) - this component is shared across
// /cards/[slug] ("card") and /deals/[id] ("deal_page"), so it can't
// assume its own context and must be told.
// FINDING 8: `set`, `cardNumber` and `language` are the verified identity
// this grid could not previously see - CardMarketPanel was never given
// them, so every query broadened to the bare card name. They are
// optional: an absent field is simply absent from the query, never
// guessed, and the query keeps whatever identity IS verified.
export default function VariantPriceGrid({
  raw,
  graded,
  activeKey,
  cardName,
  set = null,
  cardNumber = null,
  language = null,
  searchHrefs = null,
  surface,
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      <Tile
        label="Raw"
        // Price-condition provenance: the badge names the condition the raw
        // reference is REALLY for; "Market reference" when PPT doesn't say.
        badge={<span className="text-[11px] text-zinc-500 dark:text-zinc-400">{referenceConditionLabels(raw?.referenceCondition).short}</span>}
        isActive={activeKey === "raw"}
        searchQuery={buildCardSearchQuery({ name: cardName, set, cardNumber, language })}
        searchHref={searchHrefs?.raw ?? null}
        searchLabel={cardSearchLabel(null)}
        eventData={{ card: cardName, page: "variant_grid", variant: "raw" }}
        surface={surface}
        currentPrice={raw.currentPrice}
        minPrice={raw.minPrice}
        maxPrice={raw.maxPrice}
        saleCount={null}
        history={raw.history}
      />
      {graded.map((g) => (
        <Tile
          key={g.key}
          label={g.label}
          badge={
            g.trend && (
              <span className={`text-[11px] font-medium ${g.trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
                {g.trend === "up" ? "▲" : "▼"}
              </span>
            )
          }
          isActive={activeKey === g.key}
          searchQuery={buildCardSearchQuery({ name: cardName, set, cardNumber, language, grade: g.label })}
          searchHref={searchHrefs?.[g.key] ?? null}
          searchLabel={cardSearchLabel(g.label)}
          eventData={{ card: cardName, page: "variant_grid", variant: g.key }}
          surface={surface}
          currentPrice={g.currentPrice}
          minPrice={g.minPrice}
          maxPrice={g.maxPrice}
          saleCount={g.saleCount}
          lastSaleDate={g.lastSaleDate}
          confidence={g.confidence}
          history={g.history}
        />
      ))}
    </div>
  );
}

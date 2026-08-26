import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { buildTcgplayerLink } from "@/lib/tcgplayer";
import { MARKETPLACES } from "@/lib/ebay";
import Logo from "@/components/Logo";
import AffiliateLink from "@/components/AffiliateLink";

// Re-check for new deals at most once a minute, so the page reflects the
// latest scan quickly without hitting the database on every single visit.
export const revalidate = 60;

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Builds a link that changes one filter while keeping the others intact,
// or removes it entirely if the same value is clicked again (toggle).
function filterHref(currentParams, key, value) {
  const params = new URLSearchParams(currentParams);
  if (params.get(key) === value) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const country = typeof params.country === "string" ? params.country : null;
  const cardType = typeof params.type === "string" ? params.type : null; // "raw" | "graded"
  const listingType = typeof params.listing === "string" ? params.listing : null; // FIXED_PRICE | AUCTION

  let query = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set)")
    .eq("is_active", true)
    .order("discount_pct", { ascending: false })
    .limit(60);

  if (country) query = query.eq("marketplace", country);
  if (cardType === "raw") query = query.eq("is_graded", false);
  if (cardType === "graded") query = query.eq("is_graded", true);
  if (listingType) query = query.eq("listing_type", listingType);

  const { data: deals, error } = await query;

  const lastRefreshed = deals?.reduce(
    (latest, deal) => (deal.last_seen_at > latest ? deal.last_seen_at : latest),
    deals?.[0]?.last_seen_at ?? null
  );

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h1>
            <Logo />
          </h1>
          <p className="mt-4 max-w-xl text-zinc-600 dark:text-zinc-400">
            Live below-market Pokémon card listings from eBay US and
            Australia, checked automatically around the clock against real
            market pricing and real eBay sold-listing data - not estimates.
            Only cards genuinely priced below market make this list.
          </p>
          {lastRefreshed && (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Last refreshed {timeAgo(lastRefreshed)}
            </p>
          )}

          <TrustBadges />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <FilterBar params={params} country={country} cardType={cardType} listingType={listingType} />

        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-red-700">
            Couldn&apos;t load deals: {error.message}
          </p>
        )}

        {!error && deals?.length === 0 && (
          <p className="text-zinc-500">
            No deals match these filters right now. Try clearing a filter, or
            check back after the next scheduled scan.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {deals?.map((deal) => (
            <DealRow key={deal.id} deal={deal} />
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying
        purchases made through links on this site. Prices and availability are
        subject to change and were accurate as of the listing&apos;s last scan.
        Card-to-listing matching is automated and not perfect - always
        double-check a listing&apos;s photos and description before buying.
      </footer>
    </div>
  );
}

function Badge({ icon, bold, label }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
      <span>
        <span className="font-semibold text-black dark:text-zinc-50">{bold}</span> {label}
      </span>
    </div>
  );
}

// Deliberately real, verifiable claims only - see conversation with the
// user about why "AI-Powered" / "40K+ tracked" / "6M+ sales records"
// (numbers from a reference site) don't hold up for this project's actual
// scope and were replaced with what's actually true.
function TrustBadges() {
  const iconProps = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-5 w-5",
  };

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
      <Badge
        icon={
          <svg {...iconProps}>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="16" y1="16" x2="12.5" y2="12.5" />
          </svg>
        }
        bold="Automated"
        label="market matching"
      />
      <Badge
        icon={
          <svg {...iconProps}>
            <rect x="2.5" y="6.5" width="12" height="9" rx="1.5" />
            <path d="M6 6.5V4.5A1.5 1.5 0 0 1 7.5 3H16A1.5 1.5 0 0 1 17.5 4.5V12A1.5 1.5 0 0 1 16 13.5H15" />
          </svg>
        }
        bold="50,000+"
        label="card pricing database"
      />
      <Badge
        icon={
          <svg {...iconProps}>
            <path d="M5 3h10a1 1 0 0 1 1 1v12l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3V4a1 1 0 0 1 1-1Z" />
            <line x1="7" y1="7" x2="13" y2="7" />
            <line x1="7" y1="10" x2="13" y2="10" />
          </svg>
        }
        bold="Real"
        label="eBay sold-listing data"
      />
      <Badge
        icon={
          <svg {...iconProps}>
            <path d="M11 3.5 17 9.5a1.4 1.4 0 0 1 0 2L11.5 17a1.4 1.4 0 0 1-2 0L3 10.5V4.5A1 1 0 0 1 4 3.5h7Z" />
            <circle cx="7.5" cy="7.5" r="1" />
          </svg>
        }
        bold="Free"
        label="to browse, always"
      />
    </div>
  );
}

function FilterPill({ href, active, children }) {
  return (
    <a
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
      }`}
    >
      {children}
    </a>
  );
}

function FilterBar({ params, country, cardType, listingType }) {
  return (
    <div className="mb-8 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Country
        </span>
        {Object.entries(MARKETPLACES).map(([id, info]) => (
          <FilterPill key={id} href={filterHref(params, "country", id)} active={country === id}>
            {info.flag} {info.label}
          </FilterPill>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Card
        </span>
        <FilterPill href={filterHref(params, "type", "raw")} active={cardType === "raw"}>
          Raw
        </FilterPill>
        <FilterPill href={filterHref(params, "type", "graded")} active={cardType === "graded"}>
          Graded
        </FilterPill>

        <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Listing
        </span>
        <FilterPill
          href={filterHref(params, "listing", "FIXED_PRICE")}
          active={listingType === "FIXED_PRICE"}
        >
          Buy It Now
        </FilterPill>
        <FilterPill href={filterHref(params, "listing", "AUCTION")} active={listingType === "AUCTION"}>
          Auction
        </FilterPill>
      </div>
    </div>
  );
}

function DealRow({ deal }) {
  const cardName = deal.watchlist?.name ?? deal.title;
  const cardSet = deal.watchlist?.set;
  const discountLabel = `${Math.round(deal.discount_pct * 100)}% off`;
  const tcgplayerLink = buildTcgplayerLink(cardName);
  const isAuction = deal.listing_type === "AUCTION";
  const marketInfo = MARKETPLACES[deal.marketplace];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-950">
      {/* Thumbnail */}
      <div className="relative h-28 w-28 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-100 sm:self-auto dark:bg-zinc-900">
        {deal.image_url ? (
          <Image
            src={deal.image_url}
            alt={deal.title}
            fill
            sizes="112px"
            className="object-contain p-2"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            No image
          </div>
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            {discountLabel}
          </span>
          {deal.is_graded ? (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {deal.grader} {deal.grade}
            </span>
          ) : (
            deal.condition && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {deal.condition}
              </span>
            )
          )}
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {isAuction ? "Auction" : "Buy It Now"}
          </span>
          {marketInfo && (
            <span className="text-sm" title={marketInfo.label}>
              {marketInfo.flag}
            </span>
          )}
        </div>

        <a
          href={`/deals/${deal.id}`}
          className="mt-2 line-clamp-1 block font-semibold text-black hover:underline dark:text-zinc-50"
        >
          {cardName}
        </a>
        {cardSet && <p className="line-clamp-1 text-sm text-zinc-500">{cardSet}</p>}

        <p className="mt-1 text-xs text-zinc-400">
          Found {timeAgo(deal.first_seen_at)}
          {isAuction && deal.bid_count != null && <> &middot; {deal.bid_count} bids</>}
          {!deal.is_graded && deal.price_change_24hr != null && (
            <>
              {" "}
              &middot; market {deal.price_change_24hr >= 0 ? "+" : ""}
              {Number(deal.price_change_24hr).toFixed(1)}% (24h)
            </>
          )}
        </p>
      </div>

      {/* Price + CTA */}
      <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t border-zinc-100 pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0 sm:text-right dark:border-zinc-900">
        <div>
          {isAuction && (
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Current bid
            </div>
          )}
          <div className="text-xl font-bold text-black dark:text-zinc-50">
            ${Number(deal.total_price).toFixed(2)}
          </div>
          <div className="text-sm text-zinc-400 line-through">
            ${Number(deal.market_price).toFixed(2)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <AffiliateLink
            href={deal.affiliate_url}
            eventName="eBay Click"
            eventData={{
              card: cardName,
              marketplace: deal.marketplace,
              discountPct: Math.round(deal.discount_pct * 100),
              listingType: deal.listing_type,
              isGraded: deal.is_graded,
              page: "home",
            }}
            className="whitespace-nowrap rounded-lg bg-black px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isAuction ? "Bid on eBay →" : "View Deal on eBay →"}
          </AffiliateLink>
          <AffiliateLink
            href={tcgplayerLink}
            eventName="TCGPlayer Click"
            eventData={{ card: cardName, page: "home" }}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Check on TCGPlayer
          </AffiliateLink>
        </div>
      </div>
    </div>
  );
}

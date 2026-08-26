import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { MARKETPLACES } from "@/lib/ebay";
import { fetchBestFinds } from "@/lib/deals";
import { timeAgo } from "@/lib/time";
import Logo from "@/components/Logo";
import NavMenu from "@/components/NavMenu";
import DealCard from "@/components/DealCard";
import BestFindsBanner from "@/components/BestFindsBanner";

// Re-check for new deals at most once a minute, so the page reflects the
// latest scan quickly without hitting the database on every single visit.
export const revalidate = 60;

export const metadata = {
  alternates: { canonical: "/" },
};

// Single source of truth for the FAQ section below AND its FAQPage
// structured data - rendering both from one array means they can't drift
// out of sync the way the old hardcoded JSX + (nonexistent) schema would
// have. Google requires FAQ schema to match visible on-page content, so
// this isn't optional if the JSON-LD is going to stay honest.
const FAQ_ITEMS = [
  {
    question: "Is this free to use?",
    answer:
      "Yes, always. We earn a small commission if you buy through one of our links - it doesn't change the price you pay.",
  },
  {
    question: "How often do listings update?",
    answer:
      "New listings are discovered continuously - every 15 minutes in the US, hourly in other countries. Existing deals are reconfirmed on a tiered schedule: hand-picked cards every 4 hours across all countries, the wider catalog roughly every 10 days per country.",
  },
  {
    question: "Is the card-to-listing match always right?",
    answer:
      "Matching is automated. We filter out obviously wrong matches, but always double-check a listing's photos and description before buying.",
  },
];

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

  const PAGE_SIZE = 24;

  // Fetch a much bigger pool than we display, then keep only the single
  // best (highest-discount) listing per card - otherwise one card with
  // ten sellers can fill the whole page and crowd out everything else.
  // Sorted by freshness, not discount_pct: the sanity floor caps any
  // discount at 75%, and there are always enough deals sitting right at
  // that ceiling to permanently fill a discount-sorted top 24 - genuinely
  // new finds never surfaced, and the page looked stuck at "75% off"
  // forever even though scans were actively running. Freshest-first
  // actually shows what's new.
  let query = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set)")
    .eq("is_active", true)
    .order("first_seen_at", { ascending: false })
    .limit(500);

  if (country) query = query.eq("marketplace", country);
  if (cardType === "raw") query = query.eq("is_graded", false);
  if (cardType === "graded") query = query.eq("is_graded", true);
  if (listingType) query = query.eq("listing_type", listingType);

  const { data: pool, error } = await query;
  const { deals: bestFinds } = await fetchBestFinds({ limit: 3 });

  const seenCards = new Set();
  const deals = [];
  for (const deal of pool ?? []) {
    if (seenCards.has(deal.watchlist_id)) continue;
    seenCards.add(deal.watchlist_id);
    deals.push(deal);
    if (deals.length >= PAGE_SIZE) break;
  }

  // The true "when did we last scan anything" time, not just the newest
  // timestamp among the currently-displayed top discounts - those are
  // dominated by cards from the broad catalog sweep that only gets
  // rescanned every ~20 days, so using only the displayed page made the
  // indicator look stale even while the 15-min priority scan was actively
  // running in the background.
  const { data: lastScan } = await supabase
    .from("deals")
    .select("last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRefreshed = lastScan?.last_seen_at ?? null;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/">
            <Logo size="small" />
          </Link>
          <NavMenu />
        </div>
      </div>

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-6">
          {/* A real, page-describing H1 - the logo above is branding, not
              a heading for this page's actual content, which is what H1
              should describe. */}
          <h1 className="text-xl font-bold text-black dark:text-zinc-50 sm:text-2xl">
            Live Pokémon Card Deals on eBay
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Below-market listings from eBay US and Australia, checked automatically around the clock
            against real market pricing and real eBay sold-listing data - not estimates.
          </p>
          {lastRefreshed && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Last refreshed {timeAgo(lastRefreshed)}
            </p>
          )}

          <TrustBadges />
        </div>
      </header>

      <BestFindsBanner bestFinds={bestFinds} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
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

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals?.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      </main>

      <section id="how-it-works" className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <h2 className="text-lg font-bold text-black dark:text-zinc-50">How it works</h2>
          <ol className="mt-5 grid gap-6 sm:grid-cols-3">
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">1. We scan eBay</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Every watched card is checked against live eBay listings, several times a day.
              </p>
            </li>
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">2. We check real pricing</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Each listing is compared against real market pricing and recent eBay sold listings - not
                guesses.
              </p>
            </li>
            <li>
              <p className="font-semibold text-black dark:text-zinc-50">3. We only show genuine deals</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                A listing only makes the list if it&apos;s meaningfully below market and the seller passes
                our trust checks.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section id="faq" className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <h2 className="text-lg font-bold text-black dark:text-zinc-50">FAQ</h2>
          <div className="mt-5 flex flex-col gap-5 sm:max-w-2xl">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question}>
                <p className="font-semibold text-black dark:text-zinc-50">{item.question}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
    <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
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
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
      }`}
    >
      {children}
    </a>
  );
}

// A horizontally scrolling strip instead of wrapping pills onto a second
// line - bleeds past the page's own side padding (-mx-6/px-6) so it can
// scroll edge-to-edge, and hides the scrollbar for a cleaner look.
function ScrollRow({ children }) {
  return (
    <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function FilterBar({ params, country, cardType, listingType }) {
  return (
    <div className="mb-8 flex flex-col gap-4">
      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Country
        </span>
        <ScrollRow>
          {Object.entries(MARKETPLACES).map(([id, info]) => (
            <FilterPill key={id} href={filterHref(params, "country", id)} active={country === id}>
              {info.flag} {info.label}
            </FilterPill>
          ))}
        </ScrollRow>
      </div>

      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Card &amp; listing
        </span>
        <ScrollRow>
          <FilterPill href={filterHref(params, "type", "raw")} active={cardType === "raw"}>
            Raw
          </FilterPill>
          <FilterPill href={filterHref(params, "type", "graded")} active={cardType === "graded"}>
            Graded
          </FilterPill>
          <FilterPill
            href={filterHref(params, "listing", "FIXED_PRICE")}
            active={listingType === "FIXED_PRICE"}
          >
            Buy It Now
          </FilterPill>
          <FilterPill href={filterHref(params, "listing", "AUCTION")} active={listingType === "AUCTION"}>
            Auction
          </FilterPill>
        </ScrollRow>
      </div>
    </div>
  );
}

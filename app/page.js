import Image from "next/image";
import Link from "next/link";
import {
  fetchHomepageLanes,
  fetchLastScanTime,
  fetchCardHubs,
  fetchHubCounts,
  fetchMarketDataSummary,
  fetchSetSlugs,
  fetchSpeciesHubs,
} from "@/lib/deals";
import { buildHomepageLanes, rotationBucket } from "@/lib/homepageVariety";
import { GUIDES } from "@/lib/guides";
import { fetchIntegrityReport } from "@/lib/integrityReport";
import { timeAgo } from "@/lib/time";
import SiteHeader from "@/components/SiteHeader";
import SkipToContent from "@/components/SkipToContent";
import SiteFooter from "@/components/SiteFooter";
import RegionRedirect from "@/components/RegionRedirect";
import HeroSearch from "@/components/HeroSearch";
import MobileStickySearch from "@/components/MobileStickySearch";
import SectionHeader from "@/components/SectionHeader";
import HomeFeed from "@/components/HomeFeed";
import HomeHowItCompares, { HOME_LAST_REVIEWED } from "@/components/HomeHowItCompares";
import HomeLiveStats from "@/components/HomeLiveStats";
import HomeQuickFilters from "@/components/HomeQuickFilters";
import HomePopularPokemon from "@/components/HomePopularPokemon";
import HomeBudgetDeals from "@/components/HomeBudgetDeals";
import HomeTrustSection from "@/components/HomeTrustSection";
import HomeHeroArt from "@/components/HomeHeroArt";
import EmailCapture from "@/components/EmailCapture";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { emailEnabled } from "@/lib/email";
import { catalogImageUrl } from "@/lib/cardImage";
import { GUIDE_CARDS } from "@/lib/guideLinks";
import { buildHomeGraph } from "@/lib/jsonLd";
import JsonLd from "@/components/JsonLd";
import { HOME_TITLE, HOME_DESCRIPTION, HOME_H1 } from "@/lib/homeContent";
import { organizationSameAs } from "@/lib/socialProfiles";
import { cardDisplayName } from "@/lib/cardName";
import { normalizePublicText } from "@/lib/publicText";
import { savingsClaimTrusted } from "@/lib/dealQuality";
import { offerShipping } from "@/lib/offerPresentation";

const SITE_URL = "https://pokemondealfinder.com";

const guideBy = (slug) => GUIDES.find((g) => g.slug === slug);

// Three editorial cards for the homepage "Guides & research" section.
// The dated research leads - it is the content readers could not find,
// being two levels down under Browse > Market Data.
//
// `image` is set ONLY where the card pictured is that piece's own worked
// example: the study's example is Cubone (Jungle, tcgplayer 45153, from
// lib/studies STUDY.example) and the pricing guide cites Base Set
// Charizard (42382). The condition guide cites no single card of its own;
// it previously fell through to CardImagePlaceholder (a missing mapping,
// not a failed image). It now reuses Umbreon VMAX #215/203 (246723) - the
// verified lib/guideLinks identity the grading-scale guide in the same
// "Check condition and grade" group uses - described as such, never as
// this guide's own example. Nothing here is newly published - the study
// carries its sample window so the row cannot read as fresh.
const EDITORIAL_CARDS = [
  {
    href: "/market-data/pokemon-reference-price-changes",
    contentId: "reference-price-changes-30d",
    kicker: "Research",
    title: "30-Day Reference-Price Changes",
    description:
      "A dated study of 150 sampled product records: how many moved, and why a product summary differs from its individual condition and printing variants.",
    meta: "Sample window 12 Aug - 11 Sep 2026",
    image: catalogImageUrl("45153"),
    imageAlt: "Cubone (Jungle) - the worked example used in the study",
  },
  {
    href: "/guides/how-pokemon-card-prices-work",
    contentId: "how-pokemon-card-prices-work",
    kicker: "Guide",
    title: guideBy("how-pokemon-card-prices-work").title,
    description: guideBy("how-pokemon-card-prices-work").blurb,
    image: catalogImageUrl("42382"),
    imageAlt: "Charizard (Base Set) - an example used in the guide",
  },
  {
    href: "/guides/how-to-check-pokemon-card-condition",
    contentId: "how-to-check-pokemon-card-condition",
    kicker: "Guide",
    title: guideBy("how-to-check-pokemon-card-condition").title,
    description: guideBy("how-to-check-pokemon-card-condition").blurb,
    image: catalogImageUrl(GUIDE_CARDS.umbreonVmaxAltArt.tcgplayerId),
    imageAlt: "Umbreon VMAX #215/203 (Evolving Skies) - a card used in the grading guides",
  },
];

export const revalidate = 180;

// Homepage-caching r1: a static export, not a generateMetadata function -
// reading searchParams here (even just `page`) forced the WHOLE homepage to
// render dynamically on every request, params or not. Every query variant
// (?page=N, ?country=, filters - see HomeFeed / next.config.mjs's
// HOME_VARIANT_PARAMS) now canonicalises to "/" and is kept out of the
// index by the server's X-Robots-Tag header instead of a distinct
// self-canonical + per-page <meta robots> - the same policy /deals already
// uses for its own, much larger set of variants. A real head-term title +
// description, not the root layout's bare "Pokemon Deal Finder" brand
// default. Leads with the phrase the homepage is the primary candidate
// for, keeps the below-market value framing, no stuffing. `absolute`
// bypasses the "%s | Pokemon Deal Finder" template (the brand is already
// inside).
// The title / description / H1 constants live in lib/homeContent (a page
// module may only export Next's own fields); the home graph reads the same three.
export const metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
};

// Single source of truth for the FAQ section AND its FAQPage JSON-LD -
// Google requires the two to match.
// GEO 2026-09-20: eight questions, each answered in two to four sentences.
// "How often do listings update?" and "How do you know it's below market?"
// folded into "How current is a deal?" and "Where does the market price
// come from?"; graded cards and the no-saving state added.
const FAQ_ITEMS = [
  {
    question: "Is this free to use?",
    answer:
      "Yes, always. We earn a small commission if you buy through one of our links - it doesn't change the price you pay. There is no paid placement, so a listing cannot pay to appear as a deal.",
  },
  {
    question: "Is the card-to-listing match always right?",
    answer:
      "Matching is automated. We filter out obviously wrong matches, but always double-check a listing's photos and description before buying. A listing can sit under the reference because its printing or condition is mis-described.",
  },
  {
    question: "Do you cover graded cards?",
    answer:
      "Yes. A graded listing is compared only with a reference for the same grader and grade. A raw \"Near Mint\" is never treated as equivalent to a numeric grade, and the two are never compared with each other.",
  },
  {
    question: "Why do some listings show no saving?",
    answer:
      "Because no trustworthy reference exists for that exact printing and condition, or because the shipping breakdown was not recorded, so a delivered saving cannot be stated. The listing is still shown, plainly, with the reason.",
  },
  // GEO audit 2026-09-19 - the questions people put to AI assistants about
  // a deal site. Literal answers; nothing is promised that the checks
  // cannot deliver.
  {
    question: "Are the Pokemon cards listed here authentic?",
    answer:
      "No third-party site can guarantee that an eBay listing is authentic. Pokemon Deal Finder withholds listings that fail an image-based authenticity screen, that use replica, proxy or altered-card wording, or whose printing does not match the catalogue card, and it never labels a listing \"verified authentic\". The listing's photos, the seller's history and eBay's Money Back Guarantee remain the buyer's own checks.",
  },
  {
    question: "Where does the market price come from?",
    answer:
      "From recent sold data for the same printing and condition, recorded by date and shown next to every listing. It is a reference, not a guaranteed sale price.",
  },
  {
    question: "Do you sell cards or take a cut of the price?",
    answer:
      "No. The site holds no stock and runs no paid placement. Links to eBay are affiliate links; the buyer pays eBay's listed price.",
  },
  {
    question: "How current is a deal?",
    answer:
      "New listings are discovered continuously - every 15 minutes in the US and every few hours in the other countries - and existing deals are reconfirmed on a rolling schedule. Each listing shows when it was first found and when it was last checked against eBay. A page for a listing that has ended says so and links to the card's current listings. The listing integrity report shows how many listings were checked and withheld in the last 24 hours.",
  },
];

const SCAN_FRESH_THRESHOLD_MS = 30 * 60 * 1000;

function isRecentlyRefreshed(dateString) {
  return Date.now() - new Date(dateString).getTime() <= SCAN_FRESH_THRESHOLD_MS;
}

// Deal-first R2 - the feed's MODE row. Every mode is an existing
// destination with its own route and meaning (the dedicated /deals/<cat>
// landing pages, the sealed / Japanese hubs, the existing ?listing= and
// ?sort= filters), never a new URL tree. The default homepage feed is
// "Featured": the flagship row is Buy It Now only, but the diverse grid
// under it is MIXED (auctions included - each card says which), so the
// default is not labelled "Buy it now"; that chip is the existing
// FIXED_PRICE filter. Analytics markers are the ones these chips already
// carried (start_here_clicked with the chip id; the graded chip keeps its
// graded_entry flag). Filter-style URLs are nofollow'd.
// 2026-09-22 redesign: reordered and given icons to become the deal-
// discovery strip the redesign calls for. Every entry is still an
// EXISTING destination - no new URL tree, no decorative tab. Two notes:
//   - "PSA 10" in the reference design is "Graded" here, because
//     /deals/graded covers PSA, CGC, BGS and SGC at every grade.
//   - "Biggest savings" is /best-finds, which already ranks by real
//     discount; it is not a new sort parameter.
// Buy it now / Under $25 / Under $50 left this row: the price bands now
// have their own discovery modules further down the page, and the
// listing-type filter lives in "More filters", so nothing became
// unreachable.
const FEED_MODES = [
  { href: "/", label: "Best Deals", icon: "🔥", chip: "featured", home: true },
  { href: "/?sort=newest", label: "Just Found", icon: "⚡", chip: "newest" },
  { href: "/deals/auctions", label: "Ending Soon", icon: "⏰", chip: "auctions" },
  { href: "/deals/graded", label: "Graded", icon: "💎", chip: "graded", graded: true },
  { href: "/japanese-cards", label: "Japanese", icon: "🇯🇵", chip: "japanese" },
  { href: "/sealed-deals", label: "Sealed", icon: "📦", chip: "sealed" },
  { href: "/best-finds", label: "Biggest Savings", icon: "📉", chip: "biggest_savings" },
];

// 13C.1 - concrete example queries under the hero search. These teach the
// search grammar (species, collector number, set + Pokemon, graded
// intent) by example rather than with instructional prose, and each is a
// real /search deep link.
const SEARCH_EXAMPLES = [
  "PSA 10 Pikachu",
  "Charizard 4/102",
  "Evolving Skies Umbreon",
];

export default async function Home() {
  // Homepage-caching r1: this Server Component reads no searchParams, so
  // it always renders (and stays statically cacheable as) the one default
  // view - page 1, every marketplace, no filters. RegionRedirect's
  // client-side geo default writes ?country= into the URL for almost every
  // real visitor shortly after hydration; reading that (or any other
  // filter/page) here would force the whole homepage to render dynamically
  // on every one of those requests, not just once per country. All of that
  // variation is HomeFeed's job now (components/HomeFeed.js -> /api/deals-
  // page?kind=home), the same client-fetch shape DealGrid already gives
  // /pokemon/[slug], /sets/[slug] and /deals. Query variants are kept out
  // of the index by next.config.mjs's X-Robots-Tag rule for "/", not a
  // per-page canonical/robots computed here.
  //
  // 13C.3 - the homepage's unfiltered page-1 grid is a PREVIEW of the
  // broader deal pool, not the full browser: 9 cards then a "Browse all
  // deals" link into the paginated list. Filtered / sorted / page-2+
  // views (HomeFeed) keep the full LIST_PAGE_SIZE from fetchDealsPage.
  const HOME_PREVIEW_SIZE = 9;
  // P0.4.1 - deterministic 3-hour rotation bucket. Every render inside one
  // bucket is byte-identical (cache-safe, no hydration drift, no SEO
  // churn); a new bucket rotates the visible curated inventory.
  const bucket = rotationBucket();

  const [homeLanesResult, lastRefreshed, cardHubsResult, hubCounts, summary, validSetSlugs, integrity, speciesResult] =
    await Promise.all([
      fetchHomepageLanes({ country: null }),
      fetchLastScanTime({ table: "deals", language: "english" }),
      fetchCardHubs({ language: "english" }),
      fetchHubCounts({ language: "english" }),
      fetchMarketDataSummary(),
      fetchSetSlugs("english"),
      fetchIntegrityReport(),
      // Ordered by live listing count (lib/catalogAggregates), which is
      // what lets the pill row and the discovery row below be labelled
      // "most listed" rather than "trending" - see HomeQuickFilters.
      fetchSpeciesHubs({ language: "english" }),
    ]);
  const speciesHubs = speciesResult?.species ?? [];

  // One pass builds every curated lane with real cross-lane dedupe + the
  // deterministic diversity selector + 3-hour rotation. Deal-first R2
  // renders ONE feed from it: the premium-gated flagship row first, then
  // the diverse grid. The auction / just-added / under-$25 lanes the
  // selector still computes are reached through the feed's mode row
  // (their existing routes) instead of three more grids. `lanes`: only the
  // two lanes this page renders take part in the cross-lane dedupe, so the
  // folded lanes no longer reserve printings a visitor never sees (review
  // fix P3). Same pools, same gates, same selector, same rotation.
  const lanes = buildHomepageLanes(homeLanesResult?.pools ?? {}, { bucket, lanes: ["flagship", "grid"] });
  const flagshipDeals = lanes.flagship;

  // PRESENTATION-LAYER ORDERING for the default feed (2026-09-22).
  //
  // The flagship row was already Buy It Now only, with a $75 reference
  // floor and a 65% discount cap. The grid under it was not, so the
  // homepage's default view could open with a fixed-price card saving
  // $0.53 sitting beside a 60%-off one, and with auctions mixed in even
  // though auctions have their own tab.
  //
  // This REORDERS; it does not filter. Nothing is dropped, nothing
  // becomes unreachable, scanner eligibility is untouched and every
  // listing here already passed every quality gate. A listing simply has
  // to earn the top of the first screen:
  //   1. Buy It Now with a trusted saving worth stating and a known
  //      delivered cost - the offers the page exists to surface.
  //   2. everything else eligible, in the selector's own order.
  // Sorting is stable within each group, so the deterministic rotation
  // and cross-lane dedupe above are preserved exactly.
  const FEED_MEANINGFUL_SAVING = 0.1; // the site's own DEAL_DISCOUNT_THRESHOLD
  const leads = (d) =>
    d?.listing_type !== "AUCTION" &&
    savingsClaimTrusted(d) &&
    Number(d?.discount_pct) >= FEED_MEANINGFUL_SAVING &&
    offerShipping(d).state === "confirmed";
  const deals = [...lanes.grid].sort((a, b) => Number(leads(b)) - Number(leads(a)));

  // the six most-listed card hubs render ONCE, in the explore section
  // (fold revision: the hero's duplicate "Most listed" row is gone)
  const topHubs = cardHubsResult.hubs.slice(0, 6);
  const liveCount = summary?.activeDeals ?? null;

  // Budget-module previews. Taken from the pools this render ALREADY
  // loaded - no extra query - and banded on the same USD total the
  // /deals/under-N categories filter on, so a tile previews listings the
  // destination would actually contain. Anything without an image is
  // dropped rather than shown as an empty frame.
  const budgetPool = Object.values(homeLanesResult?.pools ?? {}).flat();
  const budgetPreviews = {};
  for (const [href, ceiling] of [
    ["/deals/under-25", 25],
    ["/deals/under-50", 50],
    ["/deals/under-100", 100],
    ["/deals/under-250", 250],
  ]) {
    const seen = new Set();
    budgetPreviews[href] = budgetPool
      .filter((d) => {
        const usd = Number(d?.total_price_usd ?? d?.total_price);
        if (!Number.isFinite(usd) || usd <= 0 || usd > ceiling) return false;
        const key = d.watchlist_id ?? d.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return Boolean(d.image_url);
      })
      .slice(0, 3)
      .map((d) => ({ id: d.id, image: d.image_url }));
  }

  // Live count + slim trust line - the disclosure sits next to the offers,
  // not only in the footer; the methodology link is the crawlable "how we
  // price this" destination. Built HERE, in the server component, and
  // handed to HomeFeed as a finished element: it is the one place the
  // homepage prints a relative time, and a client module must never call
  // timeAgo() directly (relative-time-hydration test 7 - the server HTML
  // and the client's own clock would disagree at hydration).
  const trustLine = (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
      {lastRefreshed && (
        <>
          <span className="inline-flex h-2 w-2 rounded-full bg-live" />
          {liveCount != null && <span className="tnum font-semibold text-zinc-700 dark:text-zinc-200">{liveCount.toLocaleString()} live deals</span>}
          {liveCount != null && <span className="text-zinc-300 dark:text-zinc-700">·</span>}
          <span>{isRecentlyRefreshed(lastRefreshed) ? `checked ${timeAgo(lastRefreshed)}` : "refreshing automatically"}</span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
        </>
      )}
      <span>We may earn a commission on eBay purchases.</span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <Link href="/methodology" className="font-medium text-zinc-600 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500">
        How we compare →
      </Link>
    </p>
  );

  // Structured data (brief 2026-09-20): ONE @graph in ONE script, built by
  // lib/jsonLd buildHomeGraph from the same values this render uses -
  // the title / description / H1 constants, the scan timestamp behind the
  // "As of" line, the deals the feed renders (featured first, then the
  // grid, in order), the live count, the visible FAQ array and the
  // explanatory block's review date. Organization and WebSite live here
  // and nowhere else; inner pages reference them by @id.
  const homeGraph = buildHomeGraph({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    h1: HOME_H1,
    lastRefreshed,
    deals: [...flagshipDeals, ...deals].map((d) => ({
      id: d.id,
      name: `${cardDisplayName({ name: normalizePublicText(d.watchlist?.name ?? d.title) })}${d.watchlist?.set ? ` - ${d.watchlist.set}` : ""}`,
    })),
    liveCount,
    faqItems: FAQ_ITEMS,
    sameAs: organizationSameAs(),
    article: {
      headline: "How Pokemon Deal Finder finds Pokemon cards below market price on eBay",
      description:
        "What a below-market Pokemon card deal is, how the site compares with TCGplayer, PriceCharting and deal communities, why a bid is not a price, and what to check before buying.",
      dateModified: HOME_LAST_REVIEWED,
      citation: [
        "https://www.ebay.com/help/policies/ebay-money-back-guarantee-policy/ebay-money-back-guarantee-policy?id=4210",
        "https://www.pricecharting.com/category/pokemon-cards",
        "https://www.tcgplayer.com/categories/trading-and-collectible-card-games/pokemon/price-guides",
        `${SITE_URL}/methodology`,
        `${SITE_URL}/integrity`,
      ],
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd data={homeGraph} />
      <SkipToContent target="deals" />
      <SiteHeader />
      <MobileStickySearch />
      <RegionRedirect />

      {/* HERO - deal-first R2 (fold revision): a slim band, so a COMPLETE
          first offer (identity, artwork, price, shipping / comparison,
          eBay action) sits inside the initial viewport at 390x844 and
          1280x900. Desktop: heading + one supporting line on the left,
          the exact-card search on the right. Phone: heading, search and the price-checker link. The supporting sentence is desktop-only;
          the "Most listed" card row left the hero (its six destinations are
          the "Cards with the most active listings" row below the feed) and
          the live-count line moved beside the feed's trust line. No CTA
          that only scrolls a few pixels - the first offers are in view. */}
      {/* HERO. A soft tinted ground rather than flat white - the section
          reads as a distinct band above the feed without a heavy fill,
          and the tint is derived from the brand red at very low alpha so
          it belongs to the palette rather than being a new colour. */}
      <header className="border-b border-zinc-200 bg-gradient-to-b from-red-50/70 via-sunk to-sunk dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-center lg:gap-x-8 xl:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="max-w-3xl">
            {/* GEO 2026-09-20: the heading names the thing the page is,
                in the words people search; the capsule below it is the
                quotable answer. No slogan.
                2026-09-22: "below market price." carries the brand red -
                it is the proposition, and it is the half of the sentence
                a scanning visitor needs. HOME_H1 stays the single source
                of the string (the home JSON-LD graph reads the same
                constant), so the emphasis is applied by splitting it
                rather than by retyping it here and letting the two
                drift. */}
            <h1 className="text-balance text-[2rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-zinc-900 sm:text-[2.75rem] lg:text-[2.75rem] xl:text-[3.25rem] dark:text-zinc-50">
              {(() => {
                const marker = "below market";
                const at = HOME_H1.toLowerCase().indexOf(marker);
                if (at < 0) return HOME_H1;
                return (
                  <>
                    {HOME_H1.slice(0, at)}
                    <span className="text-red-600 dark:text-red-500">{HOME_H1.slice(at)}</span>
                  </>
                );
              })()}
            </h1>
            <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-zinc-600 sm:text-[1.0625rem] dark:text-zinc-300">
              We scan eBay continuously and compare listings against recent sold prices for the
              same printing and condition, so you can find real deals rather than just cheap
              listings.
            </p>
            {/* GEO audit 2026-09-19 - the answer capsule: what the site is,
                in one dated paragraph built from live counts (never a slogan).
                Visible at every width; the sentence above stays desktop-only. */}
            {/* On a phone the hero's job is the search box and the first
                deal: one sentence plus the dated counts. The checks
                sentence is `sm:` and up - it stays in the HTML for every
                reader either way. */}
            {/* Stays text-sm (body size), never text-xs/13px: the GEO
                answer capsule is quotable prose, and home-geo pins its
                size for that reason. */}
            <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-zinc-500 dark:text-zinc-400" data-answer-capsule>
              Pokemon Deal Finder lists live eBay Pokemon card listings priced below a documented market reference for the exact card and condition, from eBay US, UK, Australia, Canada, Germany and Italy.
              <span className="hidden sm:inline">
                {/* 2026-09-22: this used to say every listing shown had
                    passed "an exact-printing match". It had not, and
                    cannot: a listing is SHOWN once its card identity,
                    condition and availability check out, but a SAVING is
                    only claimed when the printing and condition are
                    matched to a reference we can evidence. Deal 42127
                    was exactly that gap. The sentence now draws the line
                    where the implementation draws it. */}
                {" "}Every listing shown has passed a card-identity match, a seller-condition check, an availability re-check and an image-based authenticity screen. A saving is only claimed where the printing and condition are matched to a market reference we can evidence — otherwise the listing is shown plainly, with the reason.
              </span>
              {liveCount != null && integrity?.withheldActive != null && integrity?.checked24h != null && (
                <>
                  {" "}As of {new Date(integrity.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}: {liveCount.toLocaleString()} listings shown, {integrity.withheldActive.toLocaleString()} withheld for failing a check, {integrity.checked24h.toLocaleString()} checked in the last 24 hours (
                  <Link href="/integrity" className="underline underline-offset-2 hover:text-red-600 dark:hover:text-red-500">integrity report</Link>).
                </>
              )}
            </p>

          {/* SEARCH - the most prominent control on the page, full width
              up to a readable maximum rather than a narrow box in a
              right-hand column. */}
          <div className="mt-6 max-w-2xl">
            <HeroSearch />
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
              {/* the example queries stay in the DOM (real /search deep
                  links) but are displayed from `sm` up: on a phone they cost
                  two to three lines above the first offer, and the sticky
                  search bar covers the search job once the visitor scrolls */}
              <span className="hidden sm:contents">
                <span>Try</span>
                {SEARCH_EXAMPLES.map((q, i) => (
                  <span key={q} className="inline-flex items-center gap-x-1.5">
                    <Link
                      href={`/search?q=${encodeURIComponent(q)}`}
                      data-analytics-click="hero_example_clicked"
                      data-analytics-props={JSON.stringify({ section: "hero", rank: i + 1 })}
                      className="font-medium text-zinc-700 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
                    >
                      {q}
                    </Link>
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  </span>
                ))}
              </span>
              {/* Phase 17B - the value-intent entry path (-> the price
                  checker), kept measurable as a plain text link beside the
                  search examples rather than a second hero button. */}
              <Link
                href="/search"
                data-analytics-click="price_checker_entry_clicked"
                data-analytics-props={JSON.stringify({ section: "hero" })}
                className="font-medium text-zinc-700 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
              >
                Check a card&apos;s price →
              </Link>
            </p>
          </div>

          {/* Most-listed species + category destinations. Ordered by real
              listing counts, so the row is labelled for what it is. */}
          <HomeQuickFilters
            species={speciesHubs.slice(0, 5).map((s) => ({ slug: s.slug, name: s.name, count: s.count }))}
            categories={[
              { href: "/deals/graded", label: "Graded" },
              { href: "/japanese-cards", label: "Japanese" },
              { href: "/sealed-deals", label: "Sealed" },
            ]}
          />

          {/* Live platform figures, from production reads. A stat that is
              unavailable is omitted rather than defaulted - see the
              component. */}
          <HomeLiveStats
            liveCount={liveCount}
            checked24h={integrity?.checked24h ?? null}
            marketplaceCount={Array.isArray(integrity?.marketplaces) && integrity.marketplaces.length > 0 ? integrity.marketplaces.length : null}
          />
          </div>

          {/* The visual half: three real cards from the flagship row,
              each linking to its own deal. Desktop only - see the
              component for why, and for why this is card photography
              rather than the reference design's character art. */}
          <HomeHeroArt deals={flagshipDeals} />
        </div>
      </header>

      {/* THE FEED - one dominant deal feed (flagship row -> grid), the
          Explore section, and their supporting nav/analytics - all of it
          driven by the real client URL (country/sort/filters/page), which
          this Server Component never reads. See components/HomeFeed.js. */}
      <HomeFeed
        feedModes={FEED_MODES}
        initial={{ flagshipDeals, deals }}
        hubCounts={hubCounts}
        validSetSlugs={validSetSlugs}
        previewSize={HOME_PREVIEW_SIZE}
        emailCaptureEnabled={emailEnabled()}
        liveCount={liveCount}
        trustLine={trustLine}
        topHubs={topHubs}
      />

      {/* DISCOVERY - the two visual browse rows, between the feed (what to
          buy now) and the editorial section (how the market works).
          Both render from live data and both return null rather than an
          empty shell when that data is thin. */}
      <HomePopularPokemon species={speciesHubs} />
      <HomeBudgetDeals previewsByBand={budgetPreviews} />

      {/* TRUST - the methodology work as conversion support. Every claim
          links to where it is substantiated; no invented social proof. */}
      <HomeTrustSection
        emailCapture={
          emailEnabled() ? (
            <EmailCapture placement="homepage" pageType="home" heading="" body="" />
          ) : null
        }
      />

      {/* GUIDES & RESEARCH - three editorial cards (section id pinned by
          homepage-hierarchy.test). Artwork only where the card is the
          piece's own worked example. */}
      <section data-analytics-section="guides" className="border-t border-zinc-200 bg-sunk dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <SectionHeader kicker="Learn the market" title="Guides & research" actionLabel="All guides & research" actionHref="/guides" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EDITORIAL_CARDS.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                data-analytics-click="guides_research_clicked"
                data-analytics-props={JSON.stringify({ section: "guides", content_id: c.contentId, placement: "homepage" })}
                className="group flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
              >
                <div className="relative aspect-[5/7] w-14 shrink-0 overflow-hidden rounded-md bg-zinc-50 dark:bg-zinc-900">
                  {c.image ? (
                    <Image src={c.image} alt={c.imageAlt} fill sizes="56px" className="object-contain p-1" />
                  ) : (
                    <CardImagePlaceholder />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{c.kicker}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-900 transition-colors group-hover:text-red-600 dark:text-zinc-50 dark:group-hover:text-red-500">
                    {c.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{c.description}</p>
                  {c.meta && <p className="mt-1.5 text-[11px] text-zinc-500">{c.meta}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* HOW COMPARISONS WORK + FAQ. The plain-language summary (what the
          tool does, which marketplaces) leads in - server-rendered and
          visible, matching /how-it-works and /methodology exactly - then
          the three steps and the FAQ whose items feed the FAQPage JSON-LD. */}
      <section data-analytics-section="how_it_works" className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Pokemon Deal Finder scans eBay listings for Pokemon TCG cards across the US, UK,
            Australia, Canada, Germany and Italy marketplaces and compares each one against its real
            market price and recent sold listings. Most listings shown are meaningfully below that
            market reference; a small number — mainly very recent releases without a verified
            reference yet — are shown as plain listings, clearly labelled, with no savings claim.
            It&apos;s an independent price comparison, not a shop — you buy from the eBay seller.{" "}
            <Link href="/methodology" className="underline hover:text-red-600 dark:hover:text-red-500">
              How we find deals
            </Link>
            .
          </p>
          {/* GEO 2026-09-20: the answer-first explanation, the comparison
              table and the byline - between the lead-in prose and the
              three steps, so the ordering the hierarchy test pins holds. */}
          <HomeHowItCompares />
          <div id="how-it-works" className="mt-12 grid gap-12 scroll-mt-24 lg:grid-cols-2">
            <div>
              <SectionHeader kicker="No guesswork" title="How comparisons work" actionLabel="Full methodology" actionHref="/methodology" />
              <ol className="mt-5 flex flex-col gap-5">
                <li>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">1. We scan eBay around the clock</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Every watched card is checked against live eBay listings, continuously.</p>
                </li>
                <li>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">2. We check real pricing</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Each listing is compared against the card&apos;s real market price for its condition, backed by
                    recent eBay sold listings - not guesses.
                  </p>
                </li>
                <li>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">3. Savings claims are earned, not assumed</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    A listing gets deal treatment only when it&apos;s meaningfully below a verified market reference
                    and the seller passes our trust checks. Without that verified reference — mainly a very recent
                    release — we show the listing plainly, with no savings claim, instead of hiding it.
                  </p>
                </li>
              </ol>
            </div>
            <div id="faq" className="scroll-mt-24">
              <SectionHeader kicker="Good to know" title="FAQ" />
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {FAQ_ITEMS.map((item) => (
                  <div key={item.question}>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{item.question}</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}

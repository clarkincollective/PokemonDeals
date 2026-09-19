import Image from "next/image";
import Link from "next/link";
import {
  fetchHomepageLanes,
  fetchLastScanTime,
  fetchCardHubs,
  fetchHubCounts,
  fetchMarketDataSummary,
  fetchSetSlugs,
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
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { emailEnabled } from "@/lib/email";
import { catalogImageUrl } from "@/lib/cardImage";
import { GUIDE_CARDS } from "@/lib/guideLinks";

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
export const metadata = {
  title: {
    // SEO audit 2026-09-20: 59 chars - fits a mobile SERP title unbroken
    absolute: "Pokemon Card Deals Below Market Price | Pokemon Deal Finder",
  },
  description:
    "Live eBay Pokemon card listings priced below a recent-sold market reference for the exact card and condition, checked continuously across six marketplaces.",
  alternates: { canonical: "/" },
};

// Single source of truth for the FAQ section AND its FAQPage JSON-LD -
// Google requires the two to match.
const FAQ_ITEMS = [
  {
    question: "Is this free to use?",
    answer:
      "Yes, always. We earn a small commission if you buy through one of our links - it doesn't change the price you pay.",
  },
  {
    question: "How often do listings update?",
    answer:
      "New listings are discovered continuously - every 15 minutes in the US and every few hours in the other countries. Existing deals are reconfirmed on a rolling schedule so a sold or ended listing drops off shortly after.",
  },
  {
    question: "How do you know it's below market?",
    answer:
      "Each listing is compared to the card's real market price for its condition, backed by recent eBay sold listings - not a guess. The full method is on our methodology page.",
  },
  {
    question: "Is the card-to-listing match always right?",
    answer:
      "Matching is automated. We filter out obviously wrong matches, but always double-check a listing's photos and description before buying.",
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
      "Each listing shows when it was first found and when it was last checked against eBay. A page for a listing that has ended says so and links to the card's current listings. The listing integrity report shows how many listings were checked and withheld in the last 24 hours.",
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
const FEED_MODES = [
  { href: "/", label: "Featured", chip: "featured", home: true },
  { href: "/?listing=FIXED_PRICE", label: "Buy it now", chip: "buy_it_now" },
  { href: "/deals/auctions", label: "Auctions", chip: "auctions" },
  { href: "/deals/graded", label: "Graded", chip: "graded", graded: true },
  { href: "/deals/under-25", label: "Under $25", chip: "under_25" },
  { href: "/deals/under-50", label: "Under $50", chip: "under_50" },
  { href: "/sealed-deals", label: "Sealed", chip: "sealed" },
  { href: "/japanese-cards", label: "Japanese", chip: "japanese" },
  { href: "/?sort=newest", label: "Newest", chip: "newest" },
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

  const [homeLanesResult, lastRefreshed, cardHubsResult, hubCounts, summary, validSetSlugs, integrity] = await Promise.all([
    fetchHomepageLanes({ country: null }),
    fetchLastScanTime({ table: "deals", language: "english" }),
    fetchCardHubs({ language: "english" }),
    fetchHubCounts({ language: "english" }),
    fetchMarketDataSummary(),
    fetchSetSlugs("english"),
    fetchIntegrityReport(),
  ]);

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
  const deals = lanes.grid;

  // the six most-listed card hubs render ONCE, in the explore section
  // (fold revision: the hero's duplicate "Most listed" row is gone)
  const topHubs = cardHubsResult.hubs.slice(0, 6);
  const liveCount = summary?.activeDeals ?? null;

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

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  // The site-wide Organization + WebSite entities live in the root layout
  // (app/layout.js) and carry stable @ids. The homepage adds only a
  // CollectionPage that names the same WebSite and, crucially, exposes the
  // real data-freshness timestamp - the SAME `lastRefreshed` value the
  // visible "checked X ago" line below uses (MAX(deals.last_seen_at) via
  // fetchLastScanTime). Not new Date(), not a hardcoded date. This Server
  // Component only ever renders the canonical promo view now (see Home
  // above) - every query variant canonicalises to "/" (next.config.mjs).
  const homeCollectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Pokemon Deal Finder - below-market Pokemon card listings",
    description:
      liveCount != null
        ? `Approximately ${liveCount.toLocaleString()} active below-market Pokemon card listings from eBay's US, UK, Australia, Canada, Germany and Italy marketplaces, each compared against real market prices and recent sold-listing data.`
        : "Active below-market Pokemon card listings from eBay's US, UK, Australia, Canada, Germany and Italy marketplaces, each compared against real market prices and recent sold-listing data.",
    url: `${SITE_URL}/`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    ...(lastRefreshed ? { dateModified: new Date(lastRefreshed).toISOString() } : {}),
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeCollectionJsonLd) }} />
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
      <header className="border-b border-zinc-200 bg-sunk dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,40rem)] lg:items-center lg:gap-x-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
              Find your next Pokemon card deal.
            </h1>
            <p className="mt-1.5 hidden max-w-xl text-sm text-zinc-600 lg:block dark:text-zinc-400">
              Explore Pokemon card listings on eBay, with market references where a matching
              comparison is available. Check the card, condition and shipping before you buy.
            </p>
            {/* GEO audit 2026-09-19 - the answer capsule: what the site is,
                in one dated paragraph built from live counts (never a slogan).
                Visible at every width; the sentence above stays desktop-only. */}
            {/* On a phone the hero's job is the search box and the first
                deal: one sentence plus the dated counts. The checks
                sentence is `sm:` and up - it stays in the HTML for every
                reader either way. */}
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400" data-answer-capsule>
              Pokemon Deal Finder lists live eBay Pokemon card listings priced below a documented market reference for the exact card and condition, from eBay US, UK, Australia, Canada, Germany and Italy.
              <span className="hidden sm:inline">
                {" "}Every listing shown has passed an exact-printing match, a seller-condition check, an availability re-check and an image-based authenticity screen, and shows the reference it was compared with.
              </span>
              {liveCount != null && integrity?.withheldActive != null && integrity?.checked24h != null && (
                <>
                  {" "}As of {new Date(integrity.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}: {liveCount.toLocaleString()} listings shown, {integrity.withheldActive.toLocaleString()} withheld for failing a check, {integrity.checked24h.toLocaleString()} checked in the last 24 hours (
                  <Link href="/integrity" className="underline underline-offset-2 hover:text-red-600 dark:hover:text-red-500">integrity report</Link>).
                </>
              )}
            </p>
          </div>
          <div className="mt-3 lg:mt-0">
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
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{c.kicker}</p>
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
          <div id="how-it-works" className="mt-8 grid gap-12 scroll-mt-24 lg:grid-cols-2">
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

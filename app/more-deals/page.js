import Link from "next/link";
import SkipToContent from "@/components/SkipToContent";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Breadcrumbs from "@/components/Breadcrumbs";
import BoardDealCard from "@/components/BoardDealCard";
import { fetchBoardDealsPage, BOARD_PAGE_SIZE } from "@/lib/boardDealsFeed";

const SITE_URL = "https://pokemondealfinder.com";

// /more-deals (2026-09-27) - EVERY imported listing (components/BoardDealCard
// for what a card shows and does not show), newest first, 48 a page, with
// market / kind / format filters. The owner's ask: "count them in our
// listings and show the savings". The evidenced grid stays at /deals; this
// page is the browsable home of the imported rows the "More deals" section
// previews. Filter and page URLs carry query strings, so only the plain
// first page is canonical; the rest are follow-only.
const TITLE = "More Pokemon Card Deals";
const DESCRIPTION = "Thousands more Pokemon card, graded slab and sealed product deals on eBay, with the saving against market value on each one.";

export const revalidate = 900;

const MARKETS = [
  ["", "All markets"],
  ["EBAY_US", "US"],
  ["EBAY_GB", "UK"],
  ["EBAY_AU", "AU"],
  ["EBAY_CA", "CA"],
  ["EBAY_DE", "DE"],
];
const KINDS = [
  ["", "All types"],
  ["raw", "Singles"],
  ["graded", "Graded"],
  ["sealed", "Sealed"],
];
const FORMATS = [
  ["", "Buy It Now & auctions"],
  ["bin", "Buy It Now"],
  ["auction", "Auctions"],
];
// 28 Sep 2026: the category pages' price bands (USD, like /deals/under-N)
const PRICES = [
  ["", "Any price"],
  ["25", "Under $25"],
  ["50", "Under $50"],
  ["100", "Under $100"],
  ["250", "Under $250"],
];

const pick = (v, allowed) => (allowed.some(([k]) => k && k === v) ? v : null);

function query({ page, market, kind, format, maxPrice }) {
  const q = new URLSearchParams();
  if (market) q.set("market", market);
  if (kind) q.set("kind", kind);
  if (format) q.set("format", format);
  if (maxPrice) q.set("maxPrice", maxPrice);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/more-deals?${s}` : "/more-deals";
}

async function readParams(searchParams) {
  const sp = (await searchParams) ?? {};
  const one = (v) => (Array.isArray(v) ? v[0] : v) ?? "";
  return {
    page: Math.max(1, parseInt(one(sp.page), 10) || 1),
    market: pick(one(sp.market), MARKETS),
    kind: pick(one(sp.kind), KINDS),
    format: pick(one(sp.format), FORMATS),
    maxPrice: pick(one(sp.maxPrice), PRICES),
  };
}

export async function generateMetadata({ searchParams }) {
  const p = await readParams(searchParams);
  const plain = p.page === 1 && !p.market && !p.kind && !p.format && !p.maxPrice;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/more-deals" },
    robots: { index: plain, follow: true },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/more-deals` },
    twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  };
}

const CHIP = "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors";
const CHIP_ON = `${CHIP} border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900`;
const CHIP_OFF = `${CHIP} border-zinc-300 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200`;

function ChipRow({ label, options, current, build }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      {options.map(([value, text]) => {
        const on = (current ?? "") === value;
        return (
          <Link key={value || "all"} href={build(value || null)} rel="nofollow" className={on ? CHIP_ON : CHIP_OFF} aria-current={on ? "true" : undefined}>
            {text}
          </Link>
        );
      })}
    </div>
  );
}

export default async function MoreDealsPage({ searchParams }) {
  const p = await readParams(searchParams);
  const result = await fetchBoardDealsPage({ page: p.page, pageSize: BOARD_PAGE_SIZE, market: p.market, kind: p.kind, format: p.format, maxPriceUsd: p.maxPrice ? Number(p.maxPrice) : null });
  const rows = result.rows.filter((d) => d?.affiliateUrl && d.price > 0 && d.discountPct > 0);
  const filtered = Boolean(p.market || p.kind || p.format);
  const build = (patch) => query({ ...p, page: 1, ...patch });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SkipToContent />
      <SiteHeader />
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-6 sm:py-8">
          <Breadcrumbs items={[{ name: "Deals", href: "/" }, { name: "More deals" }]} />
          <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">More deals</h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            {result.totalAll.toLocaleString()} more Pokemon card, graded and sealed deals on eBay, newest first, each with its saving against market value. New finds every 30 minutes.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-zinc-600 dark:text-zinc-400">
            A marketplace is the eBay site a listing is on, not where it ships. Prices are in the marketplace&apos;s currency. Check the listing on eBay before buying.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <ChipRow label="Market" options={MARKETS} current={p.market} build={(v) => build({ market: v })} />
            <ChipRow label="Type" options={KINDS} current={p.kind} build={(v) => build({ kind: v })} />
            <ChipRow label="Format" options={FORMATS} current={p.format} build={(v) => build({ format: v })} />
            <ChipRow label="Price" options={PRICES} current={p.maxPrice} build={(v) => build({ maxPrice: v })} />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 scroll-mt-6 px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {filtered ? `${result.total.toLocaleString()} matching` : `${result.total.toLocaleString()} deals`}
          {result.pages > 1 ? ` · page ${result.page} of ${result.pages}` : ""}
          {filtered ? (
            <>
              {" · "}
              <Link href="/more-deals" className="font-medium text-red-600 hover:underline dark:text-red-500">Clear filters</Link>
            </>
          ) : null}
        </p>
        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">Nothing matches right now. Check back after the next find.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map((d) => (
              <BoardDealCard key={d.id} deal={d} page="deals" />
            ))}
          </ul>
        )}
        {result.pages > 1 ? (
          <nav aria-label="Pages" className="mt-8 flex items-center justify-between text-sm">
            {result.page > 1 ? (
              <Link href={query({ ...p, page: result.page - 1 })} rel="prev" className="font-medium text-zinc-700 hover:text-red-600 dark:text-zinc-200">← Newer</Link>
            ) : <span />}
            <span className="text-zinc-500 dark:text-zinc-400">Page {result.page} of {result.pages}</span>
            {result.page < result.pages ? (
              <Link href={query({ ...p, page: result.page + 1 })} rel="next" className="font-medium text-zinc-700 hover:text-red-600 dark:text-zinc-200">Older →</Link>
            ) : <span />}
          </nav>
        ) : null}
        <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
          These listings sit alongside the <Link href="/deals" className="underline underline-offset-2">deals we match and price ourselves</Link>. We may earn a commission on eBay purchases.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

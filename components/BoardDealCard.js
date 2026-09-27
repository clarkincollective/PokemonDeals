import DealImage from "@/components/DealImage";
import { wrapEbayAffiliateUrl } from "@/lib/ebayLinks";

// One imported listing (lib/boardDeals toRenderShape): image, name, set, the
// live price, the saving as published ("Save 43%" against the published
// market value), variant, format, marketplace, and "View on eBay" on the
// site's own EPN link. Never the source's name, branding or link. Shared by
// the "More deals" section and the /more-deals page.
export default function BoardDealCard({ deal: d, page = "deals" }) {
  const href = wrapEbayAffiliateUrl(d.affiliateUrl, { page, placement: "feature" });
  const meta = [d.variant, d.format, d.marketplaceShort ? `${d.marketplaceFlag ?? ""} eBay ${d.marketplaceShort}`.trim() : null].filter(Boolean);
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative aspect-[4/5] w-full bg-zinc-50 dark:bg-zinc-950">
        {/* VERCEL-COST-2 (27 Sep): an eBay listing photo, unique per transient
            listing (5,000+ of them on /more-deals). DealImage serves these
            through eBay's own size variants, NOT Vercel Image Optimization -
            the first version of this card put them through next/image with
            `fill` and would have billed up to 8 transformations + cache
            writes per listing for near-zero reuse. */}
        {d.image ? (
          <DealImage src={d.image} alt={d.name ? `${d.name}${d.set ? ` (${d.set})` : ""}` : d.title ?? ""} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-contain p-2" />
        ) : null}
        <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
          {d.savingsPercentText}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{d.name ?? d.title}</p>
        {d.set ? <p className="line-clamp-1 text-xs text-zinc-600 dark:text-zinc-400">{d.set}</p> : null}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-bold text-zinc-900 dark:text-zinc-50">{d.priceText}</span>
          {d.marketValueText ? <span className="text-xs text-zinc-500 line-through dark:text-zinc-400">{d.marketValueText}</span> : null}
        </p>
        {d.marketValueText ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{d.savingsPercentText} vs market value {d.marketValueText}</p> : null}
        {meta.length ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{meta.join(" · ")}</p> : null}
        <a
          href={href}
          target="_blank"
          rel="nofollow sponsored noopener"
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          View on eBay
        </a>
      </div>
    </li>
  );
}

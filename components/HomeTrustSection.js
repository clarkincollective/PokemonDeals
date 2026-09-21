import Link from "next/link";

// "Why collectors use Pokemon Deal Finder" - the engineering work made
// visible as conversion support.
//
// EVERY CLAIM HERE IS ONE THE SITE ACTUALLY IMPLEMENTS, and each links to
// the page where it is described in full, so a sceptical reader can check
// it rather than take it. Nothing is softened into marketing:
//   - "Real market comparison" -> /methodology
//   - "Exact card matching"    -> /methodology
//   - "Listings re-checked"    -> /integrity (which publishes the counts)
//   - "Image screening"        -> /integrity
//   - "Free to use"            -> the FAQ, which states the affiliate
//                                 relationship in the same breath
//
// WHAT IS DELIBERATELY ABSENT. The reference design carries "Join 10,000+
// collectors", a testimonial, and Reddit / YouTube / Discord endorsement
// logos. We have no measured subscriber count to publish, no collected
// reviews, and no endorsement from any of those communities. Inventing
// any of it would be a fabricated trust signal on the one section of the
// page whose entire purpose is trust, so none of it is here. The real
// signals - published integrity counts, a stated method, a stated
// commercial relationship - do the job honestly.
const ITEMS = [
  {
    href: "/methodology",
    title: "Real market comparison",
    copy: "Listings are compared against recent sold data for the same printing and condition, shown with the reference and its date.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M3 20h18M6 20V10M12 20V4M18 20v-7" />
      </svg>
    ),
  },
  {
    href: "/methodology",
    title: "Exact card matching",
    copy: "A listing must match the catalogue card's printing and condition. A raw card is never priced against a graded slab.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <rect x="3" y="3" width="11" height="15" rx="2" />
        <path d="M17 7h4v14H10" />
      </svg>
    ),
  },
  {
    href: "/integrity",
    title: "Listings re-checked",
    copy: "Every listing is re-checked for availability on a schedule, and the counts are published.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M20 12a8 8 0 1 1-2.3-5.6" />
        <path d="M20 4v4h-4" />
      </svg>
    ),
  },
  {
    href: "/integrity",
    title: "Image screening",
    copy: "An image-based screen withholds listings that fail an authenticity or match check. We never label a listing verified authentic.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    ),
  },
  {
    href: "/#faq",
    title: "Free to use",
    copy: "No account, no fee, no paid placement. We may earn a commission on eBay purchases; it never changes your price or a listing's ranking.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
      </svg>
    ),
  },
];

export default function HomeTrustSection({ emailCapture = null }) {
  return (
    <section aria-labelledby="why-trust" className="border-y border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <h2 id="why-trust" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">
          Why collectors use Pokemon Deal Finder
        </h2>
        <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <ul className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((it) => (
            <li key={it.title}>
              <Link
                href={it.href}
                data-analytics-click="trust_item_clicked"
                data-analytics-props={JSON.stringify({ surface: "home", content_id: it.title })}
                className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                {/* Neutral, NOT the savings green. Green on this site
                    means one thing - an evidenced below-market figure -
                    and a row of green trust icons would quietly spend
                    that meaning on decoration. redesign-theme's
                    reserved-colour test catches exactly this. */}
                <span aria-hidden="true" className="mb-2 inline-flex text-zinc-400 transition-colors group-hover:text-red-600 dark:text-zinc-500">{it.icon}</span>
                <span className="block text-sm font-bold text-zinc-900 group-hover:text-red-600 dark:text-zinc-50 dark:group-hover:text-red-500">
                  {it.title}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">{it.copy}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* The email panel the reference design puts here. Its heading in
            the mockup is "Join 10,000+ collectors", which we do not
            publish: there is no measured subscriber figure to stand
            behind, and inventing one on the trust section would be the
            worst possible place to do it. The panel says what the email
            actually is instead, and only renders at all when email is
            configured (emailEnabled) - a signup box that cannot send is
            worse than no box. */}
        {emailCapture ? (
          <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5 lg:mt-0 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Don&apos;t miss the next deal
            </h3>
            <p className="mt-1 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">
              A weekly email of the best below-market finds. One click to unsubscribe.
            </p>
            <div className="mt-3">{emailCapture}</div>
          </div>
        ) : null}
        </div>
      </div>
    </section>
  );
}

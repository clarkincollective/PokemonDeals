import Link from "next/link";
import { Children, isValidElement } from "react";
import SkipToContent from "@/components/SkipToContent";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getGuide, GUIDES_PUBLISHED, guideOffersSet } from "@/lib/guides";
import RelatedReading from "@/components/RelatedReading";
import GuideLiveOffers from "@/components/guides/GuideLiveOffers";

const SITE_URL = "https://pokemondealfinder.com";

// "2026-09-16" -> "16 September 2026", rendered from the fixed registry
// date at build time (never from the clock).
function formatGuideDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
}

function headingText(children) {
  return Children.toArray(children).map(child => isValidElement(child) ? headingText(child.props.children) : String(child)).join("");
}

function headingId(children) {
  return headingText(children).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function guideHeadings(children) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === GH2) return [{ id: child.props.id || headingId(child.props.children), text: headingText(child.props.children) }];
    return guideHeadings(child.props.children);
  });
}

// Shared chrome for an editorial guide page: header, back link, H1,
// BreadcrumbList + Article JSON-LD, footer. The page supplies the body.
export default async function GuideLayout({ slug, children }) {
  const g = getGuide(slug);
  const headings = guideHeadings(children);
  // the set this guide is about, when it has live listings to show
  // (lib/guides guideOffersSet - explicit per guide, never inferred)
  const offersSet = guideOffersSet(g);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
      { "@type": "ListItem", position: 3, name: g.title, item: `${SITE_URL}/guides/${slug}` },
    ],
  };

  // A guide's own truthful publish date when it has one, else the
  // original-batch default. Never a build/deploy timestamp.
  const published = g.published ?? GUIDES_PUBLISHED;
  // `updated`: the date a guide's facts were last checked (release guides
  // carry one); it is shown on the page and is the schema's dateModified.
  const updated = g.updated ?? published;
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.blurb,
    datePublished: published,
    dateModified: updated,
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    mainEntityOfPage: `${SITE_URL}/guides/${slug}`,
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SkipToContent />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 scroll-mt-6 px-6 py-8">
        <Link
          href="/guides"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          ← All guides
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-black dark:text-zinc-50">{g.title}</h1>
        {g.updated && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Published {formatGuideDate(published)} · Last checked against the official sources {formatGuideDate(updated)}
          </p>
        )}
        {headings.length > 1 && (
          <details className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">In this guide</summary>
            <nav aria-label="Guide contents" className="pb-3">
              <ol className="list-decimal pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                {headings.map(heading => <li key={heading.id}><a href={`#${heading.id}`} className="inline-flex min-h-11 items-center py-2 underline decoration-zinc-300 underline-offset-4 hover:text-red-600 dark:hover:text-red-400">{heading.text}</a></li>)}
              </ol>
            </nav>
          </details>
        )}
        <div className="mt-6">{children}</div>

        {/* live below-reference listings from the guide's own set, when
            there are any - after the article, before related reading */}
        {offersSet && <GuideLiveOffers setName={offersSet} />}

        {/* the news about this guide's release, when there is any (lib/editorialRelated) */}
        <RelatedReading kind="guide" slug={slug} />
      </main>

      <SiteFooter />
    </div>
  );
}

export function GP({ children }) {
  return <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</p>;
}

export function GH2({ children, id }) {
  return <h2 id={id || headingId(children)} className="mt-10 scroll-mt-6 text-xl font-bold text-black dark:text-zinc-50">{children}</h2>;
}

export function GUL({ children }) {
  return (
    <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
      {children}
    </ul>
  );
}

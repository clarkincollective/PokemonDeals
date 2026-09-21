import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { NEWS, getNewsItem, newsMetadata, formatNewsDate, newsImageUrl } from "@/lib/news";
import RelatedReading from "@/components/RelatedReading";
import { NEWS_BODIES } from "@/components/news/NewsBodies";
import { serializeJsonLd, publisherNode } from "@/lib/jsonLd";
import { organizationSameAs } from "@/lib/socialProfiles";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 21600;

export function generateStaticParams() {
  return NEWS.map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return newsMetadata(slug);
}

export default async function NewsItemPage({ params }) {
  const { slug } = await params;
  const item = getNewsItem(slug);
  if (!item) notFound();

  const Body = NEWS_BODIES[slug];
  // A registry entry with no body would render an empty page; that is a
  // build-time mistake, not something to publish.
  if (!Body) notFound();

  const updated = item.updated ?? item.published;
  // NewsArticle.image must be absolute, so a hosted path is prefixed.
  const rawImage = newsImageUrl(item);
  const image = rawImage && rawImage.startsWith("/") ? `${SITE_URL}${rawImage}` : rawImage;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "News", item: `${SITE_URL}/news` },
      { "@type": "ListItem", position: 3, name: item.title, item: `${SITE_URL}/news/${slug}` },
    ],
  };

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title,
    description: item.blurb,
    datePublished: item.published,
    dateModified: updated,
    mainEntityOfPage: `${SITE_URL}/news/${slug}`,
    ...(image ? { image: [image] } : {}),
    // Reference the ONE Organization by @id rather than inlining a second,
    // anonymous copy. The inline version had no @id, so a machine reading
    // this page saw a different entity from the one every other page names
    // as publisher - two identities for the same site (2026-09-21 audit).
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(publisherNode(organizationSameAs())) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }} />
      <SkipToContent />
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-3xl flex-1 px-6 py-6 sm:py-8">
        <Link
          href="/news"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          ← All news
        </Link>

        <h1 className="mt-5 text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">{item.title}</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          <time dateTime={item.published}>Published {formatNewsDate(item.published)}</time>
          {item.updated && item.updated !== item.published && (
            <> · Updated {formatNewsDate(item.updated)}</>
          )}
        </p>

        <article>
          <Body />
        </article>

        {Array.isArray(item.sources) && item.sources.length > 0 && (
          <section aria-labelledby="sources-heading" className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h2 id="sources-heading" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-400">
              Sources
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
              {item.sources.map((s) => (
                <li key={s.href}>
                  <a
                    href={s.href}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="text-red-600 underline underline-offset-2 hover:text-red-700 dark:text-red-500"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* the guides covering this story's set (lib/editorialRelated) */}
        <RelatedReading kind="news" slug={item.slug} />
      </main>

      <SiteFooter />
    </div>
  );
}

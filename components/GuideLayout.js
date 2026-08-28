import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getGuide, GUIDES_PUBLISHED } from "@/lib/guides";

const SITE_URL = "https://pokemondealfinder.com";

// Shared chrome for an editorial guide page: header, back link, H1,
// BreadcrumbList + Article JSON-LD, footer. The page supplies the body.
export default function GuideLayout({ slug, children }) {
  const g = getGuide(slug);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
      { "@type": "ListItem", position: 3, name: g.title, item: `${SITE_URL}/guides/${slug}` },
    ],
  };

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.blurb,
    datePublished: GUIDES_PUBLISHED,
    dateModified: GUIDES_PUBLISHED,
    author: { "@type": "Organization", name: "Pokémon Deal Finder", url: SITE_URL },
    publisher: { "@type": "Organization", name: "Pokémon Deal Finder", url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/guides/${slug}`,
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Link
          href="/guides"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          ← All guides
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-black dark:text-zinc-50">{g.title}</h1>
        <div className="mt-6">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function GP({ children }) {
  return <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</p>;
}

export function GH2({ children }) {
  return <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">{children}</h2>;
}

export function GUL({ children }) {
  return (
    <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
      {children}
    </ul>
  );
}

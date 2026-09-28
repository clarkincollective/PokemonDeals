// The category landing pages (/deals/graded, /deals/uk, /deals/under-50, ...)
// as a STATIC, ISR-cached route (28 Sep 2026, owner: "Website page speeds
// seems a little slow").
//
// The public URL does not change: next.config.mjs rewrites /deals/<slug> to
// /deal-categories/<slug> for exactly the category slugs, so canonical,
// sitemap and every internal link keep /deals/<slug>. A direct request to
// /deal-categories/<slug> is 308'd back to /deals/<slug> (next.config
// redirects) so the internal path never becomes a second URL.
//
// Why a second route: /deals/[id] (deal detail + categories) deliberately
// has no generateStaticParams - the R3 workaround for a Next 16.3.3
// duplicated-Location bug on cold ISR redirects of expired deals - and a
// dynamic route without static params is rendered on every request with
// `private, no-store` headers. Measured that day: /deals/graded MISS 1.3 s,
// /deals/uk 2.5 s, /deals/auctions 2.5 s, on every visit. A build with
// `dynamic = "error"` proved the render itself uses no request data. The
// categories never redirect (the two redirect slugs, japanese and sealed,
// stay on the old route), so they can be prerendered and served from the
// edge; `revalidate` keeps them fresh.
import { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS } from "@/lib/dealCategories";
import DealCategoryPage, { dealCategoryMetadata } from "@/components/DealCategoryPage";
import { notFound } from "next/navigation";

export const revalidate = 600;
// only the known category slugs exist here; anything else is a 404, never a
// dynamic render
export const dynamicParams = false;

export function generateStaticParams() {
  return DEAL_CATEGORY_SLUGS.filter((slug) => !DEAL_CATEGORIES[slug]?.redirect).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  if (!DEAL_CATEGORIES[slug] || DEAL_CATEGORIES[slug].redirect) return {};
  return dealCategoryMetadata(slug);
}

export default async function DealCategoryRoute({ params }) {
  const { slug } = await params;
  if (!DEAL_CATEGORIES[slug] || DEAL_CATEGORIES[slug].redirect) notFound();
  return <DealCategoryPage slug={slug} />;
}

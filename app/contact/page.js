import SkipToContent from "@/components/SkipToContent";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { serializeJsonLd } from "@/lib/jsonLd";

const SITE_URL = "https://pokemondealfinder.com";
const CONTACT_EMAIL = "pokemondealfinder@gmail.com";

const TITLE = "Contact";
const DESCRIPTION =
  "Reach Pokemon Deal Finder by email — for wrong card-to-listing matches, data problems, affiliate or press enquiries, and general questions.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/contact` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Contact", item: `${SITE_URL}/contact` },
  ],
};

const contactPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact Pokemon Deal Finder",
  url: `${SITE_URL}/contact`,
  publisher: { "@id": `${SITE_URL}/#organization`, email: CONTACT_EMAIL },
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(contactPageJsonLd) }} />
      <SkipToContent />
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 [overflow-wrap:anywhere] mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">Contact</h1>

        <p className="mt-4 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-semibold text-red-600 hover:underline dark:text-red-500"
          >
            {CONTACT_EMAIL}
          </a>
          . It&apos;s the only channel — there&apos;s no phone line or live chat.
        </p>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">Good reasons to write</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          <li>A listing is matched to the wrong card, set, or grade.</li>
          <li>A market price or discount looks clearly wrong.</li>
          <li>A page is broken, or a card or set is missing that clearly shouldn&apos;t be.</li>
          <li>Affiliate, partnership, or press enquiries.</li>
          <li>General questions about how the site works.</li>
        </ul>

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">What this isn&apos;t</h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          It is not customer support for an eBay order. Payment, shipping, cancellations, returns, and
          disputes are between you and the eBay seller, through eBay — this site isn&apos;t involved in
          the transaction. If you&apos;re reporting a wrong match, a direct link to the listing and the
          page you saw it on makes it much faster to fix.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

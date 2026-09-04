import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CurrencyProvider from "@/components/CurrencyProvider";
import AnalyticsBootstrap from "@/components/analytics/AnalyticsBootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://pokemondealfinder.com";
const SITE_TITLE = "Pokemon Deal Finder";
const SITE_DESCRIPTION =
  "Live below-market Pokemon card listings from eBay, checked automatically against real market pricing and real sold-listing data.";

// Stable fragment @ids so every page's JSON-LD (breadcrumbs, collection
// pages, product blocks) can point at ONE organization / website entity
// instead of re-declaring a slightly different copy per page.
const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

// Site-wide machine-readable identity. Rendered once here so it is present
// on every route (previously a bare Organization/WebSite only appeared on
// the homepage's promo view). Every field is verifiable from the site:
// the name and URL are the site's own, the logo is the real favicon mark
// at /icon.svg, and the description is a factual one-sentence summary of
// what the tool does - matching the prose on /how-it-works and
// /methodology. No sameAs (no verified external profiles exist), no
// Person/founder, no superlatives, no affiliation claims.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE_TITLE,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icon.svg`,
  description:
    "Pokemon Deal Finder is a free tool that scans eBay listings for Pokemon trading cards and identifies the ones priced below their market value, using real market prices and recent sold-listing data.",
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: SITE_TITLE,
  url: `${SITE_URL}/`,
  publisher: { "@id": ORG_ID },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    // %s lets child pages set their own title while keeping the site name
    // suffixed consistently (e.g. "Search Any Card | Pokemon Deal Finder").
    template: `%s | ${SITE_TITLE}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ["Pokemon card deals", "Pokemon TCG", "eBay Pokemon cards", "cheap Pokemon cards", "Pokemon card prices"],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // Google Search Console site-ownership verification (HTML tag method).
  verification: {
    google: "4aLIdWXL2x1foNlBWXXHUr_vdNRJNdU32c3uGAC-FaM",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Impact.com (TCGPlayer affiliate program) universal tracking +
            site-verification tag. next/script `beforeInteractive` is
            injected into the initial server HTML as a literal <script>
            (so a verification crawler reading raw source still sees it)
            and Next guarantees it loads exactly once - the raw <head>
            <script id> version rendered a duplicate `id` in the hydrated
            DOM on statically-generated routes (/sets/[slug], /cards/[slug]). */}
        <Script
          id="impact-verification"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7555826-7fdc-4df9-b34b-dccd926953fe1.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');",
          }}
        />
        <CurrencyProvider>
          <AnalyticsBootstrap />
          {children}
        </CurrencyProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

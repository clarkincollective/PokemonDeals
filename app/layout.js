import Script from "next/script";
import { Sora, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CurrencyProvider from "@/components/CurrencyProvider";
import { RenderClockProvider } from "@/components/RenderClock";
import AnalyticsBootstrap from "@/components/analytics/AnalyticsBootstrap";
import "./globals.css";

// Redesign 2026-09 (docs/design/redesign-2026-09.html): three faces, all
// self-hosted through next/font - Sora for display headings, Inter Tight
// for UI text, JetBrains Mono (tabular) for every price, %, count and time.
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["600", "700"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["500", "600"] });

const SITE_URL = "https://pokemondealfinder.com";
const SITE_TITLE = "Pokemon Deal Finder";
const SITE_DESCRIPTION =
  "Live below-market Pokemon card listings from eBay, checked automatically against real market pricing and real sold-listing data.";

// Structured-data brief 2026-09-20: the Organization and WebSite entities
// are emitted on the home page only, inside its single @graph
// (lib/jsonLd buildHomeGraph). Inner pages reference them by @id.


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
      // `dark` selects every dark: variant unconditionally (globals.css
      // @custom-variant): the site is dark-first, one theme, by design.
      className={`dark ${sora.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* SEO audit 2026-09-20: every card image comes from one of these two
            hosts; opening the connections early shortens LCP on the first
            deal card / card hero. Fonts are self-hosted (next/font). */}
        <link rel="preconnect" href="https://i.ebayimg.com" />
        <link rel="preconnect" href="https://tcgplayer-cdn.tcgplayer.com" />
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
        {/* The server render's clock, captured once per render so it is
            baked into this same HTML + flight payload. Relative timestamps
            (components/RelativeTime.js) hydrate against it instead of the
            browser's clock/zone - see components/RenderClock.js. Date.now()
            does not opt a route into dynamic rendering, so static/ISR pages
            stay static and carry their own render-time clock. */}
        <RenderClockProvider now={Date.now()}>
          <CurrencyProvider>
            <AnalyticsBootstrap />
            {children}
          </CurrencyProvider>
        </RenderClockProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

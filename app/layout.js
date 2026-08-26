import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
const SITE_TITLE = "Pokémon Deal Finder";
const SITE_DESCRIPTION =
  "Live below-market Pokémon card listings from eBay, checked automatically against real market pricing and real sold-listing data.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    // %s lets child pages set their own title while keeping the site name
    // suffixed consistently (e.g. "Search Any Card | Pokémon Deal Finder").
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
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Impact.com (TCGPlayer affiliate program) site-verification tag.
            A genuine <script> element (not next/script - that gets
            wrapped in Next's internal loading payload rather than
            rendered as literal HTML, which a verification crawler
            reading raw page source won't recognize as the tag it's
            looking for). */}
        <script
          id="impact-verification"
          dangerouslySetInnerHTML={{
            __html:
              "(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7555826-7fdc-4df9-b34b-dccd926953fe1.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

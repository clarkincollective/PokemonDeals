import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Pokémon Deal Finder",
  description:
    "Live below-market Pokémon card listings from eBay, checked automatically against real market pricing.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Impact.com (TCGPlayer affiliate program) site-verification tag.
            beforeInteractive makes Next.js inject it into the
            server-rendered <head> itself, same as pasting it in
            directly - verification crawlers read the raw HTML rather
            than waiting for hydration. */}
        <Script id="impact-verification" strategy="beforeInteractive">
          {`(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7555826-7fdc-4df9-b34b-dccd926953fe1.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');`}
        </Script>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

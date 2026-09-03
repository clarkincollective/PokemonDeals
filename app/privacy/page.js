import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";
const CONTACT_EMAIL = "pokemondealfinder@gmail.com";
const LAST_UPDATED = "3 September 2026";

const TITLE = "Privacy Policy";
const DESCRIPTION =
  "How Pokemon Deal Finder handles data: server logs, anonymous cookieless analytics, browser local storage, optional price-alert emails, affiliate links, and a private read-only Google Search Console integration.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/privacy` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Privacy Policy", item: `${SITE_URL}/privacy` },
  ],
};

const h2 = "mt-10 text-lg font-bold text-black dark:text-zinc-50";
const h3 = "mt-6 text-sm font-semibold text-black dark:text-zinc-50";
const p = "mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";
const ul = "mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">Privacy Policy</h1>
        <p className="mt-2 text-xs text-zinc-500">Last updated: {LAST_UPDATED}</p>

        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Pokemon Deal Finder ({SITE_URL}) is a free tool that scans eBay listings for Pokemon
          trading cards and compares them against market reference prices. There are no user accounts.
          This page explains what data the site touches and why. If a practice is not described here,
          it is not something the site does.
        </p>

        <h2 className={h2}>Server logs and hosting</h2>
        <p className={p}>
          The site is hosted on Vercel. Like any website, our hosting provider records standard
          request information — your IP address, browser user-agent, the page requested, and a
          timestamp — for security, abuse prevention, and operating the service. These logs are held
          by the hosting provider for a limited period and are not used to build a profile of you or
          combined with anything else.
        </p>

        <h2 className={h2}>Analytics</h2>
        <p className={p}>
          We use Vercel Web Analytics and Vercel Speed Insights to see aggregate page views and
          page-load performance. They are privacy-oriented: they do not set cross-site advertising
          cookies and do not track you across other websites. We see totals and trends, not
          individuals.
        </p>
        <h3 className={h3}>Product analytics (PostHog)</h3>
        <p className={p}>
          To understand which parts of the site actually help people find a deal, we use PostHog for
          anonymous product analytics, running in fully cookieless mode. It stores nothing in your
          browser — no cookies, no local storage, no session storage — and it builds no user profile.
          It cannot recognise you across days. We record simple interaction events (a page or section
          was viewed, a link or filter was clicked, a search returned results or none), along with
          your device type, a coarse country, and any campaign tag on the link you arrived from.
        </p>
        <p className={p}>
          We never send your search text, your email address, form contents, or anything you type —
          only structural facts about a search (for example &ldquo;two words, mentioned a grade,
          mentioned a price&rdquo;). Analytics data is processed by PostHog on servers in the European
          Union. If your browser sends a Global Privacy Control or Do Not Track signal, this analytics
          does not run at all. It is also entirely disabled unless a project key is configured.
        </p>

        <h2 className={h2}>Storage in your browser</h2>
        <p className={p}>
          The site stores a few small preferences in your browser&apos;s local storage (not cookies).
          These never leave your device and are not sent to us:
        </p>
        <ul className={ul}>
          <li>your currency and region / &ldquo;shipping to&rdquo; choice;</li>
          <li>cards you have saved and cards you have recently viewed;</li>
          <li>a timestamp of your last visit, used to show a &ldquo;new since your last visit&rdquo; count.</li>
        </ul>
        <p className={p}>
          You can clear all of this at any time by clearing site data for {SITE_URL} in your browser.
          The product analytics described above stores nothing in your browser at all.
        </p>

        <h2 className={h2}>Affiliate links</h2>
        <p className={p}>
          Pokemon Deal Finder participates in the eBay Partner Network and the TCGPlayer affiliate
          program (administered through Impact.com). Outbound listing and price links carry an
          affiliate tag, and a script from Impact.com (loaded on the site) rewrites TCGPlayer links
          and records affiliate click and impression attribution so the retailer can credit a
          resulting purchase. This does not change the price you pay, and there is no paid placement —
          see the{" "}
          <Link href="/affiliate-disclosure" className="text-red-600 hover:underline dark:text-red-500">
            affiliate disclosure
          </Link>
          . When you click through to eBay or TCGPlayer, their own privacy policies apply.
        </p>

        <h2 className={h2}>Price alerts and the weekly email</h2>
        <p className={p}>
          These are optional and you only take part if you ask to. If you submit your email address
          for a price alert, or tick the box for the weekly deals digest, we store your email address,
          the card and target price you chose, and a random unsubscribe token in our database
          (Supabase). We send a confirmation email and, after you confirm, only the alerts or digest
          you signed up for, using our transactional email provider (Resend). Every message has an
          unsubscribe link; unsubscribing stops all further email. This address is not used for
          anything else and is not shared for marketing.
        </p>

        <h2 className={h2}>Contact</h2>
        <p className={p}>
          If you email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-semibold text-red-600 hover:underline dark:text-red-500"
          >
            {CONTACT_EMAIL}
          </a>
          , we use what you send only to respond to you.
        </p>

        <h2 className={h2}>Google API data</h2>
        <p className={p}>
          Pokemon Deal Finder has a private, owner-only integration with Google Search Console. It
          uses a single read-only scope:
        </p>
        <p className="mt-3 rounded-md border border-zinc-200 bg-white p-3 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          https://www.googleapis.com/auth/webmasters.readonly
        </p>
        <h3 className={h3}>Purpose</h3>
        <p className={p}>
          To read Search Console performance data for the pokemondealfinder.com property — search
          impressions, clicks, click-through rate, average position, and which pages and queries drive
          them — so the owner can monitor and improve this site&apos;s own search performance.
        </p>
        <h3 className={h3}>Access and storage</h3>
        <p className={p}>
          The OAuth client credentials and the resulting access token are held only in the site
          owner&apos;s private local admin tooling. They are never included in any page, never in
          client-side code, never deployed to our hosting provider, and never exposed to site
          visitors. The integration is read-only: it cannot change anything in Search Console, submit
          URLs, or modify sitemaps.
        </p>
        <h3 className={h3}>Use and sharing</h3>
        <p className={p}>
          Data obtained through this Google integration is used only to operate and improve Pokemon
          Deal Finder&apos;s own search and SEO performance. It is not sold, and it is not shared with
          any third party or used for advertising.
        </p>
        <h3 className={h3}>Revoking access</h3>
        <p className={p}>
          The site owner can revoke this application&apos;s access at any time from the Google Account
          permissions page (
          <a
            href="https://myaccount.google.com/permissions"
            className="text-red-600 hover:underline dark:text-red-500"
            rel="noopener noreferrer"
            target="_blank"
          >
            myaccount.google.com/permissions
          </a>
          ) and by deleting the local token and credential files.
        </p>

        <h2 className={h2}>Google API Services User Data Policy — Limited Use</h2>
        <p className={p}>
          Pokemon Deal Finder&apos;s use of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-red-600 hover:underline dark:text-red-500"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. Specifically: the Search Console data is used only
          for the read-only performance-monitoring functionality described above; it is not
          transferred or sold to third parties, including for advertising or any advertising-related
          purpose; it is not used for personalised advertising; and it is not used for any purpose
          other than the one disclosed here. Humans do not read this data except where necessary for
          security, to comply with the law, or with the owner&apos;s explicit consent.
        </p>

        <h2 className={h2}>Service providers we rely on</h2>
        <ul className={ul}>
          <li>Vercel — website hosting, plus the analytics and speed-insights described above.</li>
          <li>PostHog (EU) — anonymous, cookieless product analytics described above.</li>
          <li>Supabase — the database that stores the site&apos;s catalogue, deal data, and any price-alert / newsletter records.</li>
          <li>Resend — sends the confirmation, price-alert, and weekly-digest emails.</li>
          <li>Impact.com — administers the TCGPlayer affiliate program and the affiliate attribution tag.</li>
          <li>eBay Partner Network — affiliate program for eBay links.</li>
          <li>PokemonPriceTracker and JustTCG — provide the Pokemon card catalogue and market reference pricing shown on the site.</li>
          <li>Google Search Console — the private, read-only owner integration described above.</li>
        </ul>

        <h2 className={h2}>What we do not do</h2>
        <ul className={ul}>
          <li>We do not sell or rent personal data.</li>
          <li>We do not build advertising profiles or run personalised ads.</li>
          <li>We do not share email addresses with anyone for marketing.</li>
          <li>We do not require an account, a password, or a payment method — purchases happen entirely on eBay or TCGPlayer.</li>
        </ul>

        <h2 className={h2}>Data retention</h2>
        <p className={p}>
          Hosting logs are kept by the hosting provider for a limited period and then discarded.
          Analytics are aggregate and retained as totals. Price-alert and newsletter records are kept
          while the subscription is active; when you unsubscribe the record is marked inactive, and
          you can ask us to delete it entirely. Emails you send us are kept only as long as needed to
          resolve your enquiry.
        </p>

        <h2 className={h2}>Your choices</h2>
        <ul className={ul}>
          <li>Clear the site&apos;s browser storage at any time via your browser&apos;s &ldquo;clear site data&rdquo; controls.</li>
          <li>Unsubscribe from any alert or digest email using the link in that email.</li>
          <li>Email {CONTACT_EMAIL} to have your price-alert or newsletter data deleted.</li>
          <li>Most browsers let you block scripts or storage per site if you prefer.</li>
        </ul>

        <h2 className={h2}>Children</h2>
        <p className={p}>
          This site is not directed at children, and we do not knowingly collect personal information
          from children. If you believe a child has provided us an email address, contact us and we
          will remove it.
        </p>

        <h2 className={h2}>Changes to this policy</h2>
        <p className={p}>
          If this policy changes, the updated version will be posted here with a new &ldquo;last
          updated&rdquo; date.
        </p>

        <p className="mt-10 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Questions about privacy?{" "}
          <Link href="/contact" className="text-red-600 hover:underline dark:text-red-500">
            Contact us
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

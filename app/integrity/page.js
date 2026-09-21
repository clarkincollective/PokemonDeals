import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SkipToContent from "@/components/SkipToContent";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, dataset, FIGURES_LICENSE, publisherNode } from "@/lib/jsonLd";
import { organizationSameAs } from "@/lib/socialProfiles";
import { fetchIntegrityReport, fetchIntegrityHistory } from "@/lib/integrityReport";
import { LISTING_CHECKS } from "@/lib/trustContent";

export const revalidate = 21600;

const SITE_URL = "https://pokemondealfinder.com";
const PATH = "/integrity";
const TITLE = "Listing Integrity Report";
const DESCRIPTION =
  "Live counts from our database: Pokemon card listings shown, listings withheld for failing a check and why, and listings checked in the last 24 hours.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const fmtDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const n = (v) => (v == null ? "—" : Number(v).toLocaleString());

// GEO audit 2026-09-19. The one page no summary can substitute for: the
// site's own withholding numbers, from the live table, dated. Every figure
// is a count of rows; nothing here is a claim about any single listing.
// The "stopped being shown" figure appears only once the database stamps
// deactivated_at (supabase/integrity_migration.sql) - never a false zero.
export default async function IntegrityPage() {
  const [r, history] = await Promise.all([fetchIntegrityReport(), fetchIntegrityHistory(30)]);
  const day = r.generatedAt.slice(0, 10);
  const stoppedSentence = r.stopped24h != null ? ` and ${n(r.stopped24h)} stopped being shown because they ended, sold or were not re-seen` : "";
  const capsule = r.error
    ? "The integrity counts could not be read from the database on this build; the checks below still apply to every listing shown."
    : `As of ${fmtDate(r.generatedAt)}, Pokemon Deal Finder shows ${n(r.activeShown)} live eBay Pokemon card listings and withholds ${n(r.withheldActive)} active listings that failed a check. In the last 24 hours ${n(r.checked24h)} listings were checked against eBay${stoppedSentence}. Listings come from ${r.marketplaces.length} eBay marketplaces (US, UK, Australia, Canada, Germany, Italy).`;
  const tiles = [
    ["Shown now", r.activeShown],
    ["Withheld (active)", r.withheldActive],
    ["Checked, 24 h", r.checked24h],
    ...(r.stopped24h != null ? [["Stopped showing, 24 h", r.stopped24h]] : []),
  ];
  const first = history[0]?.day;
  const last = history[history.length - 1]?.day;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          // The Dataset below names this Organization as creator AND
          // publisher by @id; without the node the attribution on our own
          // research resolved to nothing (2026-09-21 audit).
          publisherNode(organizationSameAs()),
          breadcrumbList([{ name: "Deals", href: "/" }, { name: "Listing integrity" }]),
          dataset({
            name: `Pokemon Deal Finder listing integrity counts${first && last ? `, ${first} to ${day}` : `, ${day}`}`,
            description: DESCRIPTION,
            url: PATH,
            dateModified: r.generatedAt,
            temporalCoverage: `${first ?? new Date(Date.parse(r.generatedAt) - 86_400_000).toISOString().slice(0, 10)}/${day}`,
            variableMeasured: ["listings shown (count)", "listings withheld by reason family (count)", "listings checked in 24 hours (count)", "listings that stopped being shown in 24 hours (count)"],
            license: FIGURES_LICENSE,
          }),
        ]}
      />
      <SkipToContent />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 scroll-mt-6 px-6 py-8">
        <Link href="/" className="block text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← All deals
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-black dark:text-zinc-50">Listing integrity report</h1>
        <p className="mt-2 text-xs text-zinc-500">Rebuilt from the live database several times a day; a daily snapshot builds the history below. Figures are row counts; the recorded reason for each withheld listing is grouped by its family.</p>

        <p className="mt-5 text-base leading-relaxed text-zinc-800 dark:text-zinc-200" data-answer-capsule>
          {capsule}
        </p>

        {!r.error && (
          <>
            <dl className={`mt-6 grid grid-cols-2 gap-3 ${tiles.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              {tiles.map(([k, v]) => (
                <div key={k} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{k}</dt>
                  <dd className="tnum mt-1 text-2xl font-bold text-black dark:text-zinc-50">{n(v)}</dd>
                </div>
              ))}
            </dl>

            <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">Why active listings are withheld</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Each withheld listing carries the reason the check recorded. A withheld listing is still tracked — if a
              later check clears it (for example eBay confirms an early listing), it can be shown again.
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th scope="col" className="px-4 py-2">Reason family</th>
                    <th scope="col" className="px-4 py-2 text-right">Listings</th>
                  </tr>
                </thead>
                <tbody>
                  {r.withheldByReason.map((row) => (
                    <tr key={row.family} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">{row.label}</td>
                      <td className="tnum px-4 py-2 text-right text-zinc-800 dark:text-zinc-200">{n(row.count)}</td>
                    </tr>
                  ))}
                  {r.withheldByReason.length === 0 && (
                    <tr><td colSpan={2} className="px-4 py-3 text-zinc-500">No active listing is currently withheld.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {history.length > 0 && (
          <>
            <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">Daily history</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              One snapshot per UTC day, {fmtDay(first)} to {fmtDay(last)} ({history.length} {history.length === 1 ? "day" : "days"}). Counts, not estimates.
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" data-integrity-history>
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th scope="col" className="px-4 py-2">Day</th>
                    <th scope="col" className="px-4 py-2 text-right">Shown</th>
                    <th scope="col" className="px-4 py-2 text-right">Withheld</th>
                    <th scope="col" className="px-4 py-2 text-right">Checked 24 h</th>
                    <th scope="col" className="px-4 py-2 text-right">Stopped 24 h</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.day} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200"><time dateTime={h.day}>{fmtDay(h.day)}</time></td>
                      <td className="tnum px-4 py-2 text-right">{n(h.active_shown)}</td>
                      <td className="tnum px-4 py-2 text-right">{n(h.withheld_active)}</td>
                      <td className="tnum px-4 py-2 text-right">{n(h.checked_24h)}</td>
                      <td className="tnum px-4 py-2 text-right">{n(h.stopped_24h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="mt-10 text-lg font-bold text-black dark:text-zinc-50">The checks every shown listing has passed</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {LISTING_CHECKS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          These checks reduce risk; they do not make any listing &ldquo;verified authentic&rdquo;. The listing&apos;s photos,
          the seller&apos;s history and eBay&apos;s Money Back Guarantee remain the buyer&apos;s own checks. Full detail is on the{" "}
          <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">methodology</Link> page.
          Figures on this page may be quoted with attribution (CC BY 4.0).
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

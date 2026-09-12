import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import ReferenceOfferCard from "@/components/ReferenceOfferCard";
import { DEAL_STATE_FIXTURES, REFERENCE_FIXTURE, REFERENCE_FIXTURE_NO_PRICE } from "@/lib/dev/dealStateFixtures";

// Deal-first R1 - the COMPONENT SHEET. A dev-only page that renders the
// shared header/footer and every deal-card state from labelled fixtures,
// so the states can be inspected side by side at desktop and phone
// widths. It does not exist in production (404), is never linked, is
// noindex, and reads no data.
export const dynamic = "force-static";

export const metadata = {
  title: "Deal card states (dev sheet)",
  robots: { index: false, follow: false },
};

export default function DealStatesSheet() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Dev sheet · not a live page</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Deal card states</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Every state renders through the real DealCard and the real trusted-claim rules from fixture
          rows. Artwork is catalogue reference art (labelled); prices, ids and links are placeholders
          and do not describe any live eBay offer.
        </p>

        <section className="mt-8" data-sheet="deal-states">
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {DEAL_STATE_FIXTURES.map((f) => (
              <div key={f.id} className="flex flex-col" data-sheet-state={f.id}>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{f.label}</p>
                <p className="mb-3 mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{f.note}</p>
                <div className="flex-1">
                  <DealCard deal={f.deal} hub={f.hub} rank={f.rank} pageName="home_all_deals" validSetSlugs={["jungle", "base-set", "neo-destiny"]} />
                </div>
              </div>
            ))}
            <div className="flex flex-col" data-sheet-state="reference_only">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Catalogue - reference only</p>
              <p className="mb-3 mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                No listing: the exact identity, a labelled market reference and a Find-on-eBay search. Dashed frame, no price badge, no deal button.
              </p>
              <div className="flex-1">
                <ReferenceOfferCard card={REFERENCE_FIXTURE} />
              </div>
            </div>
            <div className="flex flex-col" data-sheet-state="reference_none">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Catalogue - no reliable reference</p>
              <p className="mb-3 mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">A catalogue card with no trustworthy reference figure: never $0, never a placeholder price.</p>
              <div className="flex-1">
                <ReferenceOfferCard card={REFERENCE_FIXTURE_NO_PRICE} />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 max-w-3xl rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">States this sheet cannot show</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Expired / unavailable listing</strong> - a row that fails the display gate never reaches DealCard; the truthful expiry behaviour lives on the listing detail page (R3 scope).
            </li>
            <li>
              <strong>Shipping unknown vs free</strong> - the scan records <code>shipping = 0</code> for both, so the card says &quot;no shipping charge listed&quot; rather than &quot;free&quot;; a distinct unknown state needs a scanner field, which a layout change does not authorise.
            </li>
            <li>
              <strong>Destination eligibility</strong> - not a card-level fact; the country filter scopes the feed.
            </li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

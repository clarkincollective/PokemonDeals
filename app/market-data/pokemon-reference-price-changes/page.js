import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage } from "@/lib/jsonLd";
import { catalogImageUrl } from "@/lib/cardImage";
import { STUDY } from "@/lib/studies/referencePriceChange30d";

// A FIXED, DATED SNAPSHOT. Every figure comes from the generated study
// aggregate (lib/studies/referencePriceChange30d) - there is no runtime
// provider request, no refresh and no database read on this route, so the
// published numbers can never drift from the analysis they were computed
// from. `revalidate` matches the other market-data pages purely so the
// shell re-renders on the same cadence; the data itself is static.
export const revalidate = 21600;

const SITE_URL = "https://pokemondealfinder.com";
const PATH = "/market-data/pokemon-reference-price-changes";

const TITLE = "Pokemon Reference-Price Changes: A 30-Day Sample";
const DESCRIPTION =
  "A dated 30-day study of Pokemon card reference prices across 150 tracked product records - how many moved, how product summaries differ from individual condition and printing variants, and what the sample cannot tell you.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const nf = (n) => Number(n).toLocaleString("en-US");
const money = (n) => `$${Number(n).toFixed(2)}`;
const signed = (n) => `${n > 0 ? "+" : ""}${n}%`;
const human = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function ReferencePriceChangesPage() {
  const s = STUDY;
  const lateSplit = s.window.endpointDates.late;
  const lateMain = lateSplit.reduce((a, b) => (b.variants > a.variants ? b : a), lateSplit[0]);
  const lateOther = lateSplit.filter((x) => x.date !== lateMain.date);
  const citation = `Pokemon Deal Finder, "${TITLE}", ${human(s.window.earlyTarget)} to ${human(s.window.lateTarget)}. ${SITE_URL}${PATH}`;

  // Product-level vs variant-level, for the chart and its data table.
  const compare = [
    { key: "up", label: "Up more than 1%", product: s.overall.up, variant: s.pooled.up },
    { key: "flat", label: "Flat within 1%", product: s.overall.flat, variant: s.pooled.flat },
    { key: "down", label: "Down more than 1%", product: s.overall.down, variant: s.pooled.down },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Market data", href: "/market-data" },
            { name: "Reference-price changes" },
          ]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: PATH, dateModified: `${s.window.lateTarget}T00:00:00.000Z` }),
        ]}
      />
      <SiteHeader />

      <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <nav className="text-sm text-zinc-500">
          <Link href="/market-data" className="hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Market Data
          </Link>
        </nav>

        {/* ---------- finding first, above any large image ---------- */}
        <header className="mt-3">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            What a 30-day sample shows about Pokemon reference-price changes
          </h1>
          <p className="mt-4 text-lg text-zinc-800 dark:text-zinc-200">
            Between <time dateTime={s.window.earlyTarget}>{human(s.window.earlyTarget)}</time> and{" "}
            <time dateTime={s.window.lateTarget}>{human(s.window.lateTarget)}</time>, the median of{" "}
            <strong className="text-black dark:text-zinc-50">{nf(s.coverage.products)}</strong> sampled product
            records moved <strong className="text-black dark:text-zinc-50">{signed(s.overall.median)}</strong>.
          </p>
          <p className="mt-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <strong className="text-black dark:text-zinc-50">How to read that figure.</strong> It is a{" "}
            <em>median of medians</em>: for each product record we take the middle value of its condition and
            printing variants, then the middle value across all {nf(s.coverage.products)} products. It is{" "}
            <strong>not</strong> total market growth, not an average portfolio return, and not a forecast.
          </p>
        </header>

        {/* ---------- compact lead composition: real sampled cards ---------- */}
        <section className="mt-8" aria-labelledby="lead-heading">
          <h2 id="lead-heading" className="sr-only">
            Example cards included in the sample
          </h2>
          <ul className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {s.leadCards.map((c) => (
              <li key={c.id} className="w-[21%] min-w-[76px] max-w-[104px]">
                <div className="relative aspect-[63/88] overflow-hidden rounded-md bg-zinc-50 dark:bg-zinc-900">
                  <Image
                    src={catalogImageUrl(c.id)}
                    alt={`${c.name} (${c.set}) - catalogue artwork`}
                    fill
                    sizes="(max-width: 640px) 25vw, 104px"
                    quality={80}
                    className="object-contain"
                  />
                </div>
                <p className="mt-1 truncate text-center text-[11px] text-zinc-500" title={`${c.name} — ${c.set}`}>
                  {c.name}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Four cards that were included in the sample, shown as examples of what was measured — not its
            biggest movers. Catalogue artwork identifies the card; it does not illustrate Near Mint, Played
            or Damaged condition.
          </p>
        </section>

        {/* ---------- headline distribution ---------- */}
        <section className="mt-10" aria-labelledby="dist-heading">
          <h2 id="dist-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            How the {nf(s.coverage.products)} product records moved
          </h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Up >1%" value={`${s.overall.up}%`} />
            <Stat label="Flat ±1%" value={`${s.overall.flat}%`} />
            <Stat label="Down >1%" value={`${s.overall.down}%`} />
          </dl>
        </section>

        {/* ---------- product vs variant: chart + accessible table ---------- */}
        <section className="mt-10" aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            Product summaries conceal what individual variants did
          </h2>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            Every product is sold in several <strong>variants</strong> — each condition (Near Mint through
            Damaged) in each printing (Normal, Reverse Holofoil, 1st Edition and so on) carries its own price
            and its own history. Our {nf(s.coverage.products)} product records hold{" "}
            {nf(s.coverage.eligibleVariants)} measurable variants. The medians sit close together; the
            declining share does not.
          </p>

          <figure className="mt-5">
            <div className="space-y-4" role="img" aria-label={`Product-level versus variant-level outcomes. Up more than 1 percent: ${s.overall.up}% of product records against ${s.pooled.up}% of variants. Flat within 1 percent: ${s.overall.flat}% against ${s.pooled.flat}%. Down more than 1 percent: ${s.overall.down}% against ${s.pooled.down}%.`}>
              {compare.map((row) => (
                <div key={row.key}>
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{row.label}</p>
                  <div className="mt-1.5 space-y-1">
                    <Bar tone="product" pct={row.product} caption={`By product record · ${row.product}%`} />
                    <Bar tone="variant" pct={row.variant} caption={`By individual variant · ${row.variant}%`} />
                  </div>
                </div>
              ))}
            </div>
            <figcaption className="mt-3 text-xs text-zinc-500">
              Darker bars count each of the {nf(s.coverage.products)} product records once. Lighter bars count
              each of the {nf(s.coverage.eligibleVariants)} variants once.
            </figcaption>
          </figure>

          <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Product-level and variant-level 30-day outcomes compared. Median {signed(s.overall.median)} by
                product record against {signed(s.pooled.median)} by variant.
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th scope="col" className="px-4 py-2 font-medium">View</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Median</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Up &gt;1%</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Flat ±1%</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Down &gt;1%</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-t border-zinc-100 dark:border-zinc-900">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium text-black dark:text-zinc-50">
                    By product record ({nf(s.overall.products)})
                  </th>
                  <td className="px-2 py-2.5 text-right font-semibold text-black dark:text-zinc-50">{signed(s.overall.median)}</td>
                  <td className="px-2 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{s.overall.up}%</td>
                  <td className="px-2 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{s.overall.flat}%</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-black dark:text-zinc-50">{s.overall.down}%</td>
                </tr>
                <tr className="border-t border-zinc-100 dark:border-zinc-900">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium text-black dark:text-zinc-50">
                    By individual variant ({nf(s.pooled.variants)})
                  </th>
                  <td className="px-2 py-2.5 text-right font-semibold text-black dark:text-zinc-50">{signed(s.pooled.median)}</td>
                  <td className="px-2 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{s.pooled.up}%</td>
                  <td className="px-2 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{s.pooled.flat}%</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-black dark:text-zinc-50">{s.pooled.down}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
            {s.overall.down}% of product medians fell, against <strong className="text-black dark:text-zinc-50">{s.pooled.down}%</strong>{" "}
            of individual variants. The variant-level view preserves differences that product summaries
            conceal. To assess a particular copy, check its exact condition-and-printing reference. Both
            percentages are sample statistics, not a valuation of any individual card.
          </p>
        </section>

        {/* ---------- worked example: one verified image, shown once ---------- */}
        <section className="mt-10" aria-labelledby="example-heading">
          <h2 id="example-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            A worked example: {s.example.name} ({s.example.set})
          </h2>
          <div className="mt-4 flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-card sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
            <figure className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-44">
              <div className="relative aspect-[63/88] overflow-hidden rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <Image
                  src={catalogImageUrl(s.example.id)}
                  alt={`${s.example.name} (${s.example.set}) - catalogue artwork`}
                  fill
                  sizes="(max-width: 640px) 160px, 176px"
                  quality={85}
                  className="object-contain"
                />
              </div>
              <figcaption className="mt-2 text-[11px] leading-snug text-zinc-500">
                Catalogue artwork for {s.example.name} ({s.example.set}). One image is shown because we hold one
                verified image for this product. The 1st Edition printing carries an edition stamp on the card
                face that the Unlimited printing does not; we do not have a separate verified image of each
                printing, so we describe the difference rather than illustrate it. The artwork identifies the
                card — it does not illustrate Near Mint, Played or Damaged condition.
              </figcaption>
            </figure>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {s.example.name} finished the window with a product median of{" "}
                <strong className="text-black dark:text-zinc-50">{signed(s.example.median)}</strong> — while{" "}
                <strong className="text-black dark:text-zinc-50">
                  {s.example.fallers} of its {s.example.variants} variants fell
                </strong>
                .
              </p>
              <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">
                    {s.example.name} ({s.example.set}) variant prices in US dollars on{" "}
                    {human(s.window.earlyTarget)} and {human(s.window.lateTarget)}, with the percentage change.
                  </caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                      <th scope="col" className="px-3 py-2 font-medium">Printing / condition</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">12 Aug (USD)</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">11 Sep (USD)</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {s.example.rows.map((r) => (
                      <tr key={`${r.printing}-${r.condition}`} className="border-t border-zinc-100 dark:border-zinc-900">
                        <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal text-zinc-700 dark:text-zinc-300">
                          {r.printing} / {r.condition}
                        </th>
                        <td className="px-2 py-2 text-right text-zinc-600 dark:text-zinc-400">{money(r.from)}</td>
                        <td className="px-2 py-2 text-right text-zinc-600 dark:text-zinc-400">{money(r.to)}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            r.changePct < 0 ? "text-zinc-900 dark:text-zinc-100" : "text-red-600 dark:text-red-500"
                          }`}
                        >
                          {signed(r.changePct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                The single figure &ldquo;{signed(s.example.median)} for {s.example.name}&rdquo; is a
                product-level summary. It is not the movement of any one row above: a 1st Edition Near Mint
                reference rose {signed(s.example.rows.find((r) => r.printing === "1st Edition" && r.condition === "Near Mint").changePct)}{" "}
                while an Unlimited Near Mint reference fell{" "}
                {signed(s.example.rows.find((r) => r.printing === "Unlimited" && r.condition === "Near Mint").changePct)} over
                identical dates.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- by era ---------- */}
        <section className="mt-10" aria-labelledby="era-heading">
          <h2 id="era-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            By era group
          </h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Median 30-day change by era group, each group holding 50 sampled product records.
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th scope="col" className="px-4 py-2 font-medium">Group</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Products</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Median</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Up</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Flat</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Down</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {s.byEra.map((e) => (
                  <tr key={e.group} className="border-t border-zinc-100 dark:border-zinc-900">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-black dark:text-zinc-50">{e.label}</th>
                    <td className="px-2 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{e.products}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-black dark:text-zinc-50">{signed(e.median)}</td>
                    <td className="px-2 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{e.up}%</td>
                    <td className="px-2 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{e.flat}%</td>
                    <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-400">{e.down}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Each group holds exactly 50 product records because we allocated them equally on purpose. The
            groups are not sized to reflect how many cards exist in each era, so the overall figure describes
            this sample, not the hobby.
          </p>
        </section>

        {/* ---------- method ---------- */}
        <section className="mt-10" aria-labelledby="method-heading">
          <h2 id="method-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            How this was measured
          </h2>

          <h3 className="mt-4 text-sm font-semibold text-black dark:text-zinc-50">Source</h3>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Market data provided by <span className="font-medium">{s.source.provider}</span>. These are{" "}
            <strong>reference-price observations</strong> — a provider estimate of a variant&apos;s market
            price — <strong>not</strong> records of individual completed sales. The provider documents its
            current price field in US dollars. It states no currency for historical points and returns no
            currency field, so the currency of the historical values is an inference on our part, not an
            explicit field in the response.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">Sampling</h3>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {s.sampling.pilotRetained} deliberately selected pilot records were retained from earlier
            feasibility work, then {s.sampling.seededAdded} further records were selected by seeded
            deterministic shuffle — {s.sampling.addedPerGroup} per group — giving{" "}
            {nf(s.coverage.products)} in total. The pilot records were <strong>not</strong> randomly chosen,
            so the sample as a whole is not a random sample. Selection ran against our own catalogue before
            any provider lookup, so a record returning no data would have been kept as non-response rather
            than quietly replaced; none did. Seed {s.sampling.seed}.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">What the sample contains</h3>
          <ul className="mt-1 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {s.eraComposition.map((e) => (
              <li key={e.group}>
                <strong className="text-black dark:text-zinc-50">{e.label}</strong> — {e.products} sampled
                product records drawn from {e.sets} sets
                {e.group === "ex-era" ? " matching our EX-prefix rule (not every set matching that rule was sampled)" : ""}
                {e.promoProducts > 0 ? `, including ${e.promoProducts} promo products` : ""}
                {e.galleryProducts > 0 ? ` and ${e.galleryProducts} gallery-subset products` : ""}.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Promos and gallery subsets were <strong>not</strong> excluded. Eras outside these three patterns
            are absent entirely: e-Card (Expedition, Aquapolis, Skyridge), Diamond &amp; Pearl, Platinum,
            HeartGold SoulSilver, Black &amp; White, XY, Sun &amp; Moon, Legendary Collection, and
            Japanese-language cards.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">Dates</h3>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            <time dateTime={s.window.earlyTarget}>{human(s.window.earlyTarget)}</time> and{" "}
            <time dateTime={s.window.lateTarget}>{human(s.window.lateTarget)}</time> are{" "}
            <strong>target dates</strong>. For each variant we used its observation nearest each target,
            required within ±{s.window.toleranceDays} days, with no interpolation and no carrying a previous
            day&apos;s value forward. In practice every eligible variant matched{" "}
            {human(s.window.earlyTarget)} exactly at the early endpoint. At the late endpoint,{" "}
            {nf(lateMain.variants)} matched {human(lateMain.date)} and{" "}
            {lateOther.map((x, i) => (
              <span key={x.date}>
                {i > 0 ? " and " : ""}
                {x.variants} used <time dateTime={x.date}>{human(x.date)}</time>
              </span>
            ))}
            .
          </p>

          <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">Coverage</h3>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {nf(s.coverage.totalVariantRecords)} variant records were returned across{" "}
            {nf(s.coverage.products)} product records; {nf(s.coverage.eligibleVariants)} were eligible and{" "}
            {nf(s.coverage.excludedVariants)} were excluded — {s.coverage.exclusions.empty_history} with no
            price history at all, {s.coverage.exclusions.endpoint_outside_tolerance} without an observation
            close enough to a target date, and {s.coverage.exclusions.single_point} with only a single
            observation. Every product record contributed at least one eligible variant.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">Identity</h3>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            We ran one check: does the same provider set, collector number, printing and condition resolve to
            more than one record? It found <strong>{s.identity.conflicts}</strong> conflicts. That is a result
            about the check we implemented — it is <strong>not</strong> evidence that every physical printing
            is uniquely identified in this data. {s.identity.crossSetPreserved} variant records reuse a
            printing label across two different set records (for example Alakazam &ldquo;1st Edition
            Holofoil&rdquo; under both Base Set and Base Set Shadowless). We kept both records in each case.
            We are not asserting these are duplicates, and we are not asserting they are independently
            verified products; the data we hold does not settle it.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">Robustness</h3>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Excluding the {s.sensitivity.flaggedVariants} variants containing a single day-over-day move of
            50% or more leaves the median at {signed(s.sensitivity.excludingFlagged.median)}. Excluding the{" "}
            {s.sampling.pilotRetained} retained pilot records gives{" "}
            {signed(s.sensitivity.excludingPilot.median)} across {s.sensitivity.excludingPilot.products}{" "}
            records; those {s.sampling.pilotRetained} alone give {signed(s.sensitivity.pilotOnly.median)}. The
            overall median changed little in these two sensitivity checks.
          </p>
        </section>

        {/* ---------- limitations ---------- */}
        <section className="mt-10" aria-labelledby="limits-heading">
          <h2 id="limits-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            What this does not tell you
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              <strong className="text-black dark:text-zinc-50">Reference estimates, not sales.</strong> No
              completed transaction is evidenced here.
            </li>
            <li>
              <strong className="text-black dark:text-zinc-50">An unchanged number is not proof of an
              inactive market.</strong> We cannot tell a fresh estimate that landed on the same value from a
              figure carried forward — the data does not label which is which.
            </li>
            <li>
              <strong className="text-black dark:text-zinc-50">This is not the Pokemon market.</strong> It is{" "}
              {nf(s.coverage.products)} product records across three equally-allocated era groups, with
              several eras absent.
            </li>
            <li>
              <strong className="text-black dark:text-zinc-50">A product median does not describe an
              individual card.</strong> As {s.example.name} shows, variants inside one product moved in
              opposite directions over identical dates.
            </li>
            <li>
              <strong className="text-black dark:text-zinc-50">One 30-day window.</strong> It is not a trend,
              and nothing here indicates what any price will do next.
            </li>
            <li>
              <strong className="text-black dark:text-zinc-50">No investment guidance.</strong> Nothing here
              is a recommendation to buy, sell or hold.
            </li>
            <li>
              <strong className="text-black dark:text-zinc-50">Single source.</strong> These figures are not
              merged with any other price provider.
            </li>
          </ul>
        </section>

        {/* ---------- citation ---------- */}
        <section className="mt-10" aria-labelledby="cite-heading">
          <h2 id="cite-heading" className="text-xl font-semibold text-black dark:text-zinc-50">
            Citing this study
          </h2>
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            This is a fixed, dated snapshot — the figures describe the window above and are not refreshed.
            Please identify them as Pokemon Deal Finder&apos;s analysis of {nf(s.coverage.products)} sampled
            product records and include both dates.
          </p>
          <p className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            {citation}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Study version {s.version}. Full site methodology:{" "}
            <Link href="/methodology" className="font-medium text-red-600 hover:underline dark:text-red-500">
              methodology
            </Link>
            .
          </p>
        </section>

        {/* ---------- related ---------- */}
        <section className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Related</h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              <Link href="/market-data/pokemon-card-value-distribution" className="text-red-600 hover:underline dark:text-red-500">
                How Pokemon card values are distributed
              </Link>
            </li>
            <li>
              <Link href="/market-data/most-expensive-cards" className="text-red-600 hover:underline dark:text-red-500">
                Most valuable cards by raw market value
              </Link>
            </li>
            <li>
              <Link href="/guides/how-pokemon-card-prices-work" className="text-red-600 hover:underline dark:text-red-500">
                How Pokemon card prices are determined
              </Link>
            </li>
            <li>
              <Link href="/search" className="text-red-600 hover:underline dark:text-red-500">
                Check a specific card&apos;s price
              </Link>
            </li>
          </ul>
        </section>
      </article>

      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums text-black dark:text-zinc-50">{value}</dd>
    </div>
  );
}

function Bar({ pct, caption, tone }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-full max-w-[64%] rounded-sm bg-zinc-100 dark:bg-zinc-900" aria-hidden="true">
        <span
          className={`block h-2.5 rounded-sm ${tone === "product" ? "bg-red-600 dark:bg-red-500" : "bg-red-300 dark:bg-red-900"}`}
          style={{ width: `${Math.max(pct, 0.8)}%` }}
        />
      </span>
      <span className="whitespace-nowrap text-[11px] text-zinc-500">{caption}</span>
    </div>
  );
}

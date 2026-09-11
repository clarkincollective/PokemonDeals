import Link from "next/link";

// Phase 17B - the server-rendered front door for /search ("Pokemon card
// price checker / value lookup / what is my card worth").
//
// Written to help someone use the tool correctly - identify the exact
// printing, read the price for what it is, know what changes it - not to
// reach a word count. It states no prices and no market claims of its own;
// every number lives on the card pages it links to.
//
// POPULAR_LOOKUPS are permanent /cards/[slug] pages verified live (200,
// indexable, self-canonical) on 2026-09-11; tests/seo pins them against
// production during live validation. Crawlable anchors - never /search?q=
// links, which are noindex by policy.
export const POPULAR_LOOKUPS = Object.freeze([
  { slug: "charizard-base-set", label: "Charizard #004/102 (Base Set)" },
  { slug: "charizard-base-set-shadowless", label: "Charizard #004/102 (Base Set, Shadowless)" },
  { slug: "blastoise-base-set", label: "Blastoise #002/102 (Base Set)" },
  { slug: "pikachu-base-set", label: "Pikachu #058/102 (Base Set)" },
  { slug: "mewtwo-base-set", label: "Mewtwo #010/102 (Base Set)" },
  { slug: "lugia-neo-genesis", label: "Lugia #009/111 (Neo Genesis)" },
  { slug: "umbreon-vmax-alternate-art-secret-swsh07-evolving-skies", label: "Umbreon VMAX #215/203 (Evolving Skies)" },
]);

const h2 = "text-base font-semibold text-black dark:text-zinc-50";
const p = "mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";
const a = "font-medium text-red-600 hover:underline dark:text-red-500";

export default function PriceCheckerGuide({ className = "" }) {
  return (
    <section aria-labelledby="pc-guide" className={`mt-12 border-t border-zinc-200 pt-10 dark:border-zinc-800 ${className}`}>
      <h2 id="pc-guide" className="text-xl font-bold text-black dark:text-zinc-50">
        What is my Pokemon card worth?
      </h2>
      <p className={`${p} max-w-3xl`}>
        This price checker looks up the market price of a single Pokemon card. Search for the card, pick the exact
        printing from the results, and its card page shows the current market reference, prices by condition,
        graded prices where there are real recorded sales, the price history we&apos;ve recorded, and any live eBay
        listing we&apos;ve found below market.
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className={h2}>1. Identify the exact printing</h3>
          <p className={p}>
            The same Pokemon appears on many different cards, and they can be worth very different amounts. Two
            details pin down the exact card: the <strong>set</strong> it comes from and its{" "}
            <strong>collector number</strong>, printed near the bottom of the card (for example 4/102). A number
            higher than the set total, such as 108/106, marks a secret rare.
          </p>
          <p className={p}>
            Look for printing differences too. Shadowless Base Set cards, promos, holo patterns and special
            versions like Full Art, Secret or Delta Species are separate printings with separate prices, so choose
            the result that matches your card.
          </p>
        </div>

        <div>
          <h3 className={h2}>2. Search the way it&apos;s printed</h3>
          <p className={p}>
            Type the card name, then add the collector number or set name to narrow it down: &ldquo;Charizard
            4/102&rdquo;, &ldquo;Umbreon VMAX 215/203&rdquo; or &ldquo;Pikachu Promo&rdquo;. A Pokemon&apos;s name on
            its own lists every printing we have for it. The results show matching live deals first, then the
            full card reference list.
          </p>
        </div>

        <div>
          <h3 className={h2}>3. Read the market price correctly</h3>
          <p className={p}>
            The headline figure is a <strong>market reference for a raw (ungraded), Near Mint copy</strong>, taken
            from recent sold data via PokemonPriceTracker. It&apos;s a guide to what copies have been selling for,
            not an offer to buy your card. Live eBay prices we show are asking prices, which is why each card page
            keeps the two apart.{" "}
            <Link href="/methodology" className={a}>
              How we work out prices
            </Link>
          </p>
        </div>

        <div>
          <h3 className={h2}>4. Adjust for condition and grading</h3>
          <p className={p}>
            Whitening, scratches, creases and off-centre printing all lower what a raw card sells for, so a played
            copy is worth less than the Near Mint figure. Professionally graded cards (PSA, CGC, BGS) sell by
            grade, and card pages list graded prices separately wherever real sales exist.{" "}
            <Link href="/guides/card-condition-grading" className={a}>
              Condition &amp; grading explained
            </Link>{" "}
            ·{" "}
            <Link href="/guides/raw-vs-graded-pokemon-cards" className={a}>
              Raw vs graded
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-10">
        <h3 className={h2}>Popular price lookups</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {POPULAR_LOOKUPS.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/cards/${c.slug}`}
                className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:text-red-500"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className={`${p} mt-4`}>
          Not sure of the name? Browse{" "}
          <Link href="/pokemon" className={a}>
            cards by Pokemon
          </Link>{" "}
          or{" "}
          <Link href="/sets" className={a}>
            cards by set
          </Link>
          . Looking to buy rather than price a card? See{" "}
          <Link href="/deals" className={a}>
            today&apos;s below-market deals
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

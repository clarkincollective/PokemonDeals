import { supabase } from "@/lib/supabaseClient";

// Re-fetch from Supabase at most once per minute instead of only at build
// time, so new prices show up without a full redeploy.
export const revalidate = 60;

// A Server Component: this code runs on the server before the page is sent
// to the browser, so it can talk to Supabase directly and just hand back
// finished HTML.
export default async function Home() {
  const { data: cards, error } = await supabase
    .from("cards")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Pokémon Card Deals
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Latest prices pulled from JustTCG.
        </p>

        {error && (
          <p className="mt-8 rounded-lg bg-red-50 p-4 text-red-700">
            Couldn&apos;t load cards: {error.message}
          </p>
        )}

        {!error && cards?.length === 0 && (
          <p className="mt-8 text-zinc-500">
            No cards yet. Run the fetch script to add some.
          </p>
        )}

        <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
          {cards?.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between gap-4 py-4"
            >
              <div>
                <p className="font-medium text-black dark:text-zinc-50">
                  {card.name}
                </p>
                <p className="text-sm text-zinc-500">
                  {card.set} &middot; {card.condition}
                </p>
              </div>
              <p className="text-lg font-semibold text-black dark:text-zinc-50">
                ${Number(card.market_price).toFixed(2)}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

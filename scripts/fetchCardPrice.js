// Run this with:  node scripts/fetchCardPrice.js "Charizard" "base-set-shadowless-pokemon"
//
// Arg 1 = card name to search for (required)
// Arg 2 = JustTCG "set" slug to narrow the search (optional but recommended)
//
// It looks the card up on JustTCG, then saves (or updates) a row in your
// Supabase "cards" table with the price it found.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const JUSTTCG_API_KEY = process.env.JUSTTCG_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!JUSTTCG_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing one of JUSTTCG_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

// The "service role" key can write to the database and ignores the
// read-only rule we set up, so this client must only ever run on your
// computer/server - never in a browser.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchCardFromJustTCG(cardName, setSlug) {
  const url = new URL("https://api.justtcg.com/v1/cards");
  url.searchParams.set("q", cardName);
  url.searchParams.set("game", "pokemon");
  if (setSlug) url.searchParams.set("set", setSlug);

  const response = await fetch(url, {
    headers: { "x-api-key": JUSTTCG_API_KEY },
  });

  if (!response.ok) {
    throw new Error(`JustTCG request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const card = body.data?.[0];
  if (!card) throw new Error(`No JustTCG results for "${cardName}"`);

  // Prefer a "Near Mint" variant if there is one, otherwise just take the first.
  const variant =
    card.variants.find((v) => v.condition === "Near Mint") ?? card.variants[0];
  if (!variant) throw new Error(`"${card.name}" has no price variants`);

  return {
    name: card.name,
    set: card.set_name ?? card.set ?? null,
    condition: variant.condition ?? null,
    market_price: variant.price ?? null,
  };
}

async function saveCard(card) {
  const { error } = await supabaseAdmin.from("cards").upsert(
    {
      name: card.name,
      set: card.set,
      condition: card.condition,
      market_price: card.market_price,
      source: "JustTCG",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "name,set,condition,source" }
  );

  if (error) throw error;
}

async function main() {
  const [cardName, setSlug] = process.argv.slice(2);
  if (!cardName) {
    console.error('Usage: node scripts/fetchCardPrice.js "Card Name" [set-slug]');
    process.exit(1);
  }

  console.log(`Looking up "${cardName}" on JustTCG...`);
  const card = await fetchCardFromJustTCG(cardName, setSlug);

  console.log(`Found: ${card.name} (${card.set}, ${card.condition}) - $${card.market_price}`);
  await saveCard(card);

  console.log("Saved to Supabase.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

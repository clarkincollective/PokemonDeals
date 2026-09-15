// SOCIAL-LIVE-3 - DAILY AUTOPILOT story bank.
//
// Two distinct stories a day, each adapted to Instagram, X, TikTok and
// YouTube Shorts. Sources, all evidence-backed:
//   guide      - the site's published guides + their VERIFIED catalogue card
//                identities (lib/guideLinks.mjs). No prices.
//   checklist  - the 16 reviewed set-checklist pages + the set's 3 highest
//                Near Mint market references (dated).
//   set        - a real expansion's 3 highest Near Mint market references.
//   species    - one Pokemon's 3 highest Near Mint single-card references.
// Market references are labelled as such, dated, English, Near Mint, and
// never specialty products (jumbo / World Championship deck) or promo /
// league / prize-pack bins. Nothing here calls a market reference a sale.

import { GUIDE_CARDS } from "../../guideLinks.js";
import { CHECKLIST_SETS } from "../../setChecklist.js";
import { slugifySet } from "../../slugify.js";
import { isSpecialtyCard } from "../../catalogueView.js";

export const AUTOPILOT_VERSION = "live3.1";
export const AUTOPILOT_SERIES = Object.freeze({ guide: "AUTOPILOT_GUIDE", checklist: "AUTOPILOT_CHECKLIST", set: "AUTOPILOT_SET", species: "AUTOPILOT_SPECIES" });
// a story key is not reused inside this window. SOCIAL-LIVE-4: 90 -> 30 days.
// Two stories a day need 60 keys per cooldown; with 90 days the 61-key bank
// ran dry after ~30 days and stayed empty until day 90. A repeat after 30
// days carries that day's dated references (the 21-day card cooldown still
// keeps the same card off the feed).
export const STORY_COOLDOWN_DAYS = 30;

const g = (c, detail) => ({ id: c.tcgplayerId, name: c.name, set: c.set, number: c.cardNumber, detail: detail ?? `${c.set} · ${c.cardNumber}` });

export const GUIDE_STORIES = Object.freeze([
  {
    key: "guide:two-numbers",
    eyebrow: "Collector tip",
    headline: "Two numbers on one card. Only one is the collector number.",
    sub: "The Generations Charmander shows both at once.",
    layout: "tip",
    cards: [g(GUIDE_CARDS.charmanderGenerations, "Generations: Radiant Collection · RC3/RC32")],
    points: [
      { title: "NO. 004", text: "In the bar under the artwork: Charmander's National Pokedex number." },
      { title: "RC3/RC32", text: "At the bottom edge: the collector number for this card." },
    ],
    note: "A number sitting with the height and weight is the Pokedex number.",
    href: "/guides/how-to-find-pokemon-card-set-and-number",
    hashtags: ["#pokemontcg", "#pokemoncards", "#cardcollecting"],
  },
  {
    key: "guide:umbreon-three-cards",
    eyebrow: "Collector tip",
    headline: "Same Pokemon, same set: three different cards.",
    sub: "Umbreon VMAX from Evolving Skies exists as 095/203, 214/203 and 215/203.",
    layout: "row",
    cards: [
      g(GUIDE_CARDS.umbreonVmax, "Evolving Skies · 095/203"),
      g(GUIDE_CARDS.umbreonVmaxSecret, "Evolving Skies · 214/203"),
      g(GUIDE_CARDS.umbreonVmaxAltArt, "Evolving Skies · 215/203"),
    ],
    labels: ["Umbreon VMAX", "Umbreon VMAX (Secret)", "Umbreon VMAX (Alt Art Secret)"],
    note: "215/203 looks wrong, but a number above the printed total is a real collector number.",
    href: "/guides/how-to-find-pokemon-card-set-and-number",
    hashtags: ["#pokemontcg", "#evolvingskies", "#umbreon"],
  },
  {
    key: "guide:charizard-same-name",
    eyebrow: "Collector tip",
    headline: "Three Charizards. The name alone can't tell them apart.",
    sub: "The number and set can.",
    layout: "row",
    cards: [
      g(GUIDE_CARDS.charizardBaseSet, "Base Set · 004/102"),
      g(GUIDE_CARDS.charizardBaseSet2, "Base Set 2 · 004/130"),
      g(GUIDE_CARDS.charizardEvolutions, "XY Evolutions · 11/108"),
    ],
    labels: ["Charizard", "Charizard", "Charizard"],
    note: "Same Pokemon, three different cards, each with its own price.",
    href: "/guides/how-to-find-pokemon-card-set-and-number",
    hashtags: ["#pokemontcg", "#charizard", "#vintagepokemon"],
  },
  {
    key: "guide:condition-check",
    eyebrow: "Before you buy",
    headline: "Check a raw card's condition in four steps.",
    sub: "The same areas a grader looks at.",
    layout: "tip",
    cards: [g(GUIDE_CARDS.pikachuVFullArt, "Vivid Voltage · 170/185")],
    points: [
      { title: "Centering", text: "Compare the border on all four sides, front and back." },
      { title: "Corners", text: "Each corner under a loupe. One frayed tip matters." },
      { title: "Edges", text: "The whole perimeter, for whitening, nicks or rough patches." },
      { title: "Surface", text: "Tilt it under the light for scratches, print lines and dents." },
    ],
    note: "Judge by the worst thing you saw, not the average.",
    href: "/guides/how-to-check-pokemon-card-condition",
    hashtags: ["#pokemontcg", "#pokemoncards", "#cardgrading"],
  },
  {
    key: "guide:raw-vs-graded",
    eyebrow: "Raw vs graded",
    headline: "Why a graded copy of the same card costs more.",
    sub: "Raw and graded are effectively two products with two prices.",
    layout: "tip",
    cards: [g(GUIDE_CARDS.charizardShadowless, "Base Set (Shadowless) · 004/102")],
    points: [
      { title: "Authentication", text: "The grader confirmed the card is genuine and unaltered." },
      { title: "An agreed condition", text: "\"Near Mint\" is subjective. A fixed grade is not." },
      { title: "Scarcity at the top", text: "Only a fraction of copies grade a perfect 10." },
    ],
    note: "There is no fixed multiplier: check real prices for that exact card and grade.",
    href: "/guides/raw-vs-graded-pokemon-cards",
    hashtags: ["#pokemontcg", "#psa", "#cardgrading"],
  },
]);

// real expansions with deep Near Mint coverage (promo / league / prize-pack
// / miscellaneous / jumbo bins deliberately excluded)
export const SPOTLIGHT_SETS = Object.freeze([
  "SWSH07: Evolving Skies", "SV: Prismatic Evolutions", "SV: Scarlet & Violet 151", "SM - Team Up",
  "SM - Cosmic Eclipse", "Skyridge", "Aquapolis", "Expedition", "EX Unseen Forces", "EX Delta Species",
  "SM - Unbroken Bonds", "SM - Unified Minds", "Hidden Fates: Shiny Vault", "Legendary Collection",
  "HeartGold SoulSilver", "Call of Legends", "EX Dragon Frontiers", "SV: Black Bolt", "SM - Lost Thunder", "Gym Challenge",
  // SOCIAL-LIVE-4 - catalogue-checked 15 Sep 2026: 60-93 eligible Near Mint
  // printings each, not a checklist set (the builder still re-checks live)
  "EX Team Rocket Returns", "EX Holon Phantoms", "EX FireRed & LeafGreen", "EX Crystal Guardians", "EX Dragon",
  "EX Team Magma vs Team Aqua", "Supreme Victors", "SV: Paldean Fates", "SWSH06: Chilling Reign", "SM - Burning Shadows",
]);
export const SPOTLIGHT_SPECIES = Object.freeze([
  "Pikachu", "Eevee", "Umbreon", "Gengar", "Mewtwo", "Mew", "Rayquaza", "Lugia", "Blastoise", "Venusaur",
  "Gardevoir", "Lucario", "Greninja", "Snorlax", "Dragonite", "Sylveon", "Espeon", "Mimikyu", "Tyranitar", "Gyarados",
  // SOCIAL-LIVE-4 - catalogue-checked 15 Sep 2026: 21-61 eligible Near Mint printings each
  "Charizard", "Ninetales", "Leafeon", "Glaceon", "Flareon", "Vaporeon", "Jolteon", "Giratina", "Suicune", "Ho-Oh",
]);
const EXCLUDED_SET_RX = /promo|league|championship|prize pack|miscellaneous|jumbo|deck exclusive|trainer kit|mcdonald|world champ/i;

export function catalogueEligible(r) {
  return /^\d+$/.test(String(r?.tcgplayer_id ?? "").trim())
    && Number(r.market_price) > 0
    && String(r.market_condition ?? "").trim() === "Near Mint"
    && (!r.language || /^en(glish)?$/i.test(String(r.language)))
    && Boolean(r.image_url)
    && !isSpecialtyCard({ set: r.set, name: r.name })
    && !EXCLUDED_SET_RX.test(String(r.set ?? ""));
}

// pure: top N distinct printings by market reference
// an edition-specific reference on a multi-edition WOTC product: the
// catalogue image may show the other edition, so its price is not shown
export const editionAmbiguous = (r) => /unlimited|1st edition|first edition/i.test(String(r?.market_printing ?? ""));

export function topByMarket(rows = [], n = 3, { excludeIds = new Set(), allowAmbiguous = false } = {}) {
  const seen = new Set(excludeIds);
  const out = [];
  for (const r of rows.filter((x) => catalogueEligible(x) && (allowAmbiguous || !editionAmbiguous(x))).sort((a, b) => Number(b.market_price) - Number(a.market_price))) {
    const id = String(r.tcgplayer_id).trim();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

const shortSet = (s) => String(s).replace(/^(SWSH\d+|SV\d*|SM|XY)\s*[:-]\s*/i, "").replace(/^SV:\s*/i, "");
const rowCard = (r) => ({ id: String(r.tcgplayer_id).trim(), name: r.name, set: r.set, number: r.card_number ?? null, detail: `${shortSet(r.set)}${r.card_number ? ` · ${r.card_number}` : ""}`, market_usd: Number(r.market_price) });

export function buildCatalogueStory(kind, subject, rows, { asOf, excludeIds = new Set() }) {
  // SOCIAL-LIVE-3: a "three highest" claim must be the TRUE top three - a
  // recently featured card is never silently swapped for the next one down;
  // the story waits instead.
  const trueTop = topByMarket(rows, 3);
  if (kind !== "checklist" && trueTop.some((r) => excludeIds.has(String(r.tcgplayer_id).trim()))) {
    return { ok: false, reason: `a top-3 card for ${subject} was featured recently - story deferred` };
  }
  let top = kind === "checklist" ? topByMarket(rows, 3, { excludeIds }) : trueTop;
  let priced = true;
  // a checklist can still be demonstrated without prices when the set's
  // references are edition-specific (WOTC 1st Edition / Unlimited)
  if (kind === "checklist" && top.length === 3 && top.some((r, i) => String(r.tcgplayer_id) !== String(trueTop[i]?.tcgplayer_id))) { top = topByMarket(rows, 3, { excludeIds, allowAmbiguous: true }); priced = false; }
  if (top.length < 3 && kind === "checklist") { top = topByMarket(rows, 3, { excludeIds, allowAmbiguous: true }); priced = false; }
  if (top.length < 3) return { ok: false, reason: `only ${top.length} eligible Near Mint printings for ${subject}` };
  const cards = top.map(rowCard).map((c) => (priced ? c : { ...c, market_usd: null }));
  const date = new Date(asOf).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" });
  const base = { kind, subject, key: `${kind}:${subject}`, layout: "row", cards, labels: cards.map((c) => c.name), as_of: new Date(asOf).toISOString(), date_label: date };
  if (kind === "checklist" && !priced) {
    return { ok: true, story: { ...base, eyebrow: "Set checklist", headline: `Collecting ${subject}? Tick off every card as you go.`, sub: `The free checklist tracks what you own, card by card. Three cards from the set:`, note: `Each card page shows its own market reference.`, href: `/sets/${slugifySet(subject)}`, hashtags: ["#pokemontcg", "#vintagepokemon", "#cardcollecting"] } };
  }
  if (kind === "checklist") {
    return { ok: true, story: { ...base, eyebrow: "Set checklist", headline: `Collecting ${subject}? Tick off every card as you go.`, sub: `The free checklist tracks what you own. The set's three highest Near Mint market references right now:`, note: `Near Mint market references, ${date}. Not a guaranteed sale price.`, href: `/sets/${slugifySet(subject)}`, hashtags: ["#pokemontcg", "#vintagepokemon", "#cardcollecting"] } };
  }
  if (kind === "set") {
    return { ok: true, story: { ...base, eyebrow: "Set spotlight", headline: `${shortSet(subject)}: the three highest market references.`, sub: `Near Mint singles, as of ${date}.`, note: `Market references move. Each card page shows the latest.`, href: `/sets/${slugifySet(subject)}`, hashtags: ["#pokemontcg", "#pokemoncards", "#cardcollecting"] } };
  }
  if (kind === "species") {
    return { ok: true, story: { ...base, eyebrow: `${subject} spotlight`, headline: `The three highest-referenced ${subject} cards right now.`, sub: `Near Mint singles, as of ${date}.`, note: `Market references move. Each card page shows the latest.`, href: `/pokemon/${slugifySet(subject)}`, hashtags: ["#pokemontcg", `#${subject.toLowerCase()}`, "#pokemoncards"] } };
  }
  return { ok: false, reason: `unknown kind ${kind}` };
}

// The rotation: slot A alternates catalogue kinds, slot B prefers guides.
// `used` = Set of story keys inside the cooldown window.
export function candidateQueue({ used = new Set(), dayIndex = 0 } = {}) {
  const rot = (arr, k) => arr.map((_, i) => arr[(i + k) % arr.length]);
  const guides = GUIDE_STORIES.filter((s) => !used.has(s.key)).map((s) => ({ kind: "guide", key: s.key, subject: s.key }));
  const checklists = rot(CHECKLIST_SETS, dayIndex % CHECKLIST_SETS.length).filter((s) => !used.has(`checklist:${s}`)).map((s) => ({ kind: "checklist", key: `checklist:${s}`, subject: s }));
  const sets = rot(SPOTLIGHT_SETS, dayIndex % SPOTLIGHT_SETS.length).filter((s) => !used.has(`set:${s}`)).map((s) => ({ kind: "set", key: `set:${s}`, subject: s }));
  const species = rot(SPOTLIGHT_SPECIES, dayIndex % SPOTLIGHT_SPECIES.length).filter((s) => !used.has(`species:${s}`)).map((s) => ({ kind: "species", key: `species:${s}`, subject: s }));
  // interleave so consecutive stories differ in kind
  const lanes = [checklists, guides, sets, species];
  const out = [];
  for (let i = 0; out.length < lanes.reduce((n, l) => n + l.length, 0); i++) {
    for (const l of lanes) if (l[i]) out.push(l[i]);
    if (i > 200) break;
  }
  return out;
}

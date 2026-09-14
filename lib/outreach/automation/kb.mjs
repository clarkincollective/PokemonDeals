// OUTREACH-AUTO-1 - the VERIFIED knowledge base automated replies may use.
// Every link and fact here was checked against the live site (2026-09-14).
// A generated reply may only contain URLs from VERIFIED_LINKS and may only
// state figures that appear in VERIFIED_FACTS (or were written by the
// correspondent). Anything else escalates to the owner.

export const SITE = "https://pokemondealfinder.com";

export const VERIFIED_LINKS = Object.freeze({
  home: `${SITE}/`,
  sets: `${SITE}/sets`,
  checklistExample: `${SITE}/sets/base-set-2`,
  cardIdGuide: `${SITE}/guides/how-to-find-pokemon-card-set-and-number`,
  conditionGuide: `${SITE}/guides/how-to-check-pokemon-card-condition`,
  pricesGuide: `${SITE}/guides/how-pokemon-card-prices-work`,
  referencePriceStudy: `${SITE}/market-data/pokemon-reference-price-changes`,
  valueDistribution: `${SITE}/market-data/pokemon-card-value-distribution`,
  methodology: `${SITE}/methodology`,
  priceChecker: `${SITE}/search`,
});

// Plain statements the responder may repeat. Numbers are exactly as published.
export const VERIFIED_FACTS = Object.freeze([
  "PokemonDealFinder is a free site run by James. It compares live eBay Pokemon card listings with market references and shows the ones that appear to be priced below market.",
  "Set pages include a collection checklist: tick cards you own, print what's missing, or open a card for its price. Progress is saved on the visitor's device only (no account).",
  "Checklist market references are for one raw (ungraded) Near Mint copy; they are individual card references, not a value for the complete set.",
  "The card-identification guide explains where the collector number is printed, how to read it (4/102 = number 4 of a printed total of 102), Pokedex numbers versus collector numbers, numbers above the printed total (Umbreon VMAX 215/203 is a real collector number) and zero-padding. The number helps identify the card, not which printing you have.",
  "Reference-price study (a 30-day sample): between 12 August 2026 and 11 September 2026 the median of 150 sampled product records moved +1.7%.",
  "The +1.7% is a median of medians (middle value of each product's condition and printing variants, then the middle across 150 products). It is not total market growth, not an average portfolio return and not a forecast.",
  "The 150 product records hold 1,147 measurable variants; by variant the median was +1.4%, and 22.1% of variants fell more than 1% against 4.7% of product records.",
  "The study's data are reference-price observations (a provider estimate of a variant's market price, market data provided by JustTCG), not records of individual completed sales.",
  "The sample is not random: 24 pilot records were deliberately selected, then 126 more by seeded deterministic shuffle (seed 20260912), 50 per era group (Modern, EX-era, WOTC-era). Groups are equal by design, so the figure describes the sample, not the hobby. Eras outside those three are absent.",
  "The currency of the provider's historical values is an inference (the provider documents US dollars for its current price field).",
  "Links on PokemonDealFinder to eBay may be affiliate links; the site is free to use.",
]);

// The assets a first-contact message may be built around.
export const ASSETS = Object.freeze({
  checklists: { label: "free set collection checklists", url: VERIFIED_LINKS.checklistExample, index: VERIFIED_LINKS.sets, exact: "Every set page on PokemonDealFinder has a free collection checklist: tick the cards you own, print what's missing, and open any card for its raw Near Mint market reference; no account, progress stays on the collector's device. Base Set 2 is one example." },
  cardIdGuide: { label: "guide to finding a card's set and collector number", url: VERIFIED_LINKS.cardIdGuide, exact: "The guide explains where the collector number is printed and how to read it, Pokedex numbers versus collector numbers, numbers above the printed total and zero-padding; the number identifies the card, not which printing you have." },
  referencePriceStudy: { label: "dated 30-day reference-price study", url: VERIFIED_LINKS.referencePriceStudy, exact: "Between 12 August 2026 and 11 September 2026 the median of 150 sampled product records moved +1.7%; the data are reference-price observations, not completed sales, and the sample is not random, so it describes the sample, not the hobby." },
});

export const ALLOWED_URL_PREFIXES = Object.freeze([SITE]);

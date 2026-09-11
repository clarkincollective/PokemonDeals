// Phase 17C.8 - the Latest Releases hub's model. Pure: no I/O, no React,
// relative imports only, so `node --test` runs it directly.
//
// Everything here is derived from the officially sourced release records
// (lib/pokemonSets OFFICIAL_RELEASES) and the listing-evidence rules
// (lib/dealQuality). The hub NEVER ranks by discount and never claims
// savings: it shows what is out (or coming), and which listings are
// eligible to show at all.

import {
  OFFICIAL_RELEASES,
  officialReleaseForSet,
  expansionReleaseStatus,
  expansionReleaseDateText,
  releaseDayOf,
} from "./pokemonSets.js";

// How many released expansions the hub covers. Small on purpose: this is
// "what just came out", not a second /sets index.
export const LATEST_RELEASED_COUNT = 4;

// Every upcoming expansion, then the most recent released ones - newest
// first within each group. `status` is "upcoming" | "released".
// `releases` is injectable so a clock advance, or a newly added official
// release, can be exercised without touching the real record list.
export function latestReleaseLineup(clock, { releasedCount = LATEST_RELEASED_COUNT, releases = OFFICIAL_RELEASES } = {}) {
  const day = releaseDayOf(clock);
  const entry = (r) => ({
    set: r.set,
    officialName: r.officialName,
    released: r.released,
    releaseDateText: expansionReleaseDateText(r, clock),
    series: r.series,
    status: expansionReleaseStatus(r.set, clock),
    sources: r.sources,
  });
  const byDateDesc = (a, b) => b.released.localeCompare(a.released);
  const upcoming = releases.filter((r) => r.released > day).map(entry).sort(byDateDesc);
  const released = releases.filter((r) => r.released <= day).map(entry).sort(byDateDesc).slice(0, releasedCount);
  return { upcoming, released, sets: [...upcoming, ...released].map((e) => e.set) };
}

// The one expansion the hub leads with: the soonest upcoming release, or
// the most recent one if nothing is upcoming. Never invented - it is an
// OFFICIAL_RELEASES record with its own sources.
export function featuredRelease(clock, opts) {
  const { upcoming, released } = latestReleaseLineup(clock, opts);
  return upcoming.length ? upcoming[upcoming.length - 1] : (released[0] ?? null);
}

// A short, honest line for the featured set. Before release it states the
// date and scopes the confirmation promise to the listings it actually
// applies to: while a set is unreleased, EVERY listing for it predates
// release, so each one needs eBay's own confirmation to appear (17C.7).
// Once released, later listings are judged by the normal gates, so no
// confirmation promise is made. Neither line implies availability.
export function featuredReleaseLine(entry) {
  if (!entry) return null;
  return entry.status === "upcoming"
    ? `Releases ${entry.releaseDateText} · until then, a listing for it appears here only once eBay confirms that listing is active`
    : `Released ${entry.releaseDateText}`;
}

// Which listing groups the hub renders, in order. `emptyHref`/`emptyLabel`
// give a real catalogue destination when a group has nothing eligible.
export const HUB_SECTIONS = Object.freeze([
  {
    key: "singles",
    analyticsSection: "latest_singles",
    title: "Single cards",
    emptyLabel: "Browse the set checklists",
    emptyHref: "/sets",
    empty: "No eligible single-card listings from these sets right now.",
  },
  {
    key: "sealed",
    analyticsSection: "latest_sealed",
    title: "Sealed product",
    emptyLabel: "Browse sealed product",
    emptyHref: "/sealed-deals",
    empty: "No eligible sealed listings from these sets right now.",
  },
  {
    key: "graded",
    analyticsSection: "latest_graded",
    title: "Graded cards",
    emptyLabel: "Browse graded deals",
    emptyHref: "/deals/graded",
    empty: "No eligible graded listings from these sets right now.",
  },
]);

// The hub's standing caveat. The catalogue is never claimed to be complete
// and a listing shown here is not a savings claim.
export const COVERAGE_NOTE =
  "These are the listings we can currently show for these sets - not every card, product or listing that exists. Where a listing has no verified market reference for that exact product and condition, it is shown plainly, with no savings claim.";

// A set name -> its /sets page, but only when that page really exists
// (validSetSlugs comes from fetchSetSlugs). Never invents a set route, and
// never a new page of our own: the hub always links to the existing one.
export function setHref(setName, validSetSlugs, slugify) {
  const slug = slugify(setName);
  return slug && validSetSlugs?.includes(slug) ? `/sets/${slug}` : null;
}

// Does this listing belong to one of the lineup's sets? (Used to keep the
// sealed catalogue groups in step with the lineup.)
export function inLineup(setName, lineupSets) {
  return Boolean(setName) && lineupSets.includes(setName);
}

// A release record for a catalogue set, or null - re-exported so the route
// doesn't need two imports.
export function releaseForSet(setName) {
  return officialReleaseForSet(setName);
}

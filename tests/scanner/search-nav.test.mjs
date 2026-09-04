// Phase 13B.5.3 - /search interpretation-panel link + copy helpers.
//
// The invariants:
//   * a link that DROPS the set constraint (species-only) must be
//     LABELLED as broadening ("... — every set"), never as if it kept
//     the intersection.
//   * a link that drops the species constraint (set-only) must read as
//     set-wide.
//   * permanent-route links (/pokemon, /sets, /cards) carry only the
//     normalised structured filters, NEVER the raw query text.
//   * species_set and species_set_no_match get distinct truthful copy.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  speciesDealsHref,
  exactCardHref,
  setDealsHref,
  intersectionCopy,
} from "../../lib/searchNav.js";

const interp = (over = {}) => ({
  species: "Umbreon",
  species_slug: "umbreon",
  set: "SWSH07: Evolving Skies",
  set_slug: "swsh07-evolving-skies",
  card_name: "umbreon",
  format: "any",
  ...over,
});

// ===== href builders ============================================

test("speciesDealsHref -> /pokemon/<slug>, carries pokemon_link_query, never q", () => {
  const href = speciesDealsHref(interp(), {
    pokemon_link_query: { type: "graded", grader: "PSA", grade: "10" },
  });
  assert.equal(href, "/pokemon/umbreon?type=graded&grader=PSA&grade=10");
  assert.ok(!href.includes("q="));
  assert.ok(!/umbreon\?.*evolving/i.test(href), "raw query text must not leak into the path");
});

test("speciesDealsHref with no facets -> bare /pokemon/<slug>", () => {
  assert.equal(speciesDealsHref(interp(), { pokemon_link_query: {} }), "/pokemon/umbreon");
  assert.equal(speciesDealsHref(interp(), {}), "/pokemon/umbreon");
});

test("speciesDealsHref falls back to interpreted modifiers when no pokemon_link_query", () => {
  const href = speciesDealsHref(interp({ format: "graded", grader: "PSA", grade: "10" }), null);
  assert.equal(href, "/pokemon/umbreon?type=graded&grader=PSA&grade=10");
});

test("speciesDealsHref -> null without a species slug", () => {
  assert.equal(speciesDealsHref({ species: "Umbreon" }, {}), null);
});

test("setDealsHref -> resolution.set_link + filter_query, never q", () => {
  const href = setDealsHref({
    set_link: "/sets/swsh07-evolving-skies",
    filter_query: { type: "graded", grader: "PSA", grade: "10" },
  });
  assert.equal(href, "/sets/swsh07-evolving-skies?type=graded&grader=PSA&grade=10");
  assert.ok(!href.includes("q="));
});

test("setDealsHref -> null when the route did not confirm a set page", () => {
  assert.equal(setDealsHref({ filter_query: { type: "graded" } }), null);
  assert.equal(setDealsHref({}), null);
});

test("exactCardHref -> /cards/<slug> + filter_query, never q", () => {
  const href = exactCardHref(
    { card_slug: "charizard-base-set" },
    { filter_query: { type: "graded", grader: "PSA", grade: "10" } }
  );
  assert.equal(href, "/cards/charizard-base-set?type=graded&grader=PSA&grade=10");
  assert.ok(!href.includes("q="));
});

// ===== intersection copy =======================================

test("species_set: headline names BOTH constraints; broadening labels name what is dropped", () => {
  const c = intersectionCopy({ mode: "species_set", species: "Umbreon", set: "SWSH07: Evolving Skies" });
  assert.equal(c.isSpeciesSet, true);
  assert.equal(c.isNoMatch, false);
  assert.equal(c.hasSetConstraint, true);
  assert.match(c.headline, /Umbreon/);
  assert.match(c.headline, /Evolving Skies/);
  // species-only link must announce the broadening
  assert.match(c.broadenSpeciesLabel, /every set/i);
  assert.match(c.broadenSpeciesLabel, /Umbreon/);
  // set-only link must read set-wide
  assert.match(c.broadenSetLabel, /whole .*Evolving Skies set/i);
  assert.match(c.dropSetLabel, /drop the set/i);
});

test("species_set_no_match: a truthful 'no such card in the set' line, not 'no deals'", () => {
  const c = intersectionCopy({ mode: "species_set_no_match", species: "Umbreon", set: "Team Rocket" });
  assert.equal(c.isNoMatch, true);
  assert.equal(c.isSpeciesSet, false);
  assert.match(c.noMatchLine, /no Umbreon card in Team Rocket/i);
  assert.ok(!/deal/i.test(c.noMatchLine), "no-match copy must not be phrased as a deals problem");
  assert.match(c.broadenSpeciesLabel, /every set/i);
  assert.match(c.broadenSetLabel, /Team Rocket/);
});

test("plain species (no set): label is NOT the broadened form", () => {
  const c = intersectionCopy({ mode: "species", species: "Umbreon", set: null });
  assert.equal(c.hasSetConstraint, false);
  assert.equal(c.headline, null);
  assert.equal(c.noMatchLine, null);
  assert.match(c.broadenSpeciesLabel, /View all matching Umbreon deals/);
  assert.ok(!/every set/i.test(c.broadenSpeciesLabel));
  assert.equal(c.broadenSetLabel, null);
});

test("pure set (no species): only the set label, plain form", () => {
  const c = intersectionCopy({ mode: "set", species: null, set: "Base Set" });
  assert.equal(c.hasSetConstraint, false);
  assert.equal(c.headline, null);
  assert.equal(c.broadenSpeciesLabel, null);
  assert.equal(c.broadenSetLabel, "Browse Base Set deals →");
});

test("exact_card: no intersection headline, no forced broadening copy", () => {
  const c = intersectionCopy({ mode: "exact_card", species: "Charizard", set: "Base Set" });
  assert.equal(c.isSpeciesSet, false);
  assert.equal(c.isNoMatch, false);
  assert.equal(c.hasSetConstraint, false);
  assert.equal(c.headline, null);
  assert.equal(c.noMatchLine, null);
});

test("no raw query text is ever part of a permanent-route href", () => {
  const rawish = { species_slug: "umbreon", card_name: "evolving skies umbreon" };
  for (const href of [
    speciesDealsHref(rawish, { pokemon_link_query: { type: "graded" } }),
    setDealsHref({ set_link: "/sets/swsh07-evolving-skies", filter_query: { type: "graded" } }),
    exactCardHref({ card_slug: "umbreon-vmax-swsh07-evolving-skies" }, { filter_query: {} }),
  ]) {
    assert.ok(href && !href.includes("q="), href);
    assert.ok(!/evolving%20skies|evolving\+skies|evolving skies/i.test(href), href);
  }
});

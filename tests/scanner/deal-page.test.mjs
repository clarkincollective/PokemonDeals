// SEO-2 - pure /deals/[id] page rules (lib/dealPage.js): the title
// ladder that keeps the deal hook ahead of the set context, and the
// expired-listing lifecycle decision (redirect to the same card's
// permanent page / 404 / keep the honest "ended" state).

import { test } from "node:test";
import assert from "node:assert/strict";
import { dealPageTitle, dealCatalogSlugCandidate, expiredDealDestination } from "../../lib/dealPage.js";

test("dealPageTitle: short name + set keeps set AND discount", () => {
  assert.equal(
    dealPageTitle({ cardName: "Slowpoke", cardSet: "SV: Paldean Fates", discountPct: 25 }),
    "Slowpoke (SV: Paldean Fates) - 25% below market"
  );
});

test("dealPageTitle: a long set name no longer drops the discount phrase", () => {
  // production before SEO-2: "Charizard (Generations: Radiant Collection)"
  // - indistinguishable from the permanent card page's intent
  const t = dealPageTitle({ cardName: "Charizard", cardSet: "Generations: Radiant Collection", discountPct: 21 });
  assert.equal(t, "Charizard (Generations: Radiant Collection) - 21% below market");
  // longer still: the SET is what gets dropped, the discount survives
  const t2 = dealPageTitle({
    cardName: "Reshiram & Charizard GX - 2019 (Henry Brand)",
    cardSet: "World Championship Decks",
    discountPct: 30,
  });
  assert.equal(t2, "Reshiram & Charizard GX - 2019 (Henry Brand) - 30% below market");
  assert.ok(t2.length <= 63);
});

test("dealPageTitle: whole-word fallbacks, never a mid-word clip", () => {
  const longName = "Team Galactic's Invention G-103 Power Spray - 2010 (Yuta Komatsuda)"; // 67 chars
  const t = dealPageTitle({ cardName: longName, cardSet: "World Championship Decks", discountPct: 40 });
  assert.equal(t, longName, "the whole real name is returned rather than a clipped one");
  const mid = "Buddy-Buddy Poffin (North America International Champs)"; // 55
  assert.equal(dealPageTitle({ cardName: mid, cardSet: "League & Championship Cards", discountPct: 33 }), `${mid} Deal`);
});

test("dealPageTitle: no fabricated discount - missing/zero/invalid skips the discount rungs", () => {
  assert.equal(dealPageTitle({ cardName: "Pikachu", cardSet: "Base Set", discountPct: null }), "Pikachu (Base Set)");
  assert.equal(dealPageTitle({ cardName: "Pikachu", cardSet: "Base Set", discountPct: 0 }), "Pikachu (Base Set)");
  assert.equal(dealPageTitle({ cardName: "Pikachu", cardSet: null, discountPct: NaN }), "Pikachu Deal");
  // rounding only - the caller supplies the deal's own real figure
  assert.match(dealPageTitle({ cardName: "Pikachu", cardSet: "Base Set", discountPct: 21.4 }), / - 21% below market$/);
});

test("dealCatalogSlugCandidate: same slug scheme as the card routes, English only", () => {
  assert.equal(
    dealCatalogSlugCandidate({ watchlist: { name: "Arcanine", set: "Base Set (Shadowless)", language: "english" } }),
    "arcanine-base-set-shadowless"
  );
  assert.equal(
    dealCatalogSlugCandidate({ card_name: "Houndoom (H11)", card_set: "Skyridge", card_language: "english" }),
    "houndoom-h11-skyridge"
  );
  assert.equal(dealCatalogSlugCandidate({ watchlist: { name: "Yokohama's Pikachu", set: "SM-P", language: "japanese" } }), null);
  assert.equal(dealCatalogSlugCandidate({ watchlist: { name: null, set: "Base Set" } }), null);
  assert.equal(dealCatalogSlugCandidate(null), null);
});

test("expiredDealDestination: active deal is never redirected (render), even when display-gated", () => {
  const d = expiredDealDestination({ deal: { id: 1, is_active: true }, hubSlug: "charizard-base-set", catalogSlug: "charizard-base-set" });
  assert.equal(d.action, "render");
  assert.equal(d.reason, "ACTIVE_DISPLAY_GATED");
});

test("expiredDealDestination: expired + live hub -> permanent redirect to that hub", () => {
  const d = expiredDealDestination({ deal: { id: 1, is_active: false }, hubSlug: "arcanine-base-set-shadowless", catalogSlug: "arcanine-base-set-shadowless" });
  assert.deepEqual(d, { action: "redirect", href: "/cards/arcanine-base-set-shadowless", reason: "LIVE_HUB" });
});

test("expiredDealDestination: expired + verified catalogue page -> redirect to that exact card", () => {
  const d = expiredDealDestination({ deal: { id: 1, is_active: false }, hubSlug: null, catalogSlug: "houndoom-h11-skyridge" });
  assert.deepEqual(d, { action: "redirect", href: "/cards/houndoom-h11-skyridge", reason: "CATALOGUE_CARD" });
});

test("expiredDealDestination: expired with no permanent card page -> gone (never home / index / species / set)", () => {
  const d = expiredDealDestination({ deal: { id: 1, is_active: false }, hubSlug: null, catalogSlug: null });
  assert.equal(d.action, "gone");
  assert.equal(d.href, undefined);
});

test("expiredDealDestination: no row -> gone", () => {
  assert.equal(expiredDealDestination({ deal: null }).action, "gone");
  assert.equal(expiredDealDestination({ deal: undefined, hubSlug: "x" }).action, "gone");
});

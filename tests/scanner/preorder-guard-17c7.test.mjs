// Phase 17C.7 - listings for an officially upcoming expansion stay off
// every deal / premium / promotion surface until explicit preorder
// handling exists; a listing that names one expansion but is priced as
// another product is never a deal. Fixtures are the stored rows read
// 2026-09-12 (tests/scanner/fixtures/preorder-17c7.json, no provider calls).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isDisplayableDeal,
  isPremiumDealEligible,
  isDisplayableSealedDeal,
  preReleaseListing,
  listingNamesDifferentExpansion,
  disqualificationReason,
} from "../../lib/dealQuality.js";
import { expansionReleaseLabel, upcomingExpansionForListing, expansionIdentityConflict } from "../../lib/pokemonSets.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8");
const F = JSON.parse(readFileSync(new URL("./fixtures/preorder-17c7.json", import.meta.url), "utf8"));
const row = (list, id) => structuredClone(list.find((r) => r.id === id));
const GRENINJA = row(F.cards, 36745); // AU auction, $0.71 + $25.05 ship, ends 14 Sep
const PIKACHU = row(F.cards, 36859); // "In Hand!!!" BIN $39.99
const PIKACHU_2 = row(F.cards, 36864);
const ETB_PRESALE = row(F.sealed, 253); // "... ETB pre-sale Rel. 16sept" -> 2021 Celebrations ETB
const ETB_SHIPS = row(F.sealed, 286); // "... ETB PRESALE Ships 9/18" -> 2021 Celebrations ETB

const AUDIT = "2026-09-12T12:00:00Z";
const BOUNDARY = "2026-09-16T07:00:00.000Z"; // US-first: midnight 16 Sep, Los Angeles

// run `fn` with Date mocked to `iso` (the gates read Date.now())
function at(iso, fn) {
  mock.timers.enable({ apis: ["Date"], now: new Date(iso) });
  try {
    return fn();
  } finally {
    mock.timers.reset();
  }
}
// move a stored row's freshness stamps next to the clock, so only the rule
// under test decides the outcome
const fresh = (r, iso) => ({ ...r, first_seen_at: iso, last_seen_at: iso, exact_verified_at: iso });

test("PG-1. before release: the three active 30th Celebration card listings are on no deal or premium surface", () => {
  at(AUDIT, () => {
    for (const r of [GRENINJA, PIKACHU, PIKACHU_2]) {
      const now = fresh(r, "2026-09-12T11:30:00Z");
      assert.equal(isDisplayableDeal(now), false, `${r.id}: display gate`);
      assert.equal(isPremiumDealEligible(now), false, `${r.id}: premium gate`);
      assert.deepEqual(preReleaseListing(now), {
        set: "ME: 30th Celebration",
        officialName: "30th Celebration",
        released: "2026-09-16",
        label: "Upcoming — releases 16 September",
      });
    }
  });
});

test("PG-2. release day: the same listing is judged by the normal gates again; nothing is persisted", () => {
  const before = fresh(PIKACHU, "2026-09-16T06:30:00Z");
  const on = fresh(PIKACHU, "2026-09-16T07:30:00Z");
  assert.equal(at("2026-09-16T06:59:59Z", () => isDisplayableDeal(before)), false, "one second before (US-first boundary)");
  assert.equal(at("2026-09-16T00:00:00+10:00", () => isDisplayableDeal(before)), false, "already the 16th in Sydney");
  assert.equal(at("2026-09-16T08:00:00Z", () => isDisplayableDeal(on)), true, "only the release rule held it back");
  // time-based, so it never becomes a stored disqualified_reason that
  // would outlive release day
  assert.equal(at(AUDIT, () => disqualificationReason(fresh(PIKACHU, "2026-09-12T11:30:00Z"))), null);
});

test("PG-3. presale ETBs priced against the 2021 Celebrations ETB are never sealed deals - before or after release", () => {
  for (const r of [ETB_PRESALE, ETB_SHIPS]) {
    assert.equal(r.sealed_watchlist.set, "Celebrations", "stored match is the 2021 product");
    assert.equal(listingNamesDifferentExpansion(r), true, `${r.id}: names 30th Celebration, priced as another product`);
    assert.equal(at(AUDIT, () => isDisplayableSealedDeal(r)), false, `${r.id} before release`);
    assert.equal(at("2026-10-01T00:00:00Z", () => isDisplayableSealedDeal(r)), false, `${r.id} after release: still the wrong product`);
  }
  // a genuine 2021 Celebrations ETB listing is untouched
  const legit = { ...ETB_PRESALE, title: "Pokemon Celebrations Elite Trainer Box 25th Anniversary Sealed" };
  assert.equal(at(AUDIT, () => isDisplayableSealedDeal(legit)), true);
});

test("PG-4. Classic Collection reprints: priced as the original card = mismatch; their own row is pre-release until 16 September", () => {
  const asOriginal = {
    ...fresh(PIKACHU, "2026-09-12T11:30:00Z"),
    title: "Charizard 4/102 30th Celebration Classic Collection Holo",
    card_name: "Charizard",
    card_set: "Base Set",
    watchlist: { ...PIKACHU.watchlist, name: "Charizard", set: "Base Set" },
  };
  assert.equal(listingNamesDifferentExpansion(asOriginal), true);
  assert.equal(at(AUDIT, () => isDisplayableDeal(asOriginal)), false);
  const own = { set: "ME: 30th Celebration Classic Collection", title: asOriginal.title };
  assert.equal(expansionIdentityConflict(own), null, "its own catalogue row is the right product");
  assert.equal(upcomingExpansionForListing(own, AUDIT)?.set, "ME: 30th Celebration Classic Collection");
  assert.equal(upcomingExpansionForListing(own, BOUNDARY), null);
});

test("PG-5. unrelated listings are untouched", () => {
  const cases = [
    { set: "Celebrations: Classic Collection", title: "Charizard 4/102 Celebrations Classic Collection 25th Anniversary" },
    { set: "ME05: Pitch Black", title: "Mega Darkrai ex Pitch Black" },
    { set: "SV: Scarlet & Violet Promo Cards", title: "Pikachu 30th anniversary promo stamp" },
  ];
  for (const c of cases) {
    assert.equal(expansionIdentityConflict(c), null, c.title);
    assert.equal(upcomingExpansionForListing(c, AUDIT), null, c.title);
  }
});

test("PG-6. release wording is a US-first display date, never a local-availability claim", () => {
  assert.equal(expansionReleaseLabel("ME: 30th Celebration", AUDIT), "Upcoming — releases 16 September");
  assert.equal(expansionReleaseLabel("ME: 30th Celebration Classic Collection", AUDIT), "Upcoming — releases 16 September");
  assert.equal(expansionReleaseLabel("ME: 30th Celebration", "2025-12-01"), "Upcoming — releases 16 September 2026", "year when it differs");
  assert.equal(expansionReleaseLabel("ME: 30th Celebration", BOUNDARY), null, "no label once released");
  assert.equal(expansionReleaseLabel("ME05: Pitch Black", AUDIT), null);
  const policy = src("lib/pokemonSets.js");
  assert.match(policy, /US-first display policy, NOT an official worldwide release\s+\/\/ instant/);
  for (const page of ["app/deals/[id]/page.js", "app/sealed-deals/[id]/page.js"]) {
    const s = src(page);
    assert.match(s, /preRelease\.label/, `${page}: shows the release label`);
    assert.match(s, /show pre-release or preorder listings as deals/, `${page}: explains the withheld listing`);
    assert.match(s, /no discount or delivery date is claimed here/, `${page}: no discount / delivery claim`);
    assert.doesNotMatch(s, /available (now|locally|near you)|in stock now/i);
  }
});

test("PG-7. every deal surface funnels through the gates that carry the rule", () => {
  const deals = src("lib/deals.js");
  assert.match(deals, /function sealedDisplayable\(rows\) \{\s+return \(rows \?\? \[\]\)\.filter\(\(r\) => isDisplayableSealedDeal\(r\)\)/);
  assert.doesNotMatch(deals, /isExactEbayDealDestination\(|auctionEnded\(/, "no sealed path bypasses isDisplayableSealedDeal");
  assert.match(src("app/sealed-deals/[id]/page.js"), /!isDisplayableSealedDeal\(deal\)/);
  assert.match(src("lib/social/eligibility.mjs"), /if \(!isDisplayableDeal\(row\)\) return false;/, "social posts build on the display gate");
  assert.match(src("lib/social/newsroom/marketData.mjs"), /notPreReleaseOrMismatched/, "newsroom story samples use the same rule");
  assert.match(src("lib/catalogAggregates.js"), /rows = \(rows \?\? \[\]\)\.filter\(\(row\) => !preReleaseListing\(row\)\)/, "set badges / hub counts");
});

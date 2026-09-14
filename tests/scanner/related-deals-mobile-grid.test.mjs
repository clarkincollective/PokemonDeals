// Priority fix: "More live deals right now" (components/RelatedDeals.js,
// rendered twice on app/deals/[id]/page.js - the live and expired
// branches; no other route imports it) used grid-cols-2 at the base
// (mobile) breakpoint, unlike every other DealCard grid in the app
// (DealGrid.js - which also renders /deals - app/page.js, app/best-finds/page.js -
// all grid-cols-1 below `sm`). DealCard's own layout below `sm` is a
// full-width horizontal compact card (a fixed 7.25rem image column + a
// flexible text column); halving that width squeezed identity, price,
// shipping qualifier and saving text into roughly half the space they
// need, wrapping/clipping badly and producing an unusually tall card.
//
// Separately, even at the correct one-per-row width, a sufficiently long
// converted price (a 4+ digit AUD amount) still overflowed DealCard's
// text-2xl headline price at 320px and was invisibly clipped by the
// card's own overflow-hidden (no ellipsis, no affordance) - fixed by
// letting that one span wrap (break-words) instead of shrinking the
// font or removing overflow-hidden (which the rounded artwork corners
// still need). AuctionPrice's two headline-price spans carry the same
// fix for consistency, though no fixture in this suite is large enough
// to have exercised it.
//
// This is a source/structural check - it cannot see pixels. The actual
// visual proof for this session is a CDP screenshot pass at 320/390/430
// + desktop, light/dark, against the existing provider-disabled R3
// fixture server (tests/browser/r3/runtime, scripts/buildR3NextFixture.mjs
// + runR3NextFixture.mjs), recorded in IMPLEMENTATION_STATUS.md - not
// committed here, since it needs a running Chrome + fixture server this
// automated suite does not start.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const src = (file) => readFileSync(resolve(root, file), "utf8");

test("RelatedDeals grid starts at one column, matching every other DealCard grid in the app", () => {
  const relatedDeals = src("components/RelatedDeals.js");
  assert.match(
    relatedDeals,
    /className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"/,
    "RelatedDeals must not start at grid-cols-2 - DealCard's compact layout below `sm` needs the full row"
  );
  assert.doesNotMatch(relatedDeals, /grid-cols-2 gap-4 sm:grid-cols-3/, "the old halved-width grid must be gone, not merely shadowed");

  // Every sibling DealCard grid already agrees on grid-cols-1 at the base
  // breakpoint - this pins that convention so a future grid (this one
  // included) can't silently drift from it again.
  const siblings = [
    ["components/DealGrid.js", /grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/g],
    ["app/best-finds/page.js", /grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/],
  ];
  // /deals ("All deals") renders its cards through DealGrid, pinned above.
  assert.match(src("app/deals/page.js"), /<DealGrid\s+kind="all"/, "app/deals/page.js must render its listings through DealGrid");
  for (const [file, pattern] of siblings) {
    assert.match(src(file), pattern, `${file}: expected sibling DealCard grid convention (grid-cols-1 base) not found - reconcile before trusting the RelatedDeals fix's premise`);
  }

  // Exactly one route renders RelatedDeals (twice: live + expired branch) -
  // if a second route starts using it, this fix's verification scope (only
  // /deals/[id] was screenshotted) needs revisiting.
  const dealPage = src("app/deals/[id]/page.js");
  const usages = [...dealPage.matchAll(/<RelatedDeals\b/g)];
  assert.equal(usages.length, 2, "expected exactly the live + expired RelatedDeals usages on /deals/[id] - a new call site changes this fix's verified scope");
});

test("DealCard and AuctionPrice headline prices can wrap instead of being clipped by the card's overflow-hidden", () => {
  const dealCard = src("components/DealCard.js");
  assert.match(
    dealCard,
    /className="tnum block break-words text-2xl font-bold leading-tight text-zinc-900 dark:text-zinc-50"/,
    "DealCard's BIN headline price must allow wrapping - a 4+ digit converted price at 320px overflowed the ~80px text column with no ellipsis"
  );
  const auctionPrice = src("components/AuctionPrice.js");
  const priceSpans = [...auctionPrice.matchAll(/className=\{`tnum break-words \$\{big\} text-zinc-900 dark:text-zinc-50`\}/g)];
  assert.equal(priceSpans.length, 2, "both AuctionPrice headline-price branches (the no-stored-bid fallback and the normal current-bid path) must carry the same fix");

  // The fix must be additive (a class, not a font-size/precision change) -
  // no digit or comparison text may be dropped to make room.
  assert.doesNotMatch(dealCard, /text-xl font-bold leading-tight|toFixed\(0\)|toFixed\(1\)/, "no font-size reduction or precision loss was used to work around the overflow");
});

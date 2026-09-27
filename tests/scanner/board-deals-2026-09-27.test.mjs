// BOARD DEALS (2026-09-27) - the external board's published listings shown
// on the site's own surface with the board's captured discount, after OUR
// eBay lookup confirms each one is live at the captured price.
//
//   node --test tests/scanner/board-deals-2026-09-27.test.mjs
//
// BD-1..6 are static / in-memory; BD-7 runs the real ingest route through
// the ingestion harness (stubbed eBay + board, memory db).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const feed = require("../../lib/pokeFeed.js");
const bd = require("../../lib/boardDeals.js");
const jimmy = require("../../lib/jimmyFeed.js");
const { createMemoryDb } = await import(pathToFileURL(join(REPO, "tests/harness/ingestion/memoryDb.mjs")).href);

// The board's measured markup (26 Sep 2026), two cards + a duplicate of the first.
const CARD = ({ id, host, pct, name, set, price, value, variant = "Raw", format = "BIN", market = "UK" }) => `
<div class="deal-card">
  <div class="deal-card-image">
    <img src="https://i.ebayimg.com/images/g/${id}/s-l500.jpg" alt="${name}" loading="lazy">
    <span class="discount-badge">${pct}% off</span>
    <span class="format-badge "><i class="fa-solid fa-tag"></i> ${format}</span>
  </div>
  <div class="deal-card-body">
    <span class="variant-badge raw"><i class="fa-solid fa-credit-card"></i> ${variant}</span>
    <div class="deal-card-name">${name}</div>
    <div class="deal-card-set">${set}</div>
    <div class="deal-card-prices"><span class="listing-price">£${price}</span><span class="market-price-label">£${value}</span></div>
    <div class="deal-card-footer"><span class="found-time">29m ago</span>
      <div class="deal-card-actions">
        <a href="https://pokedealfinder.uk/public/cards/aa/bb/?market=${market}&amp;dp=${price}&amp;dv=${variant}&amp;df=${format.toLowerCase()}&amp;du=${encodeURIComponent(`https://${host}/itm/${id}?_skw=pokemon+cards&hash=item5ed1e4fb0e`)}&amp;dti=${encodeURIComponent(name + " Near Mint")}&amp;di=${encodeURIComponent(`https://i.ebayimg.com/images/g/${id}/s-l500.jpg`)}" class="history-btn" title="Price history"><i class="fa-solid fa-chart-line"></i></a>
        <a href="https://pokedealfinder.uk/d/alGAgek/?ref=web" class="view-deal-btn" target="_blank" rel="noopener">View Deal →</a>
      </div>
    </div>
  </div>
</div>`;
const BOARD_HTML = `<html><body><div class="market-panel deals-grid active" id="panel-uk">
${CARD({ id: "407248370446", host: "www.ebay.co.uk", pct: 45, name: "Budew", set: "Ascended Heroes", price: "3.31", value: "5.98" })}
${CARD({ id: "158230582525", host: "www.ebay.com", pct: 18, name: "Celebi Prism Star", set: "Lost Thunder", price: "12.00", value: "14.63", variant: "PSA 10", format: "Auction", market: "US" })}
${CARD({ id: "407248370446", host: "www.ebay.co.uk", pct: 45, name: "Budew", set: "Ascended Heroes", price: "3.31", value: "5.98" })}
</div></body></html>`;

test("BD-1 the parser captures the board's published figures per row, identity from the du param, duplicates dropped", () => {
  const items = feed.parseFeedHtml(BOARD_HTML);
  assert.equal(items.length, 2);
  const budew = items.find((i) => i.ebayItemId === "407248370446");
  assert.equal(budew.marketplace, "EBAY_GB");
  assert.equal(budew.capturedDiscountText, "45% off");
  assert.equal(budew.capturedDiscountPct, 0.45);
  assert.equal(budew.boardListingPriceText, "£3.31");
  assert.equal(budew.boardMarketPriceText, "£5.98");
  assert.equal(budew.boardName, "Budew");
  assert.equal(budew.boardSet, "Ascended Heroes");
  assert.equal(budew.boardVariant, "Raw");
  assert.equal(budew.boardFormat, "BIN");
  assert.equal(budew.feedPrice, 3.31);
  assert.equal(budew.plainEbayUrl, "https://www.ebay.co.uk/itm/407248370446", "the board's own search / hash params are stripped from the listing URL");
  assert.equal(budew.boardImage, "https://i.ebayimg.com/images/g/407248370446/s-l500.jpg");
  assert.match(budew.sourceUrl, /^https:\/\/pokedealfinder\.uk\/public\/cards\//, "the source row URL is kept for auditing");
  assert.doesNotMatch(budew.sourceUrl, /du=/, "without the destination param");
  const celebi = items.find((i) => i.ebayItemId === "158230582525");
  assert.equal(celebi.marketplace, "EBAY_US");
  assert.equal(celebi.boardVariant, "PSA 10");
  assert.equal(celebi.boardFormat, "Auction");
  assert.equal(celebi.capturedDiscountPct, 0.18);
  // legacy / unknown markup still resolves identity, with no captured figure
  const legacy = feed.parseFeedHtml('<div class="deal"><a href="https://pokedealfinder.uk/public/cards/a/b/?market=UK&amp;dp=1&amp;du=https%3A%2F%2Fwww.ebay.co.uk%2Fitm%2F377442529729" class="history-btn">h</a></div>');
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].capturedDiscountPct, null);
  assert.equal(feed.parseDiscountText("45% off"), 0.45);
  assert.equal(feed.parseDiscountText("100% off"), null);
  assert.equal(feed.parseDiscountText("Deal"), null);
});

test("BD-1b the JSON feed: exact percentage, the board's found-at, grade and format flags, same identity rule", () => {
  const rows = [
    { id: "002b", card_name: "Budew", card_set: "Ascended Heroes", image_url: "https://i.ebayimg.com/images/g/3vg/s-l500.jpg", discount_percentage: 44.6, is_auction: false, is_graded: false, grade_display: "", listing_price: 3.31, market_price: 5.98, currency: "£", time_ago: "1h ago", found_at: "2026-09-27T01:35:03.985134+00:00", view_url: "https://pokedealfinder.uk/d/x/?ref=web", sales_url: "https://pokedealfinder.uk/public/cards/a/b/?market=UK&dp=3.31&dv=Raw&df=bin&du=https%3A%2F%2Fwww.ebay.co.uk%2Fitm%2F407248370446%3F_skw%3Dx&dti=Budew" },
    { id: "f0d0", card_name: "Charizard", card_set: "Base Set", image_url: null, discount_percentage: 23.1, is_auction: true, is_graded: true, grade_display: "PSA 9", listing_price: 200, market_price: 260, currency: "$", time_ago: "19m ago", found_at: "2026-09-27T02:38:07+00:00", view_url: "", sales_url: "https://pokedealfinder.uk/public/cards/c/d/?market=US&dp=200&dv=PSA+9&df=auction&du=https%3A%2F%2Fwww.ebay.com%2Fitm%2F287611292302" },
    { id: "dup", sales_url: "https://pokedealfinder.uk/public/cards/a/b/?market=UK&du=https%3A%2F%2Fwww.ebay.co.uk%2Fitm%2F407248370446", discount_percentage: 44.6 },
    { id: "bad", sales_url: "https://pokedealfinder.uk/public/cards/e/f/?market=FR&du=https%3A%2F%2Fwww.ebay.fr%2Fitm%2F999888777666", discount_percentage: 10 },
  ];
  const items = feed.parseFeedJson(rows);
  assert.equal(items.length, 2, "the duplicate and the unsupported marketplace are dropped");
  const budew = items[0];
  assert.equal(budew.capturedDiscountPct, 0.446, "the exact figure, not the rounded badge");
  assert.equal(budew.capturedDiscountText, "45% off");
  assert.equal(budew.boardFoundAt, "2026-09-27T01:35:03.985Z");
  assert.equal(budew.boardListingPriceText, "£3.31");
  assert.equal(budew.boardMarketPriceText, "£5.98");
  assert.equal(budew.boardVariant, "Raw");
  assert.equal(budew.boardFormat, "BIN");
  assert.equal(budew.boardId, "002b");
  assert.equal(budew.plainEbayUrl, "https://www.ebay.co.uk/itm/407248370446");
  const zard = items[1];
  assert.equal(zard.boardVariant, "PSA 9");
  assert.equal(zard.boardFormat, "Auction");
  assert.equal(zard.marketplace, "EBAY_US");
  assert.equal(zard.boardImage, null);
});

test("BD-2 price match: the captured listing price must equal eBay's live price within a cent or half a percent", () => {
  assert.equal(bd.priceMatches(3.31, 3.31), true);
  assert.equal(bd.priceMatches(3.31, 3.32), true, "one cent");
  assert.equal(bd.priceMatches(200, 200.9), true, "under 0.5%");
  assert.equal(bd.priceMatches(200, 202), false, "1% is a changed price");
  assert.equal(bd.priceMatches(3.31, 3.5), false);
  assert.equal(bd.priceMatches(null, 3.31), false);
  assert.equal(bd.priceMatches(3.31, 0), false);
});

test("BD-3 the verdict: published only when live, trusted and at the captured price; ended, price_changed and rejected otherwise", () => {
  const captured = { discountPct: 0.45, price: 3.31 };
  const live = { price: 3.31, soldOut: false };
  assert.deepEqual(bd.classifyVerification({ captured, listing: live, trusted: true }), { status: "published", reason: null });
  assert.equal(bd.classifyVerification({ captured, listing: { ...live, price: 4.99 }, trusted: true }).status, "price_changed");
  assert.equal(bd.classifyVerification({ captured, listing: { ...live, soldOut: true }, trusted: true }).status, "ended");
  assert.equal(bd.classifyVerification({ captured, listing: null, trusted: true }).status, "ended");
  assert.equal(bd.classifyVerification({ captured, listing: live, trusted: false }).status, "rejected");
  assert.equal(bd.classifyVerification({ captured: { discountPct: 0.45, price: null }, listing: live, trusted: true }).reason, "no_captured_price");
  assert.equal(bd.classifyVerification({ captured: null, listing: live, trusted: true }).status, "rejected");
  // the trust check is the pipeline's own (proxy / lot / untrustworthy never shown)
  assert.equal(bd.boardListingTrusted({ title: "Charizard PROXY custom card", price: 3, sellerFeedbackPct: 100, sellerFeedbackScore: 5000, condition: "Ungraded" }), false);
});

test("BD-4 records: publish, queue, touch, expire; what the page gets carries no source", () => {
  const now = "2026-09-27T01:00:00.000Z";
  const feedItem = feed.parseFeedHtml(BOARD_HTML)[0];
  const captured = bd.capturedFromFeedItem(feedItem, now);
  assert.equal(captured.sourceUrl.startsWith("https://pokedealfinder.uk/"), true, "kept in the record for auditing");
  const listing = { listingId: "v1|407248370446|0", title: "Budew 221/217", imageUrl: "https://i.ebayimg.com/images/g/407248370446/s-l1600.jpg", listingUrl: "https://www.ebay.co.uk/itm/407248370446", affiliateUrl: "https://www.ebay.co.uk/itm/407248370446?mkcid=1&campid=5339197414", price: 3.31, currency: "GBP", shipping: 0, listingType: "FIXED_PRICE", auctionEndAt: null, soldOut: false };
  const rec = bd.buildBoardDealRecord({ feedItem, listing, captured, verdict: bd.classifyVerification({ captured, listing, trusted: true }), now });
  assert.equal(rec.status, "published");
  assert.equal(rec.publishedAt, now);
  assert.equal(rec.verified.priceMatch, true);
  assert.equal(rec.affiliateUrl, listing.affiliateUrl, "eBay's own affiliate URL for OUR campaign");
  assert.equal(rec.captured.discountPct, 0.45);
  // the page shape: no source URL, no board market label, no captured text
  const shape = bd.toRenderShape(rec);
  assert.deepEqual(Object.keys(shape).filter((k) => /source|board|captured|market$/.test(k)), [], "nothing that names the source reaches the page");
  assert.equal(shape.discountPercentText, "45% off");
  assert.equal(shape.savingsPercentText, "Save 45%");
  assert.equal(shape.marketValueText, "£5.98", "the published market value, as text, in the listing's currency");
  assert.equal(shape.priceText, "£3.31");
  assert.equal(shape.marketplaceShort, "UK");
  assert.equal(JSON.stringify(shape).includes("pokedealfinder"), false);
  // publishable: fresh published only
  const later = Date.parse(now) + 2 * 3600_000;
  assert.equal(bd.publishableBoardDeals([rec], { now: later }).length, 1);
  assert.equal(bd.publishableBoardDeals([{ ...rec, status: "price_changed" }], { now: later }).length, 0);
  assert.equal(bd.publishableBoardDeals([rec], { now: Date.parse(now) + 25 * 3600_000 }).length, 0, "a lookup older than a day does not publish");
  // a stale re-verification unpublishes and records when
  const changed = bd.buildBoardDealRecord({ feedItem, listing: { ...listing, price: 4.99 }, captured, verdict: bd.classifyVerification({ captured, listing: { ...listing, price: 4.99 }, trusted: true }), prev: rec, now: "2026-09-27T02:00:00.000Z" });
  assert.equal(changed.status, "price_changed");
  assert.equal(changed.unpublishedAt, "2026-09-27T02:00:00.000Z");
  assert.equal(changed.publishedAt, now, "the original publication time is kept for auditing");
  // queue + duplicate touch
  const pending = bd.pendingBoardDealRecord({ feedItem, captured, now });
  assert.equal(pending.status, "pending");
  assert.equal(pending.affiliateUrl, null, "nothing to click until it is verified");
  assert.equal(bd.publishableBoardDeals([pending], { now: later }).length, 0);
  const touched = bd.touchBoardDealRecord(rec, { now: "2026-09-27T01:30:00.000Z" });
  assert.equal(touched.status, "published");
  assert.equal(touched.lastSeenOnBoardAt, "2026-09-27T01:30:00.000Z");
  // absence expiry
  const { records, expired } = bd.expireAbsentRecords([rec], { now: Date.parse(now) + 13 * 3600_000 });
  assert.equal(expired, 1);
  assert.equal(records[0].status, "expired");
  assert.ok(records[0].unpublishedAt);
});

test("BD-4b the fresh-window fallback: a fresh board row is shown unverified on our wrapped link; a stale one waits; a later lookup settles it", () => {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const feedItem = { ...feed.parseFeedHtml(BOARD_HTML)[0], boardFoundAt: iso(now - 30 * 60_000) };
  const captured = bd.capturedFromFeedItem(feedItem, iso(now));
  assert.equal(bd.isFreshCapture(captured, { now }), true);
  assert.equal(bd.isFreshCapture({ ...captured, foundAt: iso(now - 25 * 3600_000) }, { now }), false, "older than the window");
  assert.equal(bd.isFreshCapture({ ...captured, foundAt: null }, { now }), false, "no board timestamp (HTML fallback) is never fresh");
  const unv = bd.unverifiedBoardDealRecord({ feedItem, captured, now: iso(now) });
  assert.equal(unv.status, "unverified");
  assert.match(unv.affiliateUrl, /^https:\/\/www\.ebay\.co\.uk\/itm\/407248370446\?/, "the plain listing URL, wrapped");
  assert.match(unv.affiliateUrl, /customid=deals-feature/);
  assert.equal(unv.price, 3.31);
  assert.equal(unv.currency, "GBP");
  assert.equal(unv.listingType, "FIXED_PRICE");
  assert.equal(unv.publishedAt, iso(now));
  assert.equal(bd.publishableBoardDeals([unv], { now }).length, 1, "shown at once");
  assert.equal(bd.publishableBoardDeals([unv], { now: now + 25 * 3600_000 }).length, 0, "not shown past the fresh window without a lookup");
  const shape = bd.toRenderShape(unv);
  assert.equal(shape.verified, false);
  assert.equal(JSON.stringify(shape).includes("pokedealfinder"), false);
  // the lookup later: live at the price -> published (kept); price moved -> unpublished with the time
  const live = { listingId: "v1|407248370446|0", title: "Budew", imageUrl: "https://i.ebayimg.com/x.jpg", listingUrl: "https://www.ebay.co.uk/itm/407248370446", affiliateUrl: "https://www.ebay.co.uk/itm/407248370446?campid=5339197414", price: 3.31, currency: "GBP", soldOut: false };
  const ok = bd.buildBoardDealRecord({ feedItem, listing: live, captured, verdict: bd.classifyVerification({ captured, listing: live, trusted: true }), prev: unv, now: iso(now + 3600_000) });
  assert.equal(ok.status, "published");
  assert.equal(ok.publishedAt, iso(now), "the original publication time is kept");
  assert.equal(ok.affiliateUrl, live.affiliateUrl, "eBay's own affiliate URL replaces the wrapped plain one");
  const moved = bd.buildBoardDealRecord({ feedItem, listing: { ...live, price: 4.99 }, captured, verdict: bd.classifyVerification({ captured, listing: { ...live, price: 4.99 }, trusted: true }), prev: unv, now: iso(now + 3600_000) });
  assert.equal(moved.status, "price_changed");
  assert.equal(moved.unpublishedAt, iso(now + 3600_000));
  assert.equal(bd.publishableBoardDeals([moved], { now: now + 3600_000 }).length, 0);
  // a stale row is queued, not shown
  const stale = { ...feedItem, boardFoundAt: iso(now - 2 * 86400_000) };
  const pend = bd.pendingBoardDealRecord({ feedItem: stale, captured: bd.capturedFromFeedItem(stale, iso(now)), now: iso(now) });
  assert.equal(bd.publishableBoardDeals([pend], { now }).length, 0);
});

test("BD-5 the run lock: a second run is refused while the first holds it; a crashed run's lock is taken over; release clears it", async () => {
  const db = createMemoryDb({ catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
  const t0 = Date.parse("2026-09-27T01:00:00.000Z");
  const first = await bd.acquireRunLock(db, { ttlMs: 360_000, owner: "run-1", now: t0 });
  assert.equal(first.acquired, true);
  const second = await bd.acquireRunLock(db, { ttlMs: 360_000, owner: "run-2", now: t0 + 60_000 });
  assert.equal(second.acquired, false);
  assert.equal(second.heldBy, "run-1");
  const late = await bd.acquireRunLock(db, { ttlMs: 360_000, owner: "run-3", now: t0 + 400_000 });
  assert.equal(late.acquired, true, "a lock past its until is a crashed run's");
  assert.equal(late.takenOver, true);
  await bd.releaseRunLock(db);
  assert.equal(db.tables.catalog_snapshot.some((r) => r.kind === bd.BOARD_LOCK_KIND), false);
  const again = await bd.acquireRunLock(db, { ttlMs: 360_000, owner: "run-4", now: t0 + 500_000 });
  assert.equal(again.acquired, true);
  assert.equal(again.takenOver, false);
});

test("BD-6 wiring pins: lock before any lookup and released on every exit, verdict before the pipeline's gates, queue on every no-quota exit, cache expiry, cron, no source on the surface", () => {
  const route = read("app/api/ingest-feed/route.js");
  const lockAt = route.indexOf("await acquireRunLock(db");
  assert.ok(lockAt > 0 && lockAt < route.indexOf("await getBrowseRateLimit()"), "the lock is taken before the pre-flight quota check");
  assert.match(route, /if \(!runLock\.acquired\) \{\s*markSkipped\("overlapping_run"\);/);
  assert.match(route, /\} finally \{\s*await releaseRunLock\(db\);/, "the lock is released by a finally");
  assert.match(route, /finally\s*\{\s*await finishJobRun\(db, ctx\);\s*\}/, "the telemetry finally is unchanged");
  assert.ok(route.indexOf("await recordBoardVerdict(feedItem, listing);") < route.indexOf("if (listing.soldOut === true) {"), "the board verdict is recorded before the discovery pipeline's own gates");
  assert.equal((route.match(/await queueBoardDiscoveries\(/g) ?? []).length, 4, "queued on the floor skip, the budget skip, the daily-limit skip and at the end of a normal run");
  assert.match(route, /else if \(isFreshCapture\(captured, \{ lastSeenOnBoardAt: runNow \}\)\) \{/, "a fresh row (by found-at, or by the second board still listing it) is shown unverified on every queue path");
  assert.match(route, /\(r\.status !== "pending" && r\.status !== "unverified"\)/, "unverified rows the board dropped still get their lookup");
  assert.match(route, /revalidateTag\(BOARD_DEALS_TAG, \{ expire: 0 \}\)/);
  assert.match(read("vercel.json"), /"path": "\/api\/ingest-feed",\s*"schedule": "\*\/30 \* \* \* \*"/, "every 30 minutes");
  const section = read("components/BoardDealsSection.js");
  const card = read("components/BoardDealCard.js");
  const morePage = read("app/more-deals/page.js");
  for (const [name, src] of [["section", section], ["card", card], ["page", morePage]]) {
    assert.doesNotMatch(src, /pokedealfinder|PokeDealFinder|Poke Deal|jimmy/i, `the source is never named on the surface (${name})`);
  }
  assert.match(card, /wrapEbayAffiliateUrl\(d\.affiliateUrl, \{ page, placement: "feature" \}\)/, "our EPN link, with the page's placement");
  assert.match(card, /rel="nofollow sponsored noopener"/);
  // owner, 27 Sep: the published figure is shown AS the saving, against the
  // published market value; the record still carries its own verified flag
  assert.match(card, /\{d\.savingsPercentText\}/, "the saving is shown as a saving");
  assert.match(card, /vs market value \{d\.marketValueText\}/, "against the published market value, never an invented one");
  assert.match(section, /check the listing on eBay before buying/, "the unverified trade-off is stated on the surface");
  assert.doesNotMatch(section + card, /savingsClaimTrusted/, "the evidenced-savings gate is not claimed here");
  assert.match(section, /href="\/more-deals"/, "the section links to the full list");
  assert.match(morePage, /fetchBoardDealsPage\(/);
  assert.match(morePage, /<BoardDealCard key=\{d\.id\} deal=\{d\} page="deals" \/>/);
  assert.match(read("app/deals/page.js"), /<BoardDealsSection page="deals"/);
  const home = read("app/page.js");
  assert.match(home, /<BoardDealsSection page="home"/);
  assert.match(home, /const liveCount = checkedCount == null \? null : checkedCount \+ boardCount;/, "the headline count includes the imported deals");
  assert.match(home, /\{checkedCount\.toLocaleString\(\)\} listings shown,/, "the integrity sentence keeps the checked count alone");
  assert.match(read("lib/navLinks.js"), /href: "\/more-deals"/);
  assert.match(read("lib/sitemap.js"), /\/more-deals`/);
  const lib = read("lib/boardDeals.js");
  assert.match(lib, /sourceUrl: it\.sourceUrl \?\? null, \/\/ audit only, never rendered/);
});

// The second board's measured row markup (27 Sep 2026): a single, a sealed
// box and a PSA 10 slab. The image tag is split across lines, as served.
const JROW = ({ id, title, name, set, cond, price, postage, total, valuation, refNm, grade, type, added, diff }) => `
<tr class="listing-title-row" style="background-color: #f0f0f0;"><td colspan="15"><a href="https://www.ebay.com/itm/${id}?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339084796&toolid=20001&mkevt=1&customid=pokemon" rel="noopener noreferrer sponsored" class="underline-link">${title} (eBay)</a></td></tr>
<tr>
<td><img src="/static/flags/us.svg" alt="USA Flag" width="20" height="14"> US</td>
<td style="overflow: hidden;">
  <img
    src="https://i.ebayimg.com/images/g/${id}/s-l400.jpg"
    alt="${name}"
    width="100" class="thumbnail" data-ebay="https://i.ebayimg.com/images/g/${id}/s-l400.jpg" data-ref="https://storage.googleapis.com/images.pricecharting.com/x/1600.jpg" onerror="this.style.display='none';" />
</td>
<td><a href="https://www.ebay.com/itm/${id}?campid=5339084796" class="underline-link"> ${title.slice(0, 20)}... (eBay) </a><br><br> stellar_trading_cards (2192) 100.0% <br><br><a href="https://www.ebay.com/sch/i.html?_nkw=x&campid=5339084796">🔗 Search card on eBay</a></td>
<td><a href="https://pricecharting.com/game/pokemon-x/y" rel="noopener noreferrer"> ${name} </a><br><br><a href="https://www.setfinisher.com/x">🎯 Set Finisher</a></td>
<td> ${set} <br><br><a href="https://www.setfinisher.com/y">🎯 Set Finisher</a></td>
<td>${cond}</td>
<td> $${price} <br><br> ($${postage} postage) <br><br> Total: $${total} </td>
<td> $${valuation}<br><br>Adjusted ${cond} value <a href="#valuation-explained">(?)</a><br><br>$${refNm}<br><br>Reference NM value </td>
<td>${grade}</td>
<td>${type}</td>
<td>N/A</td>
<td>${added}</td>
<td style='background-color: #00ff00'>${diff}%</td>
<td style='background-color: #00ff00'>$206.56</td>
</tr>`;
const JIMMY_HTML = `<html><body><table>
${JROW({ id: "377522417725", title: "Pokemon TCG Glaceon VMAX 209/203 SWSH07 Evolving Skies UR Holo ENG 310 HP", name: "Glaceon VMAX #209", set: "Evolving Skies (2021)", cond: "LP (assumed)", price: "26.60", postage: "3.99", total: "30.59", valuation: "237.15", refNm: "263.50", grade: "Ungraded", type: "Buy it now", added: "10 hours ago", diff: "675.25" })}
${JROW({ id: "198668921233", title: "Used Pokemon Card Game MEGA Storm Emerald Booster Pack Box", name: "Booster Pack", set: "Emerald (2005)", cond: "NM (assumed)", price: "120.17", postage: "0.00", total: "120.17", valuation: "830.67", refNm: "830.67", grade: "Ungraded", type: "Buy it now", added: "35 minutes ago", diff: "591.25" })}
${JROW({ id: "377447114502", title: "Pokemon TCG Raihan 202/203 Evolving Skies Trainer PSA 10", name: "Raihan #202", set: "Evolving Skies (2021)", cond: "PSA 10", price: "64.99", postage: "6.50", total: "71.49", valuation: "419.00", refNm: "10.00", grade: "PSA 10", type: "Auction", added: "2 days ago", diff: "486.10" })}
${JROW({ id: "377522417725", title: "Pokemon TCG Glaceon VMAX 209/203 SWSH07 Evolving Skies UR Holo ENG 310 HP", name: "Glaceon VMAX #209", set: "Evolving Skies (2021)", cond: "LP (assumed)", price: "26.60", postage: "3.99", total: "30.59", valuation: "237.15", refNm: "263.50", grade: "Ungraded", type: "Buy it now", added: "10 hours ago", diff: "675.25" })}
</table></body></html>`;

test("BD-9 the second board's parser: identity from the eBay link (its affiliate params dropped), single / sealed / graded, prices, valuation, the derived discount, coarse found-at, duplicates dropped", () => {
  const now = Date.parse("2026-09-27T03:55:00.000Z");
  const items = jimmy.parseJimmyHtml(JIMMY_HTML, { marketplace: "EBAY_US", format: "buy_it_now", now });
  assert.equal(items.length, 3, "the duplicate row is dropped");
  const single = items[0];
  assert.equal(single.source, "jimmys");
  assert.equal(single.ebayItemId, "377522417725");
  assert.equal(single.marketplace, "EBAY_US");
  assert.equal(single.plainEbayUrl, "https://www.ebay.com/itm/377522417725", "the board's own campaign params are not carried");
  assert.equal(single.feedTitle, "Pokemon TCG Glaceon VMAX 209/203 SWSH07 Evolving Skies UR Holo ENG 310 HP");
  assert.equal(single.boardKind, "single");
  assert.equal(single.boardName, "Glaceon VMAX #209");
  assert.equal(single.boardSet, "Evolving Skies (2021)");
  assert.equal(single.feedCondition, "LP (assumed)");
  assert.equal(single.feedItemPrice, 26.6);
  assert.equal(single.feedPostage, 3.99);
  assert.equal(single.feedPrice, 30.59, "the listed total is the price a buyer pays");
  assert.equal(single.boardValuation, 237.15);
  assert.equal(single.boardReferenceNm, 263.5);
  assert.equal(single.boardValuationBasis, "LP (assumed)");
  assert.equal(single.boardPriceDifferencePct, 6.7525, "the board's own figure, kept verbatim as a fraction");
  assert.equal(single.capturedDiscountPct, 0.871, "1 - total / valuation on the board's two published numbers");
  assert.equal(single.capturedDiscountText, "87% off");
  assert.equal(single.boardImage, "https://i.ebayimg.com/images/g/377522417725/s-l400.jpg", "the image tag split across lines is read");
  assert.deepEqual(single.boardSeller, { name: "stellar_trading_cards", feedbackScore: 2192, feedbackPct: 100 });
  assert.equal(single.boardFoundAt, new Date(now - 10 * 3600_000).toISOString(), "'10 hours ago' -> now minus ten hours, coarse");
  assert.equal(single.boardFormat, "BIN");
  assert.equal(single.boardVariant, "Raw");
  assert.match(single.sourceUrl, /^https:\/\/www\.jimmysdealfinder\.com\/pokemon\/us\/buy_it_now\/24hrs$/, "the page it came from, kept for auditing");
  const sealed = items[1];
  assert.equal(sealed.boardKind, "sealed");
  assert.equal(sealed.boardVariant, "Sealed");
  assert.equal(sealed.feedPostage, 0);
  assert.equal(sealed.capturedDiscountPct, 0.855);
  assert.equal(sealed.boardFoundAt, new Date(now - 35 * 60_000).toISOString());
  const graded = items[2];
  assert.equal(graded.boardKind, "graded");
  assert.equal(graded.boardVariant, "PSA 10");
  assert.equal(graded.boardFormat, "Auction");
  assert.equal(graded.feedFormat, "auction");
  assert.equal(graded.boardFoundAt, new Date(now - 2 * 86400_000).toISOString());
  assert.equal(jimmy.foundAtFromAgo("just now", now), new Date(now).toISOString());
  assert.equal(jimmy.foundAtFromAgo("yesterday", now), null);
});

test("BD-10 second-board rows through the pipeline: a sealed row is trusted by the sealed rule, a slab by the card rule; the same eBay item on both boards is ONE record with both sources; fresh rows publish unverified with our link", () => {
  const now = Date.parse("2026-09-27T03:55:00.000Z");
  const [single, sealed] = jimmy.parseJimmyHtml(JIMMY_HTML, { marketplace: "EBAY_US", format: "buy_it_now", now });
  const capSealed = bd.capturedFromFeedItem(sealed, new Date(now).toISOString());
  assert.equal(capSealed.source, "jimmys");
  assert.equal(capSealed.kind, "sealed");
  assert.equal(capSealed.valuation, 830.67);
  assert.equal(capSealed.priceDifferencePct, 5.9125);
  const boxListing = { title: "Used Pokemon Card Game MEGA Storm Emerald Booster Pack Box", listingUrl: "https://www.ebay.com/itm/198668921233", listingType: "FIXED_PRICE", bidCount: 0, price: 120.17, sellerFeedbackPct: 98.5, sellerFeedbackScore: 13711, condition: "New", soldOut: false };
  assert.equal(bd.boardListingTrusted(boxListing, { kind: "sealed" }), true, "a sealed box passes the sealed rule");
  assert.equal(bd.boardListingTrusted({ ...boxListing, title: "Pokemon booster box PROXY custom" }, { kind: "sealed" }), false, "a proxy never passes");
  // unverified at once, our link
  const unv = bd.unverifiedBoardDealRecord({ feedItem: sealed, captured: capSealed, now: new Date(now).toISOString() });
  assert.equal(unv.status, "unverified");
  assert.match(unv.affiliateUrl, /^https:\/\/www\.ebay\.com\/itm\/198668921233\?/);
  assert.equal(unv.variant, "Sealed");
  assert.equal(bd.publishableBoardDeals([unv], { now }).length, 1);
  const shape = bd.toRenderShape(unv);
  assert.equal(shape.discountPercentText, "86% off");
  assert.equal(JSON.stringify(shape).includes("jimmys"), false, "the source name never reaches the page");
  assert.equal(JSON.stringify(shape).includes("pricecharting"), false);
  // both boards, one record
  const merged = bd.touchBoardDealRecord({ ...unv, captured: { ...capSealed, source: "pokedealfinder" } }, { now: new Date(now).toISOString(), source: "jimmys" });
  assert.deepEqual(merged.sources.sort(), ["jimmys", "pokedealfinder"]);
  // a single from this board still needs the card rule
  const capSingle = bd.capturedFromFeedItem(single, new Date(now).toISOString());
  assert.equal(capSingle.kind, "single");
  assert.equal(bd.boardListingTrusted({ title: "Pokemon TCG Glaceon VMAX lot of 50 cards", listingUrl: "https://www.ebay.com/itm/1", listingType: "FIXED_PRICE", bidCount: 0, price: 5, sellerFeedbackPct: 100, sellerFeedbackScore: 100 }, { kind: "single" }), false, "a lot is not one card");
  // wiring
  const route = read("app/api/ingest-feed/route.js");
  assert.match(route, /const \{ listings: feedItems, error: feedError \} = await fetchBoards\(\);/, "both boards feed the run");
  assert.match(route, /boardListingTrusted\(listing, \{ kind: captured\.kind \?\? "single" \}\)/);
  assert.equal(bd.UNVERIFIED_FRESH_HOURS, 24);
});

test("BD-11 every list, every sort: the half-hourly plan reads the Today lists, the daily full pass reads every market x format x window x sort; slices dedupe on the eBay item id; presence on the second board keeps a row current", async () => {
  const quick = jimmy.jimmyListPlan({ full: false });
  const full = jimmy.jimmyListPlan({ full: true });
  assert.equal(quick.length, 6 * 2 * 1 * 2, "6 markets (incl. all countries) x 2 formats x Today x 2 sorts");
  assert.equal(full.length, 6 * 2 * 2 * 6, "6 markets x 2 formats x 2 windows x 6 sorts");
  assert.ok(full.some((l) => l.url === "https://www.jimmysdealfinder.com/pokemon/all/auction/alltime?sort=end_asc"), "Auctions Ending Soonest is the all-time auction list sorted by end");
  assert.ok(full.some((l) => l.url === "https://www.jimmysdealfinder.com/pokemon/uk/buy_it_now/alltime"), "Buy It Now - All");
  // a fake site: every list returns the same three rows, so the walk must yield three
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { ok: true, text: async () => JIMMY_HTML }; };
  const got = await jimmy.fetchJimmyFeed({ full: true, pace: 0, fetchImpl });
  assert.equal(got.pages, 144);
  assert.equal(urls.length, 144);
  assert.equal(got.listings.length, 3, "the same listing across 144 slices is one row");
  assert.equal(got.listings[0].sourceUrl, "https://www.jimmysdealfinder.com/pokemon/us/buy_it_now/24hrs", "the first list it was seen on, kept for auditing");
  // freshness by presence: an all-time row added days ago is current while the board lists it
  const now = Date.now();
  const stale = { source: "jimmys", foundAt: new Date(now - 5 * 86400_000).toISOString(), discountPct: 0.5, price: 10 };
  assert.equal(bd.isFreshCapture(stale, { now }), false, "by found-at alone it is not fresh");
  assert.equal(bd.isFreshCapture(stale, { now, lastSeenOnBoardAt: new Date(now - 3600_000).toISOString() }), true, "but the board listed it an hour ago");
  assert.equal(bd.isFreshCapture({ ...stale, source: "pokedealfinder" }, { now, lastSeenOnBoardAt: new Date(now - 3600_000).toISOString() }), false, "the first board's rows stay on found-at");
  assert.match(read("vercel.json"), /"path": "\/api\/ingest-feed\?full=1",\s*"schedule": "20 4 \* \* \*"/, "the daily full pass is scheduled");
  assert.match(read("app/api/ingest-feed/route.js"), /fetchJimmyFeed\(\{ full: fullPass \}\)/);
});

test("BD-13 pages: the last linked page is read from the markup, a walk stops at the last page, an empty page or a page adding nothing; the backfill specs cover graded and sealed for every list", async () => {
  assert.equal(jimmy.maxPageFromHtml('<a href="?page_num=2">2</a> <a href="?sort=x&page_num=17">17</a> <a href="?page_num=3">3</a>'), 17);
  assert.equal(jimmy.maxPageFromHtml("<p>no pages</p>"), 1);
  const quick = jimmy.jimmyListSpecs({ mode: "quick" });
  const full = jimmy.jimmyListSpecs({ mode: "full" });
  const back = jimmy.jimmyListSpecs({ mode: "backfill" });
  assert.equal(quick.length, 12);
  assert.ok(quick.every((s) => s.window === "24hrs" && s.maxPages === 3));
  assert.equal(full.length, 24);
  assert.ok(full.every((s) => s.maxPages === 50));
  assert.equal(back.length, 24 * (1 + jimmy.SEALED_SEARCH_TERMS.length), "graded + every sealed search, per list");
  assert.equal(back.filter((s) => s.label === "graded").length, 24);
  assert.equal(jimmy.specUrl({ slug: "uk", format: "auction", window: "alltime", query: { grade: "Graded" } }, 3), "https://www.jimmysdealfinder.com/pokemon/uk/auction/alltime?grade=Graded&page_num=3");
  assert.equal(jimmy.specUrl({ slug: "us", format: "buy_it_now", window: "24hrs", query: {} }, 1), "https://www.jimmysdealfinder.com/pokemon/us/buy_it_now/24hrs", "page 1 is the plain list");
  // a three-page list where page 3 repeats page 2: stops with "nothing_new"
  const page = (ids, max) => `${ids.map((id) => JROW({ id, title: `Card ${id}`, name: `Card ${id}`, set: "Set (2021)", cond: "NM (assumed)", price: "10.00", postage: "0.00", total: "10.00", valuation: "20.00", refNm: "20.00", grade: "Ungraded", type: "Buy it now", added: "1 hours ago", diff: "100" })).join("")}<a href="?page_num=${max}">${max}</a>`;
  const served = { 1: page(["100000000001", "100000000002"], 5), 2: page(["100000000003"], 5), 3: page(["100000000003"], 5) };
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); const n = Number(/page_num=(\d+)/.exec(url)?.[1] ?? 1); return { ok: true, text: async () => served[n] ?? "" }; };
  const spec = { slug: "us", marketplace: "EBAY_US", format: "buy_it_now", window: "alltime", query: {}, maxPages: 50, label: "full" };
  const got = await jimmy.fetchJimmyListPages(spec, { pace: 0, fetchImpl });
  assert.equal(got.maxPage, 5);
  assert.equal(got.pages, 3);
  assert.equal(got.listings.length, 3);
  assert.equal(got.stoppedBecause, "nothing_new");
  // an empty page stops the walk; a maxPages cap is respected
  const empty = await jimmy.fetchJimmyListPages(spec, { pace: 0, fetchImpl: async (url) => ({ ok: true, text: async () => (/page_num=2/.test(url) ? "<p></p>" : served[1]) }) });
  assert.equal(empty.pages, 2);
  assert.equal(empty.stoppedBecause, "empty_page");
  const capped = await jimmy.fetchJimmyListPages({ ...spec, maxPages: 1 }, { pace: 0, fetchImpl });
  assert.equal(capped.pages, 1);
  // a refused page reports and stops, keeping what was read
  const refused = await jimmy.fetchJimmyListPages(spec, { pace: 0, fetchImpl: async (url) => (/page_num=2/.test(url) ? { ok: false, status: 429 } : { ok: true, text: async () => served[1] }) });
  assert.equal(refused.listings.length, 2);
  assert.equal(refused.errors.length, 1);
  assert.match(refused.errors[0], /429/);
});

test("BD-7 end to end (harness): a board row at the live price is published with our affiliate link; a stale-price row is recorded as price_changed and never published; the run is recorded", () => {
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/driver.mjs", "feed"], { cwd: REPO, encoding: "utf8", timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, `feed harness failed: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 200);
  const board = out.response.boardDeals;
  assert.ok(board, "the run reports its board-deal summary");
  assert.equal(board.discovered > 0, true);
  assert.equal(board.withDiscount, 2, "two board rows carried a published figure");
  const published = out.boardDeals.filter((r) => r.status === "published");
  const changed = out.boardDeals.filter((r) => r.status === "price_changed");
  assert.equal(published.length, 1, "the row at the live price is published");
  assert.equal(changed.length, 1, "the row whose captured price differs from eBay's is not");
  assert.equal(published[0].verified.priceMatch, true);
  assert.ok(published[0].affiliateUrl, "the eBay link comes from OUR lookup");
  assert.equal(published[0].captured.discountPct, 0.3);
  assert.ok(published[0].captured.sourceUrl.startsWith("https://example.invalid/"), "the source URL is kept internally");
  assert.equal(changed[0].publishedAt, null);
  assert.equal(out.boardRuns.length, 1);
  assert.equal(out.boardRuns[0].published, 1);
  assert.equal(out.boardRuns[0].priceChanged, 1);
  assert.ok(out.boardRuns[0].browseCalls >= 2);
  assert.equal(out.boardLock, null, "the lock is released at the end of the run");
  // the render shape publishes only the verified row and nothing about its source
  const shapes = bd.publishableBoardDeals(out.boardDeals, { now: Date.now() }).map(bd.toRenderShape);
  assert.equal(shapes.length, 1);
  assert.equal(JSON.stringify(shapes).includes("example.invalid"), false);
});

test("BD-8 end to end (harness), NO quota: the run makes no lookup, the fresh row is shown unverified on our wrapped link, the stale row is queued, the lock is released", () => {
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/ingestion/register.mjs", "tests/harness/ingestion/driver.mjs", "feed-noquota"], { cwd: REPO, encoding: "utf8", timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, `feed-noquota harness failed: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 200);
  assert.equal(out.response.skipped, "ebay_rate_limited");
  assert.equal(out.calls.getItemsByLegacyIds ?? 0, 0, "no eBay lookup was made");
  const board = out.response.boardDeals;
  assert.equal(board.unverifiedShown, 1, "the fresh row is shown");
  assert.equal(board.queuedPending, 1, "the stale row waits for a lookup");
  assert.equal(board.lookedUp, 0);
  const shown = out.boardDeals.find((x) => x.status === "unverified");
  assert.ok(shown);
  assert.match(shown.affiliateUrl, /^https:\/\/www\.ebay\.com\/itm\/\d+\?/, "the plain listing URL wrapped with our tracking");
  assert.equal(shown.captured.discountPct, 0.3);
  const shapes = bd.publishableBoardDeals(out.boardDeals, { now: Date.now() }).map(bd.toRenderShape);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].verified, false);
  assert.equal(out.boardLock, null);
  assert.equal(out.boardRuns.at(-1).skipped, "ebay_rate_limited");
});

test("BD-14 /more-deals filters over the render shapes: market, kind from the stated variant, format; unknown values filter nothing", () => {
  const rows = [
    { id: "a", marketplace: "EBAY_US", variant: "Raw", format: "BIN" },
    { id: "b", marketplace: "EBAY_GB", variant: "PSA 10", format: "Auction" },
    { id: "c", marketplace: "EBAY_US", variant: "Sealed", format: "BIN" },
    { id: "d", marketplace: "EBAY_DE", variant: null, format: null },
  ];
  const ids = (opts) => bd.filterBoardDeals(rows, opts).map((r) => r.id);
  assert.deepEqual(ids({}), ["a", "b", "c", "d"]);
  assert.deepEqual(ids({ market: "EBAY_US" }), ["a", "c"]);
  assert.deepEqual(ids({ kind: "raw" }), ["a"]);
  assert.deepEqual(ids({ kind: "graded" }), ["b"], "graded is any stated variant that is not Raw or Sealed");
  assert.deepEqual(ids({ kind: "sealed" }), ["c"]);
  assert.deepEqual(ids({ format: "bin" }), ["a", "c", "d"], "no stated format counts as Buy It Now");
  assert.deepEqual(ids({ format: "auction" }), ["b"]);
  assert.deepEqual(ids({ market: "EBAY_US", kind: "sealed", format: "bin" }), ["c"]);
  assert.deepEqual(ids({ kind: "bogus", format: "bogus" }), ["a", "b", "c", "d"]);
});

test("BD-15 the record loader walks the store in kind order (an unordered range walk skipped a third of the rows, 27 Sep)", () => {
  assert.match(read("lib/boardDeals.js"), /\.like\("kind", `\$\{BOARD_DEAL_KIND_PREFIX\}%`\)\.order\("kind"\)\.range\(from, from \+ 999\)/);
});

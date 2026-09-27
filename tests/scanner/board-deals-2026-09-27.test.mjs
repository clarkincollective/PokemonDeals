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
  assert.equal(bd.isFreshCapture({ ...captured, foundAt: iso(now - 7 * 3600_000) }, { now }), false, "older than the window");
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
  assert.equal(bd.publishableBoardDeals([unv], { now: now + 7 * 3600_000 }).length, 0, "not shown past the fresh window without a lookup");
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
  assert.match(route, /else if \(isFreshCapture\(captured\)\) \{/, "a fresh row is shown unverified on every queue path");
  assert.match(route, /\(r\.status !== "pending" && r\.status !== "unverified"\)/, "unverified rows the board dropped still get their lookup");
  assert.match(route, /revalidateTag\(BOARD_DEALS_TAG, \{ expire: 0 \}\)/);
  assert.match(read("vercel.json"), /"path": "\/api\/ingest-feed",\s*"schedule": "\*\/30 \* \* \* \*"/, "every 30 minutes");
  const section = read("components/BoardDealsSection.js");
  assert.doesNotMatch(section, /pokedealfinder|PokeDealFinder|Poke Deal/i, "the source is never named on the surface");
  assert.match(section, /wrapEbayAffiliateUrl\(d\.affiliateUrl, \{ page, placement: "feature" \}\)/, "our EPN link, with the page's placement");
  assert.match(section, /rel="nofollow sponsored noopener"/);
  assert.match(section, /not our own market comparison/, "the imported figure is not presented as our verified saving");
  assert.match(section, /check the listing on eBay before buying/, "the unverified trade-off is stated on the surface");
  assert.doesNotMatch(section, /savingsClaimTrusted|Save \$/, "the evidenced-savings vocabulary is not used here");
  assert.match(read("app/deals/page.js"), /<BoardDealsSection page="deals"/);
  assert.match(read("app/page.js"), /<BoardDealsSection page="home"/);
  const lib = read("lib/boardDeals.js");
  assert.match(lib, /sourceUrl: it\.sourceUrl \?\? null, \/\/ audit only, never rendered/);
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

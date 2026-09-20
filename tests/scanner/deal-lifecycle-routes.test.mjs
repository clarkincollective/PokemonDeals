// /deals/[id] lifecycle, decided by the route itself - no live sampling.
//
// WHY THIS EXISTS. The lifecycle contract was only checked by SEO tests
// that sample live deal URLs out of the production sitemap. Those URLs are
// ephemeral: a listing that retires between the sitemap snapshot and the
// fetch turns into a 308 to its card page - the CORRECT behaviour - and the
// test reported it as a failure. That made the suite non-deterministic (it
// drifted 27<->32 between runs on identical code) and trained the reader to
// ignore sitemap failures.
//
// The four lifecycle states are a property of the route, not of whichever
// listing happens to be alive. They are pinned here through the real route
// with fixture rows and no network, so they hold at any moment; the live
// suite keeps only the checks that genuinely need production, and now tells
// a retire-after-snapshot race apart from a listing wrongly still
// advertised (tests/seo/sitemap.test.mjs).
//
// The harness turns Next's navigation calls into throws:
//   permanentRedirect(href) -> Error("FIXTURE_REDIRECT:" + href)
//   notFound()              -> Error("FIXTURE_NOT_FOUND")

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { loadRoute, elements } from "../helpers/r3RouteHarness.mjs";
import { DEAL_STATE_FIXTURES } from "../../lib/dev/dealStateFixtures.js";

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = () => { throw Error("NETWORK_FORBIDDEN"); }; });
afterEach(() => { globalThis.fetch = originalFetch; });

const base = DEAL_STATE_FIXTURES.find((f) => f.id === "bin_compared").deal;
const deal = (over = {}) => ({ ...base, is_active: true, ...over });

// Render /deals/[id] for one fixture row. Returns either the rendered page
// or the navigation the route performed.
async function visit(row, { hub = null, card = null, id = row?.id ?? 900001 } = {}) {
  const { route } = loadRoute("app/deals/[id]/page.js", { deal: row, hub, card, renderComponents: true, currency: { viewer: "USD", rates: { USD: 1 } } });
  const props = { params: Promise.resolve({ id: String(id) }) };
  try {
    const tree = await route.default(props);
    const html = renderToStaticMarkup(tree);
    const schema = elements(tree)
      .filter((e) => e.type === "script" && e.props?.type === "application/ld+json")
      .map((e) => JSON.parse(e.props.dangerouslySetInnerHTML.__html));
    const meta = await route.generateMetadata(props);
    return { nav: null, html, schema, meta, product: schema.find((s) => s["@type"] === "Product") };
  } catch (e) {
    const m = String(e.message ?? e);
    if (m.startsWith("FIXTURE_REDIRECT:")) return { nav: { kind: "redirect", href: m.slice("FIXTURE_REDIRECT:".length) } };
    if (m === "FIXTURE_NOT_FOUND") return { nav: { kind: "notFound" }, href: null };
    throw e;
  }
}

const canonicalOf = (meta) => meta?.alternates?.canonical ?? null;
const robotsOf = (meta) => meta?.robots ?? null;

// --- 1. eligible live deal ------------------------------------------------

test("1. an eligible live deal renders 200, self-canonical and indexable", async () => {
  const row = deal({ id: 900001 });
  const r = await visit(row, { id: 900001 });
  assert.equal(r.nav, null, "a live deal is neither redirected nor 404");
  // the route authors a path and lets metadataBase resolve the origin
  const canonical = canonicalOf(r.meta);
  assert.ok(canonical, "an indexable deal page declares a canonical");
  assert.equal(new URL(canonical, "https://pokemondealfinder.com").pathname, "/deals/900001", "self-canonical on the bare URL");
  const robots = robotsOf(r.meta);
  assert.ok(robots == null || robots.index !== false, "an eligible deal is indexable");
  assert.ok(r.product, "a genuine single-item page carries Product schema");
  assert.equal(r.product.offers["@type"], "Offer");
  // structured-data brief 2026-09-20: no eBay / affiliate URL inside JSON-LD -
  // the Offer points at this page's own canonical URL, priced at the item price
  assert.equal(r.product.offers.url, "https://pokemondealfinder.com/deals/900001", "the Offer points at the deal page itself");
  assert.equal(r.product.offers.price, Number(row.price).toFixed(2), "the Offer price is the item price excluding shipping");
  assert.doesNotMatch(JSON.stringify(r.product), /ebay\.(com|co\.uk|com\.au|ca|de|it)/, "no eBay URL inside the Product");
  assert.match(r.html, /id="main-content"/);
});

// --- 2. expired deal -> ITS OWN card ---------------------------------------

test("2. an expired deal 308s to the card it is actually for, not to any card page", async () => {
  const row = deal({ id: 900002, is_active: false, disqualified_reason: "availability:sold", watchlist_id: 4242 });
  const hub = { id: "hub-1", slug: "clefable-jungle", name: "Clefable", set: "Jungle", tcgplayerId: "45120" };
  const r = await visit(row, { hub, id: 900002 });
  assert.ok(r.nav, "an expired deal does not render a live page");
  assert.equal(r.nav.kind, "redirect");
  // the destination is THIS deal's own card hub - asserted exactly, never
  // "some /cards/ URL"
  assert.equal(r.nav.href, "/cards/clefable-jungle");
});

test("2b. a different card gives a different destination - the redirect follows the row", async () => {
  const row = deal({ id: 900002, is_active: false, disqualified_reason: "availability:sold", watchlist_id: 99 });
  const hub = { id: "hub-2", slug: "snorlax-jungle", name: "Snorlax", set: "Jungle", tcgplayerId: "45122" };
  const r = await visit(row, { hub, id: 900002 });
  assert.equal(r.nav.href, "/cards/snorlax-jungle", "a redirect to the wrong card would pass a 'any /cards/ page' check");
});

test("2c. an expired deal with no permanent card page 404s rather than landing anywhere", async () => {
  // no hub and no catalogue candidate -> nothing truthful to redirect to
  const row = deal({ id: 900002, is_active: false, disqualified_reason: "availability:sold", watchlist_id: null, card_name: null, card_set: null });
  const r = await visit(row, { hub: null, card: null, id: 900002 });
  assert.equal(r.nav.kind, "notFound", "never a homepage / index / species fallback");
});

// --- 3. held / disqualified but still active --------------------------------

test("3. a held deal keeps the 200 + noindex withheld contract, with no Offer schema", async () => {
  const row = deal({ id: 900005, is_active: true, disqualified_reason: "review:copy_of_authenticity_hold" });
  const r = await visit(row, { id: 900005 });
  assert.equal(r.nav, null, "a held row is still reachable - it can become displayable again");
  assert.equal(robotsOf(r.meta).index, false, "withheld from the index");
  assert.equal(robotsOf(r.meta).follow, true, "noindex, follow");
  assert.equal(r.product, undefined, "a withheld page must not advertise a priced Offer");
  assert.match(r.html, /Deal not found|unavailable/i);
});

test("3b. the same contract for a quality disqualification, not just a review hold", async () => {
  for (const reason of ["condition:heavily_played", "identity:card_mismatch", "identity:crossmatch_copy_conflict"]) {
    const r = await visit(deal({ id: 900006, is_active: true, disqualified_reason: reason }), { id: 900006 });
    assert.equal(robotsOf(r.meta).index, false, reason);
    assert.equal(r.product, undefined, reason);
  }
});

// --- 4. malformed / nonexistent --------------------------------------------

test("4. a nonexistent id 404s", async () => {
  const r = await visit(null, { id: 999999 });
  assert.equal(r.nav.kind, "notFound");
});

test("4b. a malformed id is not treated as a deal", async () => {
  for (const id of ["abc", "12abc", "-1", "0.5", "%20", "1;drop"]) {
    const r = await visit(null, { id });
    assert.equal(r.nav?.kind, "notFound", `id ${JSON.stringify(id)}`);
  }
});

test("4c. a category slug under /deals is a category page, not a missing deal", async () => {
  // /deals/graded and friends share the route; they must not 404
  const { route } = loadRoute("app/deals/[id]/page.js", { deal: null, renderComponents: false });
  const tree = await route.default({ params: Promise.resolve({ id: "graded" }) });
  assert.ok(tree, "a known category slug still renders");
});

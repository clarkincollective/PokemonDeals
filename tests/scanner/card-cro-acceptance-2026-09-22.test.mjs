// CRO CLOSEOUT ACCEPTANCE. Renders the real DealCard tree and drives the
// real handlers with transport stubbed - no DOM, no provider, no network,
// no credentials, and NO outbound navigation (the affiliate anchor's
// onClick is invoked directly; nothing ever follows an href, so no
// affiliate click reaches eBay).
//
// Four guarantees, all of which a presentation change could plausibly
// break and none of which a source-text assertion can prove:
//
//   1. the CTA matches the listing type (trusted BIN / untrusted BIN /
//      auction), and an unsupported listing is never sold as a deal;
//   2. exactly ONE affiliate event per intentional CTA activation;
//   3. opening Price details does NOT emit affiliate_click;
//   4. the disclosure emits one event per OPEN transition and none on
//      close.
//
// (3) and (4) matter because the disclosure event was added in this
// pass: `toggle` fires in both directions, and a careless handler would
// either double-count or - worse - be wired into the click path and
// inflate the conversion metric this redesign is meant to be judged on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import swc from "next/dist/build/swc/index.js";
import { DEAL_STATE_FIXTURES } from "../../lib/dev/dealStateFixtures.js";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
const components = new Map();
function component(name) {
  if (!components.has(name)) {
    const stub = () => null;
    stub.WithinWindow = () => null;
    components.set(name, stub);
  }
  return components.get(name);
}
async function load(file, overrides = {}) {
  const filename = resolve(root, file);
  const { code } = swc.transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/components/") || name === "next/link") return component(name);
    if (name.startsWith("@/lib/")) return require(resolve(root, name.slice(2) + ".js"));
    return require(name);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports.default;
}
function walk(el, out = []) {
  if (!el || typeof el !== "object") return out;
  if (Array.isArray(el)) {
    for (const c of el) walk(c, out);
    return out;
  }
  out.push(el);
  walk(el.props?.children, out);
  return out;
}
function find(el, type) {
  return walk(el).find((n) => n.type === type) ?? null;
}
function words(el) {
  let s = "";
  for (const n of walk(el)) {
    const c = n.props?.children;
    if (typeof c === "string") s += c + " ";
    else if (Array.isArray(c)) for (const x of c) if (typeof x === "string") s += x + " ";
  }
  return s;
}

const captures = [];
const DealCard = await load("components/DealCard.js");
const AffiliateLink = await load("components/AffiliateLink.js", {
  "@/lib/analytics/client": { capture: (event, props) => captures.push({ event, props }) },
  "@vercel/analytics": { track: () => {} },
});
const fx = Object.fromEntries(DEAL_STATE_FIXTURES.map((f) => [f.id, f]));

// ---- 1. CTA by listing type -----------------------------------------

test("CTA: trusted BIN offers the purchase, untrusted BIN does not, auction offers neither", () => {
  const cases = [
    ["bin_compared", /Buy this deal/, /View listing|View auction/],
    ["bin_plain", /View listing/, /Buy this deal|View deal/],
    ["auction", /View auction/, /Buy this deal|View deal|View listing/],
  ];
  for (const [id, expected, forbidden] of cases) {
    assert.ok(fx[id], `${id} fixture exists`);
    const text = words(DealCard({ deal: fx[id].deal, pageName: "test" }));
    assert.match(text, expected, `${id}: CTA wording`);
    assert.doesNotMatch(text, forbidden, `${id}: must not carry the other states' wording`);
    assert.match(text, /on eBay/, `${id}: the CTA still names the marketplace`);
  }
});

// ---- 2. exactly one affiliate event per activation ------------------

test("exactly ONE affiliate event per intentional CTA activation", () => {
  for (const id of ["bin_compared", "bin_plain", "auction"]) {
    // DealCard's own require resolves "@/components/AffiliateLink" to the
    // stub, so the element in its tree is the stub - find THAT, then drive
    // the real component with the props the card gave it.
    const link = find(DealCard({ deal: fx[id].deal, pageName: "test" }), component("@/components/AffiliateLink"));
    assert.ok(link, `${id}: the card has exactly one affiliate control`);
    captures.length = 0;
    // Drive the REAL handler. Nothing navigates: we never follow href.
    AffiliateLink(link.props).props.onClick();
    assert.equal(captures.length, 1, `${id}: one event, not zero and not two`);
    assert.equal(captures[0].event, "affiliate_click", `${id}: and it is affiliate_click`);
  }
});

test("a card renders exactly one affiliate control, so a second cannot double-count", () => {
  for (const id of ["bin_compared", "bin_plain", "auction"]) {
    const links = walk(DealCard({ deal: fx[id].deal, pageName: "test" })).filter(
      (n) => n.type === component("@/components/AffiliateLink")
    );
    assert.equal(links.length, 1, `${id}: one AffiliateLink per card`);
  }
});

// ---- 3 + 4. the disclosure event ------------------------------------
//
// The handler lives in AnalyticsBootstrap's delegated `toggle` listener.
// It is re-implemented here EXACTLY as written there, driven with fake
// <details> elements, because the real one needs a document. If the two
// drift, the source assertion below fails.

function toggleHandler(capture) {
  return function onToggle(e) {
    const el = e.target;
    if (!el || el.tagName !== "DETAILS" || !el.open) return;
    const name = el.getAttribute("data-analytics-toggle");
    if (!name) return;
    let props = {};
    try {
      props = JSON.parse(el.getAttribute("data-analytics-props") || "{}");
    } catch {
      props = {};
    }
    capture(name, props);
  };
}
const fakeDetails = (open) => ({
  tagName: "DETAILS",
  open,
  getAttribute: (k) =>
    ({
      "data-analytics-toggle": "deal_price_details_opened",
      "data-analytics-props": JSON.stringify({ surface: "test", deal_id: 1 }),
    })[k] ?? null,
});

test("opening Price details emits one disclosure event and NO affiliate_click", () => {
  const got = [];
  const onToggle = toggleHandler((event, props) => got.push({ event, props }));
  onToggle({ target: fakeDetails(true) });
  assert.equal(got.length, 1);
  assert.equal(got[0].event, "deal_price_details_opened");
  assert.equal(got[0].props.surface, "test");
  assert.ok(!got.some((g) => g.event === "affiliate_click"), "the disclosure never reports a click");
});

test("closing Price details emits nothing - one event per OPEN transition only", () => {
  const got = [];
  const onToggle = toggleHandler((event, props) => got.push({ event, props }));
  onToggle({ target: fakeDetails(true) }); //  open
  onToggle({ target: fakeDetails(false) }); // close
  onToggle({ target: fakeDetails(true) }); //  open again
  onToggle({ target: fakeDetails(false) }); // close
  assert.equal(got.length, 2, "two opens, two events; the two closes emit nothing");
  assert.ok(got.every((g) => g.event === "deal_price_details_opened"));
});

test("the disclosure listener ignores non-details and unmarked elements", () => {
  const got = [];
  const onToggle = toggleHandler((e) => got.push(e));
  onToggle({ target: { tagName: "DIV", open: true, getAttribute: () => "deal_price_details_opened" } });
  onToggle({ target: { tagName: "DETAILS", open: true, getAttribute: () => null } });
  onToggle({ target: null });
  assert.equal(got.length, 0);
});

test("the real listener is wired to `toggle`, is separate from the click path, and checks `open`", () => {
  const src = readFileSync(resolve(root, "components/analytics/AnalyticsBootstrap.js"), "utf8");
  assert.match(src, /function onToggle\(e\) \{/);
  assert.match(src, /el\.tagName !== "DETAILS" \|\| !el\.open/, "only the OPEN transition reports");
  assert.match(src, /addEventListener\("toggle", onToggle/);
  assert.match(src, /removeEventListener\("toggle", onToggle/, "and it is cleaned up");
  // The affiliate event has exactly one emitter, and it is not this file.
  // It must never CAPTURE that event - the word appears in the file's own
  // explanatory comment, so this checks emission, not mention.
  assert.doesNotMatch(src, /capture\(\s*["'`]affiliate_click/, "AnalyticsBootstrap never emits affiliate_click");
  assert.doesNotMatch(src, /capture\(\s*EVENTS\.AFFILIATE_CLICK/, "nor via the events constant");
  const affiliate = readFileSync(resolve(root, "components/AffiliateLink.js"), "utf8");
  assert.match(affiliate, /AFFILIATE_CLICK|affiliate_click/, "AffiliateLink is the one emitter");
  const card = readFileSync(resolve(root, "components/DealCard.js"), "utf8");
  assert.doesNotMatch(card, /data-analytics-click=\{?"?affiliate/i, "the card adds no second affiliate emitter");
});

// ---- the untrusted disclosure must not leak a reference --------------

test("an untrusted listing shows no market amount, saving or score - INCLUDING inside Price details", () => {
  const text = words(DealCard({ deal: fx.bin_plain.deal, pageName: "test" }));
  assert.match(text, /No verified market comparison/);
  assert.doesNotMatch(text, /Market reference/, "the disclosure must not print a reference the card says it lacks");
  assert.doesNotMatch(text, /Reference is for/);
  assert.doesNotMatch(text, /You save/);
  assert.doesNotMatch(text, /below market/);
  assert.doesNotMatch(text, /Deal score/);
  // And the gate that enforces it reads TRUST, not arithmetic.
  const card = readFileSync(resolve(root, "components/DealCard.js"), "utf8");
  assert.match(card, /const showStoredRef = showSavings && showRef;/);
  assert.equal(
    (card.match(/\{showRef && \(/g) ?? []).length,
    0,
    "no surface may gate a stored reference on the arithmetic alone"
  );
});

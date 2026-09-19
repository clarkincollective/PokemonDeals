// 2026-09-20 - EbaySearchLink records one Vercel event and one PostHog
// affiliate_click per click (one per system, never two in the same
// system), with the structural payload the growth report groups on, and
// never touches the affiliate href. Code verification only: the component
// is compiled with the analytics modules stubbed, the rendered <a>'s
// onClick is invoked directly, and the stub calls are asserted. Receipt in
// PostHog is verified separately (docs/seo/growth-backlog-2026-09.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import swc from "next/dist/build/swc/index.js";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

function loadComponent({ region = "EBAY_AU", pathname = "/cards/some-card" } = {}) {
  const tracked = [];
  const captured = [];
  globalThis.window = { location: { pathname } };
  const { code } = swc.transformSync(read("components/EbaySearchLink.js"), {
    filename: "EbaySearchLink.js",
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const dependency = (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "@vercel/analytics") return { track: (n, d) => tracked.push([n, d]) };
    if (name === "@/lib/analytics/client") return { capture: (n, p) => captured.push([n, p]) };
    if (name === "@/lib/analytics/events") return require(resolve(root, "lib/analytics/events.js"));
    if (name === "@/lib/analytics/pageType") return require(resolve(root, "lib/analytics/pageType.js"));
    if (name === "@/lib/useRegion") return { useRegion: () => region, localizeEbaySearchUrl: (href) => href };
    throw new Error("unexpected dependency " + name);
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(dependency, mod, mod.exports);
  const Component = mod.exports.default;
  const HREF = "https://www.ebay.com/sch/i.html?_nkw=Charizard&mkcid=1&mkrid=711-53200-19255-0&campid=5339&customid=card";
  const el = Component({ href: HREF, event: { placement: "card_no_deal", cta: "search_ebay" }, className: "x", children: "Search" });
  return { el, tracked, captured, HREF };
}

test("one click -> one Vercel 'eBay Click' + one PostHog affiliate_click, structural props only, href untouched", () => {
  const { el, tracked, captured, HREF } = loadComponent();
  assert.equal(el.type, "a");
  assert.equal(el.props.href, HREF, "affiliate parameters pass through untouched");
  assert.equal(el.props.rel, "sponsored noopener noreferrer");
  el.props.onClick();
  assert.equal(tracked.length, 1);
  assert.deepEqual(tracked[0], ["eBay Click", { placement: "card_no_deal", cta: "search_ebay", marketplace: "EBAY_AU" }]);
  assert.equal(captured.length, 1, "exactly one PostHog event per click");
  assert.deepEqual(captured[0], [
    "affiliate_click",
    { origin_section: "card_no_deal", placement: "card_no_deal", page_type: "card", network: "ebay", country: "AU" },
  ]);
  el.props.onClick();
  assert.equal(tracked.length, 2);
  assert.equal(captured.length, 2, "a second click is a second event, never a double fire of one");
});

test("no marketplace chosen -> country omitted, Vercel marketplace 'unknown'; placement falls back to a fixed label", () => {
  const { el, tracked, captured } = loadComponent({ region: "", pathname: "/pokemon/charizard" });
  el.props.onClick();
  assert.equal(tracked[0][1].marketplace, "unknown");
  assert.equal(captured[0][1].country, undefined);
  assert.equal(captured[0][1].page_type, "species");
  const src = read("components/EbaySearchLink.js");
  assert.match(src, /const placement = event\.placement \?\? "ebay_search";/);
  assert.doesNotMatch(src, /card:|card_name|query:/, "never the card name or free text");
});

test("a failing analytics call cannot stop the click handler", () => {
  const { el } = loadComponent();
  // re-load with throwing stubs
  const { code } = swc.transformSync(read("components/EbaySearchLink.js"), {
    filename: "EbaySearchLink.js",
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "@vercel/analytics") return { track: () => { throw new Error("vercel down"); } };
    if (name === "@/lib/analytics/client") return { capture: () => { throw new Error("posthog down"); } };
    if (name === "@/lib/analytics/events") return require(resolve(root, "lib/analytics/events.js"));
    if (name === "@/lib/analytics/pageType") return require(resolve(root, "lib/analytics/pageType.js"));
    if (name === "@/lib/useRegion") return { useRegion: () => "EBAY_US", localizeEbaySearchUrl: (href) => href };
    throw new Error("unexpected dependency " + name);
  }, mod, mod.exports);
  const throwing = mod.exports.default({ href: "https://www.ebay.com/sch/i.html?_nkw=x", event: { placement: "card_no_deal" }, children: "S" });
  assert.doesNotThrow(() => throwing.props.onClick());
  assert.ok(el, "sanity");
});

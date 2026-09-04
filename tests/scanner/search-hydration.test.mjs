// Phase 13B.6.1 - /search deep-link hydration regression guards.
//
// A fresh SSR deep link (e.g. /search?q=pikachu pasted into the address
// bar) used to NEVER run its search: SearchClient sat inside a
// <Suspense fallback={null}> boundary (because it seeded
// useSyncExternalStore's getServerSnapshot from useSearchParams()), and
// React 19 deferred hydrating that boundary until a user interaction, so
// the URL-driven useEffect that fires loadSearch() never ran.
//
// These are STRUCTURAL source checks (no timing assertions) that lock in
// the fix: the route hydrates in React's initial pass like every other
// page, and a deep link fires exactly one /api/card-search request.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const pageSrc = strip(read("app/search/page.js"));
const clientSrc = strip(read("app/search/SearchClient.js"));

test("app/search/page.js does NOT wrap SearchClient in a Suspense boundary", () => {
  // The boundary is what React 19 left dehydrated until an interaction.
  assert.ok(!/<Suspense[\s>]/.test(pageSrc), "SearchClient must not be inside <Suspense> (deferred-hydration cause)");
  assert.ok(!/from "react".*Suspense|Suspense.*from "react"/s.test(pageSrc), "Suspense import should be gone");
  assert.match(pageSrc, /<SearchClient\b/, "page still renders SearchClient");
});

test("SearchClient does NOT read useSearchParams()", () => {
  // useSearchParams() as the getServerSnapshot source is what forced the
  // Suspense boundary and the server/hydration snapshot mismatch.
  assert.ok(!/\buseSearchParams\s*\(/.test(clientSrc), "SearchClient must not call useSearchParams()");
  assert.ok(!/import[^;]*useSearchParams/.test(clientSrc), "SearchClient must not import useSearchParams");
});

test("useSyncExternalStore uses a referentially-stable empty server snapshot", () => {
  // getServerSnapshot must be a hoisted constant (not a per-render
  // closure / value derived from another hook) or the store re-renders
  // forever, and the SSR + hydration renders must agree on "".
  assert.match(
    clientSrc,
    /const EMPTY_SEARCH\s*=\s*\(\)\s*=>\s*""/,
    "expected a module-level `const EMPTY_SEARCH = () => \"\"`"
  );
  assert.match(
    clientSrc,
    /useSyncExternalStore\(\s*subscribe\s*,\s*\(\)\s*=>\s*window\.location\.search\s*,\s*EMPTY_SEARCH\s*\)/,
    "useSyncExternalStore should read window.location.search on the client and EMPTY_SEARCH on the server"
  );
});

test("the search-trigger effect reads the live URL, not stale state", () => {
  // loadSearch() must resolve its query from window.location.search so a
  // post-hydration snapshot switch triggers exactly one request.
  const loadSearchBody = clientSrc.slice(
    clientSrc.indexOf("async function loadSearch()"),
    clientSrc.indexOf("async function loadSearch()") + 400
  );
  assert.match(loadSearchBody, /new URLSearchParams\(window\.location\.search\)/);
});

test("the query box is seeded from the URL in a mount effect (deep-link term shows)", () => {
  assert.match(
    clientSrc,
    /useEffect\(\(\)\s*=>\s*\{[^}]*URLSearchParams\(window\.location\.search\)\.get\("q"\)[^}]*setQuery\(q\)[^}]*\}\s*,\s*\[\]\)/s,
    "expected a []-dep effect that seeds `query` from window.location's q"
  );
});

test("the search-as-you-type effect skips its first run (empty initial query is not a user clear)", () => {
  // an armed-ref guard that returns before the mount run can reach the
  // "q is empty -> delete q from the URL" branch.
  assert.match(clientSrc, /if \(!typeEffectArmed\.current\)\s*\{\s*typeEffectArmed\.current = true;\s*return;/);
  const armedIdx = clientSrc.indexOf("typeEffectArmed.current = true;");
  const clearIdx = clientSrc.indexOf("q.length === 0");
  assert.ok(armedIdx > -1 && clearIdx > armedIdx, "the armed guard must precede the q-empty branch");
});

test("initial `query` state is a server PROP, never a URL hook", () => {
  // 13B.6.2 - `query` seeds from the initialQuery prop (identical on the
  // SSR + hydration render). Still SSR-safe; still not window.location /
  // useSearchParams during render.
  assert.match(clientSrc, /const \[query, setQuery\] = useState\(initialQuery \|\| ""\)/);
  assert.ok(!/useState\(urlQ\)/.test(clientSrc), "query must not initialise from urlQ");
  assert.ok(!/\buseSearchParams\s*\(/.test(clientSrc));
});

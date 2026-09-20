// 2026-09-21 - the homepage's Cumulative Layout Shift was 0.80 on desktop
// and 0.34 on mobile, all of it one pair of shifts on the section below
// the feed.
//
// Cause: on an ordinary first visit RegionRedirect applies the geo
// default once /api/rates resolves, which changes the URL params and
// starts a variant fetch in HomeFeed. While that fetch was in flight
// HomeFeed rendered an EMPTY feed, so the grid collapsed and then
// re-expanded - the whole page below it moved twice.
//
// DealGrid never had this bug: it renders <GridSkeleton /> while loading,
// which holds the height. HomeFeed now keeps the last rendered feed on
// screen instead, which holds the height exactly and shows real content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../components/HomeFeed.js", import.meta.url), "utf8");
// Assertions are about rendered behaviour, so strip the rationale comments.
const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("a feed fetch in flight never renders an empty feed", () => {
  assert.doesNotMatch(
    code,
    /loading\s*\?\s*\{\s*flagshipDeals:\s*\[\]\s*,\s*deals:\s*\[\]/,
    "the collapse-to-empty branch is back; that is the CLS bug"
  );
  assert.match(code, /lastShown/, "the previous view is retained");
  assert.match(code, /const view = fresh \?\? lastShown\.current/, "loading renders the retained view");
});

test("the flagship row is not torn out mid-fetch", () => {
  assert.doesNotMatch(code, /!loading && params\.showPromo/, "the promo row must not disappear while loading");
  assert.match(code, /\{params\.showPromo && view\.flagshipDeals\.length > 0/, "it renders from the same view as the grid");
});

test("the stale frame is announced and dimmed, never resized", () => {
  assert.match(code, /aria-busy=\{loading/, "assistive tech is told an update is in flight");
  assert.match(code, /opacity-60 transition-opacity/, "the busy state is opacity only");
  // Anything that changes box size during loading would reintroduce the shift.
  const wrap = code.slice(code.indexOf('id="pdf-home-wrap"'), code.indexOf('id="pdf-home-wrap"') + 300);
  assert.doesNotMatch(wrap, /loading \? "(?:[^"]*\b(?:h-|min-h-|py-|my-|hidden)\b)/, "no height or spacing change while loading");
});

test("DealGrid still holds its own height with a skeleton", () => {
  const grid = readFileSync(new URL("../../components/DealGrid.js", import.meta.url), "utf8");
  assert.match(grid, /loading \? \(\s*<GridSkeleton \/>/, "the list grid keeps its reserved-height skeleton");
});

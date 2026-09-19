// 2026-09-19 growth brief §6 - /saved, the Saved (N) nav entry and saved
// searches. Pure savedSearches contract + source pins.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normaliseSearchHref, searchId } from "../../lib/savedSearches.js";
import { pageTypeFromPath, PAGE_TYPES } from "../../lib/analytics/pageType.js";
import { EVENTS, ALLOWED_EVENTS } from "../../lib/analytics/events.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("saved search identity: same-origin path + sorted query, page dropped, hash dropped, absolute URLs refused", () => {
  assert.equal(normaliseSearchHref("/deals?type=graded&grader=PSA&page=3#x"), "/deals?grader=PSA&type=graded");
  assert.equal(normaliseSearchHref("/deals?grader=PSA&type=graded"), "/deals?grader=PSA&type=graded");
  assert.equal(searchId("/deals?type=graded&grader=PSA&page=3"), searchId("/deals?grader=PSA&type=graded"), "re-saving the same search is a no-op");
  assert.equal(normaliseSearchHref("https://evil.example/deals"), null);
  assert.equal(normaliseSearchHref("//evil.example/deals"), null);
  assert.equal(normaliseSearchHref("/sets/base-set"), "/sets/base-set");
});

test("/saved is noindex, never in the sitemap, and its page type is its own bucket", () => {
  const page = read("app/saved/page.js");
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.match(page, /<SavedView alertsEnabled=\{emailEnabled\(\)\} \/>/);
  assert.doesNotMatch(read("lib/sitemap.js"), /\/saved/);
  assert.equal(pageTypeFromPath("/saved"), "saved");
  assert.ok(PAGE_TYPES.includes("saved"));
});

test("the view reads only device storage, checks LIVE offers per saved card through the card-kind API, and never presents the stored price as current", () => {
  const view = read("components/SavedView.js");
  assert.match(view, /useSyncExternalStore\(subscribeCards, readSaved, getServerSnapshot\)/);
  assert.match(view, /useSyncExternalStore\(subscribeSearches, readSavedSearches, noSearches\)/);
  assert.match(view, /\/api\/deals-page\?kind=card&slug=\$\{encodeURIComponent\(slug\)\}&sort=price_asc/);
  assert.match(view, /Checking live offers…/);
  assert.match(view, /No live offers right now\./);
  assert.doesNotMatch(view, /Last seen/, "the homepage strip's 'last seen' price has no place on a live-offers view");
  assert.match(view, /Saved on this device only/);
  assert.match(view, /an <strong>alert<\/strong> emails you/);
  assert.match(view, /EVENTS\.SAVED_VIEW_OPENED, \{ count_band: /);
});

test("Saved (N): header utility + mobile tile from one component; the header still has three destinations", () => {
  const nav = read("components/SavedNavLink.js");
  assert.match(nav, /const n = cards\.length \+ searches\.length;/);
  assert.match(nav, /n > 0 \? `Saved \(\$\{n\}\)` : "Saved"/);
  assert.match(read("components/SiteHeader.js"), /<SavedNavLink \/>/);
  assert.match(read("components/NavMenu.js"), /<SavedNavLink variant="tile" onClick=\{close\} \/>/);
  assert.doesNotMatch(read("lib/navLinks.js"), /\/saved/, "not a fourth destination in the nav model");
});

test("save-this-search sits beside the applied chips on every URL-state grid, keyed on the grid URL, labelled from the chips", () => {
  const grid = read("components/DealGrid.js");
  assert.match(grid, /<SaveSearchButton\s+href=\{`\$\{basePath\}\$\{params\.raw \? `\?\$\{params\.raw\}` : ""\}`\}/);
  assert.match(grid, /label=\{savedSearchLabel\(params\)\}/);
  const btn = read("components/SaveSearchButton.js");
  assert.match(btn, /capture\(EVENTS\.SAVED_SEARCH_SAVED, \{ facet_count: facetCount \}\)/);
  for (const e of ["saved_view_opened", "saved_search_saved", "alert_created"]) assert.ok(ALLOWED_EVENTS.has(e), e);
  assert.equal(EVENTS.ALERT_CREATED, "alert_created");
});

test("privacy page names saved searches and the alert criteria", () => {
  const priv = read("app/privacy/page.js");
  assert.match(priv, /searches you have saved/);
  assert.match(priv, /listing marketplace, condition or grade/);
});

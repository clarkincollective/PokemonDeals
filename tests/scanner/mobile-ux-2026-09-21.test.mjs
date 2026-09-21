// Mobile UX, 2026-09-21. Two defects found by auditing the site as a
// phone rather than as a desktop browser at a narrow width.
//
// 1. iOS Safari force-zooms the whole page when a form control with a
//    computed font-size under 16px takes focus, and leaves it zoomed -
//    the user has to pinch back out. Five controls were at 14px,
//    including the email signup (the site's only conversion form) and a
//    search box added the same day. This is the regression that gets
//    reintroduced by anyone reaching for `text-sm` on an input, so it is
//    checked across the whole tree rather than file by file.
//
// 2. WCAG 2.5.3 Label in Name: an aria-label REPLACES inner content as an
//    element's accessible name, so visible text inside the deal-card
//    image link was missing from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const SKIP = new Set(["node_modules", ".next", ".git", ".local", "dist", "tests"]);

function sources(dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) sources(p, out);
    else if (name.endsWith(".js") || name.endsWith(".jsx")) out.push(p);
  }
  return out;
}

// Under 16px once rendered. text-base is 16px and is the floor.
const SMALL = new Set(["text-xs", "text-sm", "text-[13px]", "text-[14px]", "text-[15px]"]);

test("no form control renders under 16px on a phone (iOS zoom trap)", () => {
  const offenders = [];
  for (const file of sources()) {
    const src = readFileSync(file, "utf8");
    // A naive "<input ... >" match ends at the first ">", which an arrow
    // function in a JSX prop supplies early - that hid the email field on
    // the first pass. Scan a window after the tag name instead, stopping
    // at the next element so a sibling's classes are not read.
    for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
      let win = src.slice(m.index, m.index + 1200);
      const next = win.slice(1).search(/<(?:input|select|textarea|button|div|form|label|span)\b/);
      if (next !== -1) win = win.slice(0, next + 1);
      if (/type="(hidden|checkbox|radio)"/.test(win)) continue;
      const cls = win.match(/className="([^"]*)"/);
      if (!cls) continue;
      const toks = cls[1].split(/\s+/);
      const small = toks.filter((t) => SMALL.has(t));
      const has16 = toks.some((t) => t === "text-base" || t.endsWith(":text-base") || t === "text-[16px]");
      if (small.length && !has16) {
        offenders.push(`${relative(root, file).replace(/\\/g, "/")} <${m[1]}> ${small.join(",")}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these controls zoom the page on iOS; use text-base with sm:text-sm to keep the desktop size:\n  " + offenders.join("\n  ")
  );
});

test("the deal-card image link is decorative, and nothing is lost by hiding it", () => {
  const src = readFileSync(join(root, "components/DealCard.js"), "utf8");
  // The image link duplicates the title link's destination, so it is
  // hidden and taken out of the tab order rather than named. Naming it is
  // what failed twice: the rule compares every text node inside the
  // element, including the rank chip and the marketplace mark.
  // Anchor on <DealImage and read backwards to the <a that wraps it,
  // rather than matching the opening tag's exact indentation.
  const imgAt = src.indexOf("<DealImage");
  assert.ok(imgAt > 0, "DealImage is rendered");
  const imageLink = src.slice(src.lastIndexOf("<a", imgAt), imgAt);
  assert.match(imageLink, /aria-hidden="true"/, "image link hidden from assistive tech");
  assert.match(imageLink, /tabIndex=\{-1\}/, "image link out of the tab order");
  assert.doesNotMatch(imageLink, /aria-label/, "it must not be named; the title link is the named one");

  // The title link keeps its own visible text as its name.
  assert.match(src, /className="line-clamp-2[^"]*"\s*>\s*\n\s*\{cardName\}/, "title link named by its text");

  // The marketplace lived only inside the now-hidden overlay, so it must
  // be restated somewhere assistive tech can reach.
  assert.match(src, /className="sr-only">Listed on eBay \{marketInfo\.label\}/, "marketplace restated for assistive tech");

  // Decorative chrome stays hidden regardless.
  assert.match(src, /aria-hidden="true"[\s\S]{0,180}\{rank\}/, "the rank chip is decorative");
  assert.match(src, /aria-hidden="true"[\s\S]{0,180}Just found/, "the 'Just found' pill is decorative");
});

test("footer navigation links meet the 24px minimum tap target", () => {
  const src = readFileSync(join(root, "components/SiteFooter.js"), "utf8");
  // Both the shared link class and the catalogue row were a 23px pitch:
  // 17px of text with a 6px gap.
  assert.match(src, /const link =\s*\n?\s*"inline-flex min-h-7 w-fit items-center/, "shared footer link class");
  // Wide enough to clear the rationale comment that sits between the map
  // call and the element.
  const browse = src.slice(src.indexOf("BROWSE_LINKS.map"), src.indexOf("BROWSE_LINKS.map") + 900);
  assert.match(browse, /inline-flex min-h-7 items-center/, "catalogue row links");
});

test("footer social links are named by the text they show", () => {
  const src = readFileSync(join(root, "components/SiteFooter.js"), "utf8");
  // Visible text is "<platform> @<handle>"; the accessible name must open
  // with exactly that, so voice control matches what a user can read.
  assert.match(
    src,
    /aria-label=\{`\$\{s\.label\} @\$\{s\.handle\}/,
    "social link name must start with the visible platform and handle"
  );
});

test("the viewport stays zoomable", () => {
  // Blocking pinch-zoom is an accessibility failure; this is currently
  // correct and is pinned so it stays that way.
  const layout = readFileSync(join(root, "app/layout.js"), "utf8");
  assert.doesNotMatch(layout, /user-scalable\s*[:=]\s*["']?no/, "pinch-zoom must not be disabled");
  assert.doesNotMatch(layout, /maximumScale|maximum-scale/, "a maximum scale caps pinch-zoom");
});

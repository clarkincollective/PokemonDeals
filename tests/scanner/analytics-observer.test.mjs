// Phase 13A - impression "fires once", dwell "10s of *visible* time",
// scroll bucketing, and FilterBar event derivation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeOnceGate, scrollDepthBucket, createDwellTimer, impressionKeyFor } from "../../lib/analytics/observer.js";
import { deriveFilterEvent } from "../../lib/analytics/filterEvent.js";
import { EVENTS } from "../../lib/analytics/events.js";

test("makeOnceGate lets a key through exactly once", () => {
  const g = makeOnceGate();
  assert.equal(g.take("a"), true);
  assert.equal(g.take("a"), false);
  assert.equal(g.take("b"), true);
  assert.equal(g.size, 2);
});

test("impressionKeyFor requires intersecting + ratio", () => {
  const el = { getAttribute: (k) => (k === "data-analytics-section" ? "best_deals" : null) };
  assert.equal(impressionKeyFor({ isIntersecting: false, target: el }), null);
  assert.equal(impressionKeyFor({ isIntersecting: true, intersectionRatio: 0.2, target: el }), null);
  assert.equal(impressionKeyFor({ isIntersecting: true, intersectionRatio: 0.9, target: el }), "best_deals");
});

test("scrollDepthBucket steps 0/25/50/75/100", () => {
  assert.equal(scrollDepthBucket(0, 800, 4000), 0); // 20% visible from top
  assert.equal(scrollDepthBucket(200, 800, 4000), 25); // 25%
  assert.equal(scrollDepthBucket(1200, 800, 4000), 50); // 50%
  assert.equal(scrollDepthBucket(2400, 800, 4000), 75); // 80%
  assert.equal(scrollDepthBucket(3200, 800, 4000), 100); // 100%
});

test("createDwellTimer fires only after threshold of visible time", () => {
  let clock = 0;
  const now = () => clock;
  let fired = 0;
  const timers = [];
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => {
    const id = timers.push({ fn, at: clock + ms }) - 1;
    return id + 1;
  };
  globalThis.clearTimeout = (id) => {
    if (id != null && timers[id - 1]) timers[id - 1] = null;
  };
  const tick = (ms) => {
    clock += ms;
    for (let i = 0; i < timers.length; i++) {
      const t = timers[i];
      if (t && t.at <= clock) {
        timers[i] = null;
        t.fn();
      }
    }
  };

  try {
    const d = createDwellTimer({ thresholdMs: 10000, onQualified: () => (fired += 1), now });
    d.start();
    tick(4000); // 4s visible
    d.setVisible(false); // hidden
    tick(60000); // 60s hidden - must NOT fire
    assert.equal(fired, 0);
    d.setVisible(true); // visible again
    tick(6000); // +6s -> 10s total
    assert.equal(fired, 1);
    tick(10000);
    assert.equal(fired, 1, "fires at most once");
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
});

// ---- FilterBar event derivation ------------------------------

test("deriveFilterEvent maps facets to the right event", () => {
  assert.deepEqual(deriveFilterEvent("/?sort=discount", ""), {
    event: EVENTS.SORT_CHANGED,
    props: { facet: "sort", value: "discount", direction: "applied" },
  });
  assert.deepEqual(deriveFilterEvent("/?country=EBAY_GB", "?country=EBAY_US"), {
    event: EVENTS.COUNTRY_CHANGED,
    props: { facet: "country", value: "EBAY_GB", direction: "applied" },
  });
  assert.deepEqual(deriveFilterEvent("/?type=graded", ""), {
    event: EVENTS.FILTER_APPLIED,
    props: { facet: "type", value: "graded", direction: "applied" },
  });
});

test("deriveFilterEvent detects a toggle-off as filter_cleared", () => {
  assert.deepEqual(deriveFilterEvent("/", "?type=graded"), {
    event: EVENTS.FILTER_CLEARED,
    props: { facet: "type", value: "graded" },
  });
});

test("deriveFilterEvent ignores page-only changes and multi-key jumps", () => {
  // a stale ?page= dropping off alongside the real change is not a 2nd change
  assert.deepEqual(deriveFilterEvent("/?type=graded", "?type=raw&page=3"), {
    event: EVENTS.FILTER_APPLIED,
    props: { facet: "type", value: "graded", direction: "applied" },
  });
  // two genuine simultaneous changes -> not a single pill, ignore
  assert.equal(deriveFilterEvent("/?type=graded&country=EBAY_GB", ""), null);
});

test("deriveFilterEvent treats a bare basePath link (single prior filter) as clear-all", () => {
  assert.deepEqual(deriveFilterEvent("/", "?sort=discount"), {
    event: EVENTS.SORT_CHANGED,
    props: { facet: "sort", value: "discount", direction: "cleared" },
  });
});

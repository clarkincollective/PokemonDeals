// Phase 13A - work out which FilterBar event a filter-pill navigation
// represents, by diffing the pill's target querystring against the
// current one. Pure + unit-tested so the mapping can't drift.
//
// FilterBar pills are plain <a href> links (no client JS): each one
// sets/deletes exactly one param (plus always dropping ?page=). We
// reverse-engineer facet + value + direction from the two querystrings.

import { EVENTS } from "./events.js";

const FACET_EVENT = {
  sort: EVENTS.SORT_CHANGED,
  country: EVENTS.COUNTRY_CHANGED,
  type: EVENTS.FILTER_APPLIED,
  listing: EVENTS.FILTER_APPLIED,
  maxPrice: EVENTS.FILTER_APPLIED,
  minPrice: EVENTS.FILTER_APPLIED,
  // 13B.3 - Pokemon-page graded scoping. `value` is a normalised grader
  // code ("PSA") or grade string ("10"), never card/Pokemon text.
  grader: EVENTS.FILTER_APPLIED,
  grade: EVENTS.FILTER_APPLIED,
};

function toParams(search) {
  try {
    return new URLSearchParams(
      typeof search === "string" ? search.replace(/^\?/, "") : ""
    );
  } catch {
    return new URLSearchParams();
  }
}

// href: the pill's href (absolute or relative). currentSearch: location.search.
// Returns { event, props } or null when it isn't a filter change.
export function deriveFilterEvent(href, currentSearch) {
  if (typeof href !== "string" || !href) return null;
  let targetSearch = "";
  try {
    targetSearch = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  } catch {
    return null;
  }

  const cur = toParams(currentSearch);
  const next = toParams(targetSearch);
  cur.delete("page");
  next.delete("page");

  // find the single key that differs
  const keys = new Set([...cur.keys(), ...next.keys()]);
  let changedKey = null;
  let direction = null;
  let value = null;
  for (const k of keys) {
    const a = cur.get(k);
    const b = next.get(k);
    if (a === b) continue;
    if (changedKey) return null; // more than one change -> not a simple pill
    changedKey = k;
    if (b == null) {
      direction = "cleared";
      value = a;
    } else {
      direction = "applied";
      value = b;
    }
  }
  if (!changedKey) {
    // no param delta but the link exists -> treat as a clear-all only when
    // the target has no query at all and current had one
    if (targetSearch === "" && [...cur.keys()].length > 0) {
      return { event: EVENTS.FILTER_CLEARED, props: { facet: "all" } };
    }
    return null;
  }

  const baseEvent = FACET_EVENT[changedKey];
  if (!baseEvent) return null;

  if (direction === "cleared" && baseEvent === EVENTS.FILTER_APPLIED) {
    return { event: EVENTS.FILTER_CLEARED, props: { facet: changedKey, value } };
  }
  return {
    event: baseEvent,
    props: { facet: changedKey, value, direction },
  };
}

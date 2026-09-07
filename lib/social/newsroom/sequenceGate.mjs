// Phase SOCIAL-NEWSROOM-1 - ANTI-AI-SPAM SEQUENCE GATE (§17, §35, §38).
//
// Individually good posts can still make a feed look mass-produced. Before
// a story reaches BUFFER_READY the planned SEQUENCE (per platform, in time
// order) is inspected for repetition patterns and the offending item is
// rescheduled or held.
//
// Deterministic rules only - NOT random shuffling. An exceptional live
// deal (organic/conversion exceptional) may override SOFT sequence rules
// but never the HARD "same printing" cooldown (that lives in
// lib/social/planner/diversity.hardGuard and is unchanged).
//
// Pure. No I/O.

import { originalityKeys } from "./originalityScore.mjs";

// SOFT sequence constraints: max consecutive, and min gap (in # of posts)
// before the same key may recur, per dimension.
export const SEQUENCE_RULES = Object.freeze({
  series: { maxConsecutive: 1, minGap: 3 },
  pillar: { maxConsecutive: 2, minGap: 1 },
  pokemon: { maxConsecutive: 1, minGap: 4 },
  set: { maxConsecutive: 2, minGap: 2 },
  layout_family: { maxConsecutive: 2, minGap: 1 },
  background_family: { maxConsecutive: 2, minGap: 1 },
  hook_grammar: { maxConsecutive: 1, minGap: 3 },
  cta_intensity: { maxConsecutive: 2, minGap: 0 }, // HARD run handled separately in ctaIntensity
  numeric_structure: { maxConsecutive: 2, minGap: 1 },
});

// A rolling window: no dimension key may exceed this share of the last N.
export const WINDOW_SHARE = Object.freeze({ window: 6, series: 0.5, pokemon: 0.34, layout_family: 0.5, pillar: 0.67 });

function keysFor(item) {
  return item.keys ?? originalityKeys(item.story ?? item);
}

// items: ordered array (already time-sorted) of planned placements for ONE
// platform. Each: { story|keys, exceptional?:bool, id? }.
// Returns { ok, violations:[{index,id,dimension,rule,detail}], windowWarnings:[...] }.
export function checkSequence(items = []) {
  const violations = [];
  const keyList = items.map(keysFor);

  for (const [dim, rule] of Object.entries(SEQUENCE_RULES)) {
    // consecutive run + gap checks
    let runVal = null;
    let runLen = 0;
    const lastSeen = new Map();
    for (let i = 0; i < keyList.length; i++) {
      const v = keyList[i][dim];
      if (v == null) {
        runVal = null;
        runLen = 0;
        continue;
      }
      if (v === runVal) runLen++;
      else {
        runVal = v;
        runLen = 1;
      }
      if (runLen > rule.maxConsecutive && !items[i].exceptional) {
        violations.push({ index: i, id: items[i].id ?? null, dimension: dim, rule: "maxConsecutive", detail: `${runLen} '${v}' in a row (max ${rule.maxConsecutive})` });
      }
      if (lastSeen.has(v)) {
        const gap = i - lastSeen.get(v) - 1;
        if (gap < rule.minGap && !items[i].exceptional) {
          violations.push({ index: i, id: items[i].id ?? null, dimension: dim, rule: "minGap", detail: `'${v}' recurs after only ${gap} post(s) (need ${rule.minGap})` });
        }
      }
      lastSeen.set(v, i);
    }
  }

  // rolling-window share
  const windowWarnings = [];
  const W = WINDOW_SHARE.window;
  for (let end = W; end <= keyList.length; end++) {
    const slice = keyList.slice(end - W, end);
    for (const dim of ["series", "pokemon", "layout_family", "pillar"]) {
      const ceiling = WINDOW_SHARE[dim];
      const counts = {};
      for (const k of slice) if (k[dim] != null) counts[k[dim]] = (counts[k[dim]] ?? 0) + 1;
      for (const [val, n] of Object.entries(counts)) {
        if (n / W > ceiling + 1e-9) {
          windowWarnings.push({ window_end: end, dimension: dim, value: val, share: Number((n / W).toFixed(2)), ceiling });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations, windowWarnings };
}

// Try to fix a failing sequence by REORDERING within the same platform
// (never changing times relative to the slot grid - it swaps which story
// occupies which slot). Deterministic greedy: at each position pick the
// earliest remaining item that introduces no violation; if none, take the
// least-bad. Returns { order:[...ids], resolved:bool, remaining:[violations] }.
export function resequence(items = []) {
  const pool = items.map((it, i) => ({ ...it, _i: i }));
  const out = [];
  while (pool.length) {
    let pick = -1;
    for (let j = 0; j < pool.length; j++) {
      const trial = [...out, pool[j]];
      if (checkSequence(trial).violations.length === 0) {
        pick = j;
        break;
      }
    }
    if (pick === -1) {
      // least-bad: fewest new violations, then original order
      let best = 0;
      let bestV = Infinity;
      for (let j = 0; j < pool.length; j++) {
        const v = checkSequence([...out, pool[j]]).violations.length;
        if (v < bestV || (v === bestV && pool[j]._i < pool[best]._i)) {
          bestV = v;
          best = j;
        }
      }
      pick = best;
    }
    out.push(pool.splice(pick, 1)[0]);
  }
  const remaining = checkSequence(out).violations;
  return { order: out.map((x) => x.id ?? x._i), resolved: remaining.length === 0, remaining };
}

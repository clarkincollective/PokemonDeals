// SEO Phase 11C closeout - trend anomaly-confidence gate.
//
// A single bad observation, or a card whose two independent price sources
// disagree, must not produce a public Rising/Falling badge or a
// misleading %. The gate is a LOCAL corroboration check over real stored
// observations: it only ever REMOVES a trend window - it never edits,
// smooths, interpolates, or substitutes a price, and canonical
// price_history is untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ph from "../../lib/priceHistory.js";

const {
  mergeHistoryRows,
  trendWindows,
  confidentTrendWindows,
  endpointAnomaly,
  sourceDisagreement,
  marketSignal,
  TREND_CONFIDENCE,
} = ph;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = readFileSync(join(ROOT, "lib/priceHistory.js"), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const DAY = 86400_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
// build a daily merged-series ending "today", newest last
function daily(prices, source = "catalog", endMs = Date.parse("2026-12-01")) {
  const n = prices.length;
  return prices.map((p, i) => ({ date: iso(endMs - (n - 1 - i) * DAY), price: p, source }));
}
const flat = (v, days) => daily(Array.from({ length: days }, () => v));
// linear ramp from a to b over `days`, then hold `b` for `holdDays`
function ramp(a, b, days, holdDays = 8) {
  const up = Array.from({ length: days }, (_, i) => +(a + ((b - a) * i) / (days - 1)).toFixed(2));
  return daily([...up, ...Array.from({ length: holdDays }, () => b)]);
}

// === isolated spike / crash do not create a signal ================

test("isolated extreme spike -> no Rising (all windows withheld)", () => {
  const s = [...flat(100, 40).slice(0, 39), { date: "2027-01-09", price: 320, source: "catalog" }]
    .map((p, i, arr) => ({ ...p, date: iso(Date.parse("2027-01-09") - (arr.length - 1 - i) * DAY) }));
  assert.equal(endpointAnomaly(s), true);
  const { windows, confidence } = confidentTrendWindows(s, { rawRows: null });
  assert.equal(confidence.level, "low");
  assert.equal(confidence.reason, "endpoint-anomaly");
  for (const k of ["d7", "d30", "d90", "d365"]) assert.equal(windows[k], null);
  assert.equal(marketSignal(windows, confidence).status, "limited");
  assert.notEqual(marketSignal(windows, confidence).label, "Rising");
});

test("isolated extreme crash -> no Falling", () => {
  const s = flat(100, 39);
  s.push({ date: iso(Date.parse(s[s.length - 1].date) + DAY), price: 18, source: "catalog" });
  assert.equal(endpointAnomaly(s), true);
  const { windows, confidence } = confidentTrendWindows(s, {});
  assert.equal(marketSignal(windows, confidence).status, "limited");
  assert.notEqual(marketSignal(windows, confidence).label, "Falling");
});

// === sustained moves survive =====================================

test("sustained large increase still resolves as Rising", () => {
  const s = ramp(100, 200, 32, 10); // +100% over ~42d, held flat 10d
  assert.equal(endpointAnomaly(s), false, "corroborated endpoint");
  const { windows, confidence } = confidentTrendWindows(s, {});
  assert.equal(confidence.level, "ok");
  assert.ok(windows.d30, "d30 kept");
  assert.ok(windows.d30.changePct >= 5);
  assert.equal(marketSignal(windows, confidence).status, "rising");
});

test("sustained large decline still resolves as Falling", () => {
  const s = ramp(200, 100, 32, 10);
  assert.equal(endpointAnomaly(s), false);
  const { windows, confidence } = confidentTrendWindows(s, {});
  assert.ok(windows.d30 && windows.d30.changePct <= -5);
  assert.equal(marketSignal(windows, confidence).status, "falling");
});

// === ordinary signal behaviour unchanged =========================

test("ordinary +/-5% band is untouched by the gate", () => {
  const mk = (endPct) => {
    // ~45 days, last value endPct% above the day-30 value, gently
    const base = 100;
    const arr = Array.from({ length: 45 }, (_, i) => {
      const t = i / 44;
      return +(base * (1 + endPct / 100 * t)).toFixed(2);
    });
    return daily(arr);
  };
  const pass = (s) => {
    const { windows, confidence } = confidentTrendWindows(s, {});
    return marketSignal(windows, confidence).status;
  };
  assert.equal(pass(mk(3)), "stable");
  assert.equal(pass(mk(9)), "rising");
  assert.equal(pass(mk(-9)), "falling");
});

// === no fallback to 7d ==========================================

test("a withheld 30d window never falls back to 7d", () => {
  // gate active -> every window null -> marketSignal must say limited
  const s = flat(50, 39);
  s.push({ date: iso(Date.parse(s.at(-1).date) + DAY), price: 200, source: "catalog" });
  const { windows, confidence } = confidentTrendWindows(s, {});
  assert.equal(windows.d7, null);
  assert.equal(windows.d30, null);
  assert.equal(marketSignal(windows, confidence).status, "limited");
  // and directly: a 7d value present with d30 null + low confidence -> still limited
  const forced = marketSignal({ d7: { changePct: 55 }, d30: null }, { level: "low", reason: "endpoint-anomaly" });
  assert.equal(forced.status, "limited");
  assert.equal(forced.reason, "endpoint-anomaly");
});

// === genuine volatility is not magnitude-suppressed ==============

test("high-volatility card is not suppressed just for large magnitude", () => {
  // oscillates 85<->118 for 70 days, ends near a recent level
  const osc = Array.from({ length: 70 }, (_, i) => (i % 6 < 3 ? 85 : 118));
  osc[osc.length - 1] = 116; // close to a recent prior (118)
  const s = daily(osc);
  assert.equal(endpointAnomaly(s), false);
  const { windows, confidence } = confidentTrendWindows(s, {});
  assert.equal(confidence.level, "ok");
  // whatever the windows say, they were NOT withheld for being big
  const base = trendWindows(s);
  for (const k of ["d7", "d30", "d90"]) if (base[k]) assert.deepEqual(windows[k], base[k]);
});

test("a clean 2x-over-90-days bull run keeps its d90 window", () => {
  const s = ramp(100, 205, 88, 10);
  const { windows } = confidentTrendWindows(s, {});
  assert.ok(windows.d90 && windows.d90.changePct >= 50);
});

// === source disagreement ========================================

test("two sources disagreeing on a shared day withholds every window", () => {
  const raw = [
    { observed_on: "2026-11-01", price: 40, source: "ppt_backfill" },
    { observed_on: "2026-11-01", price: 95, source: "catalog" }, // +137% vs ppt
    ...flat(95, 40).map((p) => ({ observed_on: p.date, price: p.price, source: "catalog" })),
  ];
  assert.equal(sourceDisagreement(raw), true);
  const series = mergeHistoryRows(raw, { maxPoints: 800 });
  const { windows, confidence } = confidentTrendWindows(series, { rawRows: raw });
  assert.equal(confidence.reason, "source-disagreement");
  for (const k of ["d7", "d30", "d90", "d365"]) assert.equal(windows[k], null);
});

test("sources that agree within tolerance do NOT trigger suppression", () => {
  const raw = flat(100, 40).flatMap((p) => [
    { observed_on: p.date, price: p.price, source: "ppt_backfill" },
    { observed_on: p.date, price: +(p.price * 1.02).toFixed(2), source: "catalog" }, // 2% apart
  ]);
  assert.equal(sourceDisagreement(raw), false);
});

// === no rewriting / no interpolation ============================

test("the gate never rewrites a trend value or a price", () => {
  const s = ramp(100, 160, 40, 10);
  const base = trendWindows(s);
  const { windows } = confidentTrendWindows(s, {});
  for (const k of ["d7", "d30", "d90", "d365"]) {
    // kept windows carry the EXACT values trendWindows produced - no
    // smoothing, no re-derivation.
    if (windows[k]) assert.deepEqual(windows[k], base[k], `${k} values must be identical`);
  }
  // series itself is not mutated by running the gate
  const snapshot = JSON.stringify(s);
  confidentTrendWindows(s, { rawRows: s.map((p) => ({ observed_on: p.date, price: p.price, source: p.source })) });
  assert.equal(JSON.stringify(s), snapshot);
  // source contains no smoothing / interpolation / averaging-into-series
  const code = stripComments(LIB);
  assert.doesNotMatch(code, /interpolat|movingAverage|smoothSeries|fillGap/i);
});

test("mergeHistoryRows output is unchanged (canonical merge intact)", () => {
  const raw = [
    { observed_on: "2026-09-01", price: 111, source: "ppt_backfill" },
    { observed_on: "2026-09-01", price: 222, source: "catalog" },
    { observed_on: "2026-09-02", price: 9999, source: "catalog" }, // sentinel dropped
    { observed_on: "2026-09-03", price: 333, source: "ppt_backfill" },
  ];
  assert.deepEqual(mergeHistoryRows(raw, { maxPoints: 800 }), [
    { date: "2026-09-01", price: 222, source: "catalog" },
    { date: "2026-09-03", price: 333, source: "ppt_backfill" },
  ]);
});

// === WOTC / thin history unchanged ==============================

test("a short catalog-only (WOTC-style) series is 'Limited history', not 'anomaly'", () => {
  const s = daily([54.85, 54.85, 55.1, 54.9], "catalog"); // 4 points, ~3 days
  assert.equal(endpointAnomaly(s), false); // not enough priors AND no jump
  const { windows, confidence } = confidentTrendWindows(s, { rawRows: s.map((p) => ({ observed_on: p.date, price: p.price, source: "catalog" })) });
  assert.equal(confidence.level, "ok");
  assert.equal(confidence.reason, null);
  for (const k of ["d7", "d30", "d90", "d365"]) assert.equal(windows[k], null); // too short for any window
  const sig = marketSignal(windows, confidence);
  assert.equal(sig.status, "limited");
  assert.equal(sig.reason, null); // NOT flagged as an anomaly just for being short
});

test("2-3 point series never triggers endpointAnomaly", () => {
  assert.equal(endpointAnomaly(daily([100, 100])), false);
  assert.equal(endpointAnomaly(daily([100, 100, 400])), false); // length 3 < minPriors+1
});

// === currency invariance ========================================

test("gate decisions and kept %s are currency-invariant", () => {
  const s = ramp(100, 175, 40, 10);
  const scaled = s.map((p) => ({ ...p, price: +(p.price * 1.3743).toFixed(4) }));
  const a = confidentTrendWindows(s, {});
  const b = confidentTrendWindows(scaled, {});
  assert.equal(a.confidence.level, b.confidence.level);
  for (const k of ["d7", "d30", "d90", "d365"]) {
    assert.equal(Boolean(a.windows[k]), Boolean(b.windows[k]), `${k} suppression must match`);
    if (a.windows[k]) assert.equal(a.windows[k].changePct, b.windows[k].changePct);
  }
  // source disagreement is a ratio test -> scale-free
  const raw = [
    { observed_on: "2026-11-01", price: 40, source: "ppt_backfill" },
    { observed_on: "2026-11-01", price: 95, source: "catalog" },
  ];
  assert.equal(
    sourceDisagreement(raw),
    sourceDisagreement(raw.map((r) => ({ ...r, price: r.price * 7.1 })))
  );
});

// === thresholds are documented constants ========================

test("confidence thresholds are explicit constants", () => {
  assert.equal(TREND_CONFIDENCE.spikeFactor, 1.5);
  assert.equal(TREND_CONFIDENCE.sourceDisagreePct, 0.35);
  assert.equal(TREND_CONFIDENCE.minPriors, 3);
});

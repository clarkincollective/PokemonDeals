// FINDING 9 (audit 2026-09-23) - the order of a sold-listings list is a
// CLAIM the page makes, not an incidental detail. The section is headed
// "Recent eBay sales", every consumer renders it top-down and slices the
// first N rows, so the array order decides both WHICH sales a visitor sees
// and in what sequence.
//
// PokemonPriceTracker does not guarantee an order, and measurably does not
// supply one. A 40-page production census (2026-09-25) found, of 23 deal
// pages with an orderable list: 8 oldest-first, 10 in no discernible
// order, and only 5 newest-first. On pages that filled the 8-row limit the
// slice could therefore keep the eight OLDEST sales and discard the most
// recent ones, under a heading that says "Recent". Worst observed case led
// with a sale 216 days older than the newest sale the same list held.
//
// The rule lives here, in one place, so the provider adapter and the
// display component cannot disagree about it, and so a future consumer
// inherits it instead of having to remember. It is pure: no IO, no env, no
// clock. It never invents, drops or rewrites a sale - it only orders.
//
// Undated sales keep their relative order and sort AFTER every dated one:
// a sale whose date we do not know must never be presented as the most
// recent sale. Sorting is stable on an explicit original-index tie-break,
// so equal dates (common - several sales close on the same day) always
// come out in the same sequence rather than depending on the engine.

function soldDateValue(soldDate) {
  if (!soldDate) return null;
  const t = new Date(soldDate).getTime();
  return Number.isFinite(t) ? t : null;
}

// Newest first. Returns a NEW array; the input is never mutated (callers
// pass arrays they do not own, including cached provider payloads).
function sortSoldListingsByDate(sales) {
  if (!Array.isArray(sales)) return [];
  return sales
    .map((row, index) => ({ row, index, t: soldDateValue(row?.soldDate) }))
    .sort((a, b) => {
      if (a.t === null && b.t === null) return a.index - b.index;
      if (a.t === null) return 1;
      if (b.t === null) return -1;
      if (b.t !== a.t) return b.t - a.t;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

module.exports = { sortSoldListingsByDate, soldDateValue };

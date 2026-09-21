// CSV rendering of the listing-disappearance study's PUBLISHED figures.
//
// Same contract as lib/studies/referencePriceChangeCsv: every number here
// is already rendered on /market-data/how-long-pokemon-deals-last. No new
// claim, no new precision, no database read - the source is the frozen
// aggregate, so this cannot drift from the page.
//
// It carries the exclusion ledger as well as the findings, deliberately.
// A reader who only gets the headline percentage cannot judge it; a
// reader who can see that 31,889 rows became 15,147, and why, can.
import { LISTING_DISAPPEARANCE as D } from "./listingDisappearance.js";

const HEADER = ["section", "group", "metric", "value", "unit"];

export function csvCell(value) {
  const v = value == null ? "" : String(value);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function disappearanceRows() {
  const p = D.population;
  const h = D.headline;
  const rows = [
    ["study", "", "version", D.version, ""],
    ["study", "", "id", D.id, ""],
    ["window", "", "start", D.window.start, "date"],
    ["window", "", "end", D.window.end, "date"],
    ["window", "", "length", D.window.days, "days"],

    ["population", "", "rows considered", p.rowsConsidered, "listings"],
    ["population exclusions", "withheld by our own checks", "listings", p.excludedHeldByUs, "listings"],
    ["population exclusions", "still live at window end", "listings", p.excludedStillActive, "listings"],
    ["population exclusions", "first seen on day one (age unknown)", "listings", p.excludedFirstDay, "listings"],
    ["population exclusions", "search never re-run after discovery", "listings", p.excludedNeverReSearched, "listings"],
    ["population", "", "measured", p.measured, "listings"],
    ["population", "", "measured share of candidates", p.measuredShareOfCandidates, "%"],

    ["finding", "all measured", "gone by next run of same search", h.goneByNextScan, "listings"],
    ["finding", "all measured", "gone by next run of same search", h.goneByNextScanPct, "%"],
    ["finding", "all measured", "median gap to that next run", h.medianGapToNextScanDays, "days"],
    ["finding", "all measured", "re-seen at least once", h.reSeenAtLeastOnce, "listings"],
    ["finding", "all measured", "median observed span when re-seen", h.reSeenMedianObservedDays, "days"],
  ];

  for (const [band, v] of Object.entries(D.byReferenceBand)) {
    rows.push(["finding by reference band", band, "listings measured", v.records, "listings"]);
    rows.push(["finding by reference band", band, "gone by next run of same search", v.goneByNextScanPct, "%"]);
    rows.push(["finding by reference band", band, "median observed span when re-seen", v.reSeenMedianDays, "days"]);
  }

  for (const [i, limit] of D.limits.entries()) {
    rows.push(["limits", `limit ${i + 1}`, "statement", limit, ""]);
  }
  return rows;
}

export function disappearanceCsv() {
  const preamble = [
    `# Pokemon Deal Finder - how long a below-market listing lasts, ${D.window.start} to ${D.window.end}`,
    `# Version ${D.version}. A FIXED, DATED SNAPSHOT: these figures are never refreshed.`,
    "# ABSENCE IS NOT A SALE. A listing also leaves a search when it ends, is cancelled,",
    "# is relisted, or changes price enough to fall outside the below-market filter.",
    "# No sell-through rate, time-to-sale or market size can be derived from this.",
    "# Licence CC BY 4.0 - https://creativecommons.org/licenses/by/4.0/",
    "# Full method and limits:",
    "#   https://pokemondealfinder.com/market-data/how-long-pokemon-deals-last",
  ].join("\n");
  const body = [HEADER, ...disappearanceRows()].map((r) => r.map(csvCell).join(",")).join("\n");
  return `${preamble}\n${body}\n`;
}

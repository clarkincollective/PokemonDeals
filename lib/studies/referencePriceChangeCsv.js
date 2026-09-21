// CSV rendering of the 30-day reference-price study's PUBLISHED figures.
//
// Every number this emits is already rendered on
// /market-data/pokemon-reference-price-changes. This adds no new claim,
// no new observation and no new precision - it is the same fixed, dated
// aggregate in a format a researcher or journalist can actually cite and
// load, which is what `Dataset.distribution` is for.
//
// It is built from the frozen STUDY object (lib/studies/
// referencePriceChange30d), so there is NO database query, no provider
// call and no per-listing or seller data anywhere in it. That is what
// makes publishing it safe: it cannot be used to enumerate anything,
// because it contains only the study's own summary statistics.
//
// Long/tidy shape - section, group, metric, value, unit - because the
// study reports several different cuts (overall, by era, pooled variants,
// sensitivity) and a wide table would need a different column set for
// each. One self-describing schema beats four.
import { STUDY as S } from "./referencePriceChange30d.js";

const HEADER = ["section", "group", "metric", "value", "unit"];

// RFC 4180: quote when the field contains a comma, quote or newline, and
// double any embedded quote.
export function csvCell(value) {
  const v = value == null ? "" : String(value);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function distributionRows(section, group, d) {
  return [
    [section, group, "median change", d.median, "%"],
    [section, group, "up more than 1%", d.up, "% of records"],
    [section, group, "flat within 1%", d.flat, "% of records"],
    [section, group, "down more than 1%", d.down, "% of records"],
  ];
}

export function studyRows() {
  const rows = [];

  rows.push(["study", "", "version", S.version, ""]);
  rows.push(["study", "", "id", S.id, ""]);
  rows.push(["study", "", "source provider", S.source.provider, ""]);
  rows.push(["study", "", "observation kind", S.source.kind, ""]);
  rows.push(["window", "", "start", S.window.earlyTarget, "date"]);
  rows.push(["window", "", "end", S.window.lateTarget, "date"]);
  rows.push(["window", "", "endpoint tolerance", S.window.toleranceDays, "days"]);

  rows.push(["coverage", "", "product records sampled", S.coverage.products, "count"]);
  rows.push(["coverage", "", "product records that responded", S.coverage.responded, "count"]);
  rows.push(["coverage", "", "variant records total", S.coverage.totalVariantRecords, "count"]);
  rows.push(["coverage", "", "variant records eligible", S.coverage.eligibleVariants, "count"]);
  rows.push(["coverage", "", "variant records excluded", S.coverage.excludedVariants, "count"]);
  for (const [reason, n] of Object.entries(S.coverage.exclusions ?? {})) {
    rows.push(["coverage exclusions", reason, "variant records", n, "count"]);
  }

  rows.push(["product level", "all", "product records", S.overall.products, "count"]);
  rows.push(...distributionRows("product level", "all", S.overall));

  for (const e of S.byEra ?? []) {
    rows.push(["product level by era", e.label, "product records", e.products, "count"]);
    rows.push(...distributionRows("product level by era", e.label, e));
  }

  rows.push(["variant level", "pooled", "variant records", S.pooled.variants, "count"]);
  rows.push(...distributionRows("variant level", "pooled", S.pooled));

  rows.push(["sensitivity", "flagged variants", "variant records", S.sensitivity.flaggedVariants, "count"]);
  for (const [key, label] of [
    ["excludingFlagged", "excluding flagged variants"],
    ["excludingPilot", "excluding pilot records"],
    ["pilotOnly", "pilot records only"],
  ]) {
    const d = S.sensitivity[key];
    if (!d) continue;
    rows.push(["sensitivity", label, "product records", d.products, "count"]);
    rows.push(...distributionRows("sensitivity", label, d));
  }

  rows.push(["identity", "", "cross-set identity conflicts", S.identity.conflicts, "count"]);
  rows.push(["identity", "", "cross-set records preserved", S.identity.crossSetPreserved, "count"]);

  return rows;
}

export function studyCsv() {
  // A leading comment block: the file has to carry its own provenance,
  // because a CSV gets separated from the page that explains it.
  const preamble = [
    `# Pokemon Deal Finder - Pokemon reference-price changes, ${S.window.earlyTarget} to ${S.window.lateTarget}`,
    `# Study version ${S.version}. A FIXED, DATED SNAPSHOT: these figures are never refreshed.`,
    `# Reference-price observations, NOT completed sales. Source: ${S.source.provider}.`,
    "# Licence CC BY 4.0 - https://creativecommons.org/licenses/by/4.0/",
    "# Full method, limits and what this does not measure:",
    "#   https://pokemondealfinder.com/market-data/pokemon-reference-price-changes",
  ].join("\n");
  const body = [HEADER, ...studyRows()].map((r) => r.map(csvCell).join(",")).join("\n");
  return `${preamble}\n${body}\n`;
}

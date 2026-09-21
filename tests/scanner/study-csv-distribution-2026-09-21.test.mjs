// 2026-09-21. The reference-price study's Dataset schema now advertises a
// `distribution`, so a real file has to exist behind it and has to
// contain exactly what the page already publishes - nothing more.
//
// What this guards:
//   * the CSV carries no per-listing, per-seller or provider-response data
//   * every value in it comes from the frozen STUDY aggregate
//   * the schema never advertises a download the page does not offer
//   * the file states its own provenance, licence and limits, because a
//     CSV gets separated from the page that explains it
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STUDY } from "../../lib/studies/referencePriceChange30d.js";
import { studyCsv, studyRows, csvCell } from "../../lib/studies/referencePriceChangeCsv.js";

const csv = studyCsv();
const lines = csv.split("\n");
const comments = lines.filter((l) => l.startsWith("#"));
const dataLines = lines.filter((l) => l && !l.startsWith("#"));

test("the file states its own provenance, licence and limits", () => {
  const head = comments.join("\n");
  assert.match(head, /FIXED, DATED SNAPSHOT/i, "says it is never refreshed");
  assert.match(head, /NOT completed sales/i, "says what the observations are not");
  assert.match(head, /creativecommons\.org\/licenses\/by\/4\.0/, "states the licence");
  assert.match(head, /pokemondealfinder\.com\/market-data\//, "links back to the method");
  assert.ok(head.includes(STUDY.window.earlyTarget) && head.includes(STUDY.window.lateTarget), "states the window");
});

test("it is a well-formed CSV with a stable header", () => {
  assert.equal(dataLines[0], "section,group,metric,value,unit");
  const cols = dataLines[0].split(",").length;
  // Count commas OUTSIDE quotes. A naive split miscounts quoted fields,
  // and a regex that filters empty matches silently drops trailing empty
  // fields - which is what made the first version of this test fail on a
  // perfectly valid row.
  const fieldCount = (line) => {
    let n = 1;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) n++;
    }
    return n;
  };
  for (const [i, line] of dataLines.entries()) {
    assert.equal(fieldCount(line), cols, `row ${i} has ${fieldCount(line)} fields, expected ${cols}: ${line.slice(0, 80)}`);
  }
});

test("every published headline figure appears in the file", () => {
  const values = studyRows().map((r) => String(r[3]));
  for (const v of [
    STUDY.overall.median,
    STUDY.overall.up,
    STUDY.overall.down,
    STUDY.overall.flat,
    STUDY.pooled.median,
    STUDY.pooled.variants,
    STUDY.coverage.products,
    STUDY.coverage.eligibleVariants,
  ]) {
    assert.ok(values.includes(String(v)), `missing published figure ${v}`);
  }
});

test("it contains NO per-listing, per-seller or provider-response data", () => {
  const forbidden = [
    /listing_id/i, /seller/i, /ebay/i, /affiliate/i, /api[_-]?key/i, /token/i,
    /quota/i, /response_body/i, /email/i,
  ];
  for (const re of forbidden) {
    assert.doesNotMatch(csv, re, `CSV must not contain ${re}`);
  }
});

test("csvCell follows RFC 4180 for commas, quotes and newlines", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("the route is static and serves CSV, running no query", () => {
  const route = readFileSync(
    new URL("../../app/market-data/pokemon-reference-price-changes.csv/route.js", import.meta.url),
    "utf8"
  );
  assert.match(route, /export const dynamic = "force-static"/, "must not be dynamic");
  assert.match(route, /text\/csv/, "serves CSV");
  assert.doesNotMatch(route, /supabase|fetch\(|createClient/i, "must not query anything");
});

test("the schema only advertises the download because the page offers it", () => {
  const page = readFileSync(
    new URL("../../app/market-data/pokemon-reference-price-changes/page.js", import.meta.url),
    "utf8"
  );
  assert.match(page, /distribution: dataDownload\(/, "Dataset declares a distribution");
  assert.match(page, /href=\{CSV_PATH\}/, "and the page renders a visible link to it");
  // Same constant in both places, so they cannot drift apart.
  assert.match(page, /const CSV_PATH = "\/market-data\/pokemon-reference-price-changes\.csv"/);
});

test("the integrity Dataset still advertises no download, because it has no file", () => {
  const page = readFileSync(new URL("../../app/integrity/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(page, /distribution:/, "must not claim a file that does not exist");
});

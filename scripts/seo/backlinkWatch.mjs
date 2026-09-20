#!/usr/bin/env node
// Backlink watch (2026-09-21). Reads the referring-domain list for our
// domain, compares it with the last recorded snapshot, and reports what
// is NEW or LOST since then. Read-only against DataForSEO; the snapshot
// is a JSON file in the repo, so the history is reviewable in git.
//
//   node scripts/seo/backlinkWatch.mjs            # compare, print, do not write
//   node scripts/seo/backlinkWatch.mjs --save     # compare, print, write the new snapshot
//   node scripts/seo/backlinkWatch.mjs --budget=0.10
//
// Cost: one /backlinks/referring_domains/live call, about $0.02 a run.
// At weekly cadence that is roughly $1 a year.
//
// AUTO-GENERATED LISTINGS. The first three "referring domains" this site
// ever received were one scraper network publishing the same path on three
// unrelated hosts (see docs/seo/growth-backlog-2026-09.md, 21 Sep). A
// domain is flagged `likely_auto` when its linking page path matches that
// shape - it is still reported, never silently dropped, because the
// judgement of what counts as earned is the reader's.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { postWithRetry, ledger, firstResult, balance } from "./dataforseo.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const TARGET = args.target ?? "pokemondealfinder.com";
const SNAPSHOT = args.snapshot ?? "docs/seo/backlink-snapshot.json";
const SAVE = "save" in args;
const led = ledger(Number(args.budget ?? 0.10));

// The scraper shape seen on 2026-08-30: /list/<date>-<n>, no anchor text.
const AUTO_PATH = /\/list\/\d{4}-\d{2}-\d{2}-\d+\/?$/;

function loadSnapshot() {
  if (!existsSync(SNAPSHOT)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  } catch (e) {
    console.error(`  ! snapshot unreadable (${e.message}); treating as first run`);
    return null;
  }
}

const j = await postWithRetry(
  "/backlinks/referring_domains/live",
  [{ target: TARGET, limit: 500, order_by: ["backlinks,desc"], exclude_internal_backlinks: true }],
  { ledger: led }
);
const { error, result } = firstResult(j);
if (error) {
  console.error(`  x referring_domains failed: ${error}`);
  process.exit(1);
}

const items = result?.items ?? [];
const current = items.map((i) => ({
  domain: i.domain,
  backlinks: i.backlinks ?? null,
  firstSeen: (i.first_seen ?? "").slice(0, 10),
  lastSeen: (i.last_seen ?? "").slice(0, 10),
  rank: i.rank ?? null,
})).sort((a, b) => a.domain.localeCompare(b.domain));

const prev = loadSnapshot();
const prevDomains = new Set((prev?.domains ?? []).map((d) => d.domain));
const currDomains = new Set(current.map((d) => d.domain));
const added = current.filter((d) => !prevDomains.has(d.domain));
const lost = (prev?.domains ?? []).filter((d) => !currDomains.has(d.domain));

console.log(`target: ${TARGET}`);
console.log(`referring domains now: ${current.length}${prev ? ` (was ${prev.domains.length} on ${prev.at.slice(0, 10)})` : " (first run - no previous snapshot)"}`);

if (added.length) {
  console.log(`\nNEW since last snapshot (${added.length}):`);
  for (const d of added) console.log(`  + ${d.domain}  backlinks=${d.backlinks}  rank=${d.rank}  first seen ${d.firstSeen}`);
} else if (prev) {
  console.log("\nNEW: none");
}
if (lost.length) {
  console.log(`\nLOST since last snapshot (${lost.length}):`);
  for (const d of lost) console.log(`  - ${d.domain}  (was ${d.backlinks} backlink(s))`);
}

// Flag the known auto-generated shape so a run never reads as progress
// when it is not. One extra call only when there is something new.
if (added.length) {
  try {
    const bl = await postWithRetry(
      "/backlinks/backlinks/live",
      [{ target: TARGET, limit: 100, mode: "as_is", filters: [["domain_from", "in", added.map((d) => d.domain)]] }],
      { ledger: led }
    );
    const links = firstResult(bl).result?.items ?? [];
    const auto = links.filter((l) => AUTO_PATH.test(String(l.url_from ?? "")) && !String(l.anchor ?? "").trim());
    if (auto.length) {
      console.log(`\n  note: ${auto.length} of the new link(s) match the known auto-generated listing shape (/list/<date>-<n>, no anchor):`);
      for (const l of auto.slice(0, 10)) console.log(`        ${l.domain_from} ${l.url_from}`);
      console.log("        Those are scraper listings, not earned references.");
    }
    const earned = links.filter((l) => !auto.includes(l));
    if (earned.length) {
      console.log(`\n  EARNED-LOOKING (${earned.length}) - worth a look:`);
      for (const l of earned.slice(0, 10)) console.log(`        ${l.domain_from} | ${String(l.url_from).slice(0, 80)} | anchor: ${String(l.anchor ?? "").slice(0, 40)}`);
    }
  } catch (e) {
    console.log(`  (could not classify the new links: ${e.message.slice(0, 60)})`);
  }
}

if (SAVE) {
  mkdirSync(dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, JSON.stringify({ at: new Date().toISOString(), target: TARGET, total: current.length, domains: current }, null, 2));
  console.log(`\nsnapshot written: ${SNAPSHOT}`);
} else if (added.length || lost.length || !prev) {
  console.log("\n(run again with --save to record this as the new baseline)");
}
console.log(`\nspent: $${led.spentUsd.toFixed(4)} | balance: $${(await balance())?.balance}`);

#!/usr/bin/env node
// SHIPPING-COST STUDY - step 1 of 2: FREEZE THE INPUTS. READ-ONLY.
//
//   node scripts/studies/freezeShippingCostInput.mjs
//
// Writes a sanitised, line-delimited snapshot of the rows the study will
// be computed from, plus a manifest carrying the observation cutoff, the
// row count and a SHA-256 digest of the snapshot. Step 2
// (buildShippingCostStudy.mjs) reads ONLY that file and touches no
// database.
//
// WHY THIS EXISTS. Revision 2 of this study computed its figures directly
// from live `deals` rows and froze only the AGGREGATES. `deals` prices are
// overwritten in place and `is_active` changes constantly, so once the run
// finished its inputs were gone: the published result could not be
// re-derived by anyone, including us. Frozen aggregates are not
// reproducibility - they are just a number that cannot be checked. A
// snapshot is only reproducible if the INPUTS are retained.
//
// WHERE THE EVIDENCE GOES, AND WHAT IS IN IT. `.local/` is gitignored and
// is not served by the site, so the frozen rows stay a private project
// artifact: they are never published, never committed, and never reach a
// public bucket. Only the digest, the row count and the cutoff are
// published, which is what lets a figure be tied to an input set without
// republishing the input set.
//
// The snapshot carries the MINIMUM needed to re-derive eligibility,
// grouping, exclusions and arithmetic, and nothing else. Deliberately
// absent: seller usernames and feedback, listing and affiliate URLs,
// image URLs, internal row ids and raw listing ids. The listing id is
// reduced to a salted digest, which is enough to prove the deduplication
// was one-per-listing without carrying an identifier back to a seller or
// a live page.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OUT_DIR = join(".local", "studies");
const cutoff = new Date().toISOString();
// Per-snapshot salt, kept in the manifest beside the rows. It exists so
// the hashed listing keys are stable WITHIN a snapshot (which is all the
// deduplication check needs) without being a stable identifier across
// snapshots or lookupable against a live listing.
const salt = randomBytes(16).toString("hex");
const keyOf = (v) => createHash("sha256").update(`${salt}:${v}`).digest("hex").slice(0, 16);

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("deals")
    .select(
      "id,listing_id,listing_type,marketplace,currency,price,shipping,total_price,card_tcgplayer_id,card_language,condition,is_graded,grader,grade,is_local,title"
    )
    .eq("is_active", true)
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  rows.push(...data);
  if (data.length < 1000) break;
}

// The catalogue's own printing for each product in the sample, joined in
// NOW so the offline step needs no database of its own.
const ids = [...new Set(rows.map((r) => r.card_tcgplayer_id).filter(Boolean))].map(Number).filter(Number.isFinite);
const catalogPrinting = new Map();
for (let i = 0; i < ids.length; i += 300) {
  const { data, error } = await db
    .from("card_catalog")
    .select("tcgplayer_id, market_printing")
    .in("tcgplayer_id", ids.slice(i, i + 300));
  if (error) throw new Error(error.message);
  for (const c of data ?? []) catalogPrinting.set(String(c.tcgplayer_id), c.market_printing ?? null);
}

const frozen = rows.map((r) => ({
  k: keyOf(r.listing_id || `row:${r.id}`),
  type: r.listing_type ?? null,
  mk: r.marketplace ?? null,
  cur: r.currency ?? null,
  p: r.price === null || r.price === undefined ? null : Number(r.price),
  s: r.shipping === null || r.shipping === undefined ? null : Number(r.shipping),
  t: r.total_price === null || r.total_price === undefined ? null : Number(r.total_price),
  cid: r.card_tcgplayer_id === null || r.card_tcgplayer_id === undefined ? null : String(r.card_tcgplayer_id),
  lang: r.card_language ?? null,
  cond: r.condition ?? null,
  graded: Boolean(r.is_graded),
  grader: r.grader ?? null,
  grade: r.grade ?? null,
  local: Boolean(r.is_local),
  // the listing's own words - the only thing the printing rules accept as
  // evidence of a finish (lib/printingMatch). A public listing title.
  title: r.title ?? null,
  // the catalogue's single recorded printing for this product id
  cp: r.card_tcgplayer_id ? catalogPrinting.get(String(r.card_tcgplayer_id)) ?? null : null,
}));

// Stable order, so the digest depends on the CONTENT and not on the order
// the database happened to page the rows back in.
frozen.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));

const body = frozen.map((r) => JSON.stringify(r)).join("\n") + "\n";
const digest = createHash("sha256").update(body).digest("hex");
const stamp = cutoff.replace(/[:.]/g, "-");
const rowsPath = join(OUT_DIR, `shipping-cost-${stamp}.rows.jsonl`);
const manifestPath = join(OUT_DIR, `shipping-cost-${stamp}.manifest.json`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(rowsPath, body, "utf8");
writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      study: "shipping-cost",
      observationCutoff: cutoff,
      frozenAt: cutoff,
      inputCount: frozen.length,
      inputDigest: digest,
      digestAlgorithm: "sha256",
      rowsFile: rowsPath.replace(/\\/g, "/"),
      salt,
      note:
        "Private project evidence. Never published, never committed (.local is gitignored), " +
        "no seller identity, no URLs, no raw listing ids. Step 2 computes the study from this " +
        "file alone and makes no database or provider call.",
    },
    null,
    2
  ) + "\n",
  "utf8"
);

process.stderr.write(
  `frozen ${frozen.length} rows\n  rows:     ${rowsPath}\n  manifest: ${manifestPath}\n  cutoff:   ${cutoff}\n  sha256:   ${digest}\n`
);
process.stdout.write(`${manifestPath}\n`);

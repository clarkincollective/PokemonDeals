// node scripts/upgradeCatalogImages.js [--apply]
//
// One-time: rewrite card_catalog.image_url (and sealed_catalog.image_url)
// from TCGplayer's `_in_200x200` thumbnail (~144x200) to `_in_1000x1000`
// (the largest real derivative of the SAME product image - ~325x450 for
// old vintage scans up to ~1000px for modern cards). Same product id, same
// printing - never a different card. See lib/cardImage.
//
// Pure string transform, fully reversible. Dry run by default.
//
// FASTER: run this instead in the Supabase SQL editor (one statement):
//   UPDATE card_catalog
//     SET image_url = replace(image_url, '_in_200x200.jpg', '_in_1000x1000.jpg')
//     WHERE image_url LIKE '%\_in\_200x200.jpg' ESCAPE '\';
//   UPDATE sealed_catalog
//     SET image_url = replace(image_url, '_in_200x200.jpg', '_in_1000x1000.jpg')
//     WHERE image_url LIKE '%\_in\_200x200.jpg' ESCAPE '\';
// This script is the no-SQL-access fallback + the verifier.

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const { upgradeCatalogImage } = require("../lib/cardImage");

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const log = (...a) => console.log(...a);

async function run(table, pk) {
  const { count } = await db
    .from(table)
    .select(pk, { count: "exact", head: true })
    .like("image_url", "%_in_200x200.jpg");
  log(`\n${table}: ${count ?? 0} rows with a _in_200x200 image`);
  if (!count) return { table, upgraded: 0 };

  let upgraded = 0;
  let sampledBefore = null;
  let sampledAfter = null;
  for (;;) {
    const { data, error } = await db
      .from(table)
      .select(`${pk}, image_url`)
      .like("image_url", "%_in_200x200.jpg")
      .limit(1000);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    const jobs = [];
    for (const row of data) {
      const next = upgradeCatalogImage(row.image_url);
      if (next === row.image_url) continue;
      if (!sampledBefore) {
        sampledBefore = row.image_url;
        sampledAfter = next;
      }
      upgraded++;
      if (APPLY) jobs.push({ id: row[pk], next });
    }
    if (APPLY && jobs.length) {
      // parallel pool - each row has its own target URL so no batch update
      const POOL = 24;
      for (let i = 0; i < jobs.length; i += POOL) {
        await Promise.all(
          jobs.slice(i, i + POOL).map(({ id, next }) =>
            db.from(table).update({ image_url: next }).eq(pk, id).then(({ error: e }) => {
              if (e) throw new Error(e.message);
            })
          )
        );
      }
      process.stdout.write(`  ...${upgraded}\r`);
    }
    if (!APPLY) break; // dry run: one page is enough to preview
  }
  log(`  sample: ${sampledBefore}\n       -> ${sampledAfter}`);
  log(APPLY ? `  upgraded ${upgraded}` : `  (dry run - re-run with --apply; would upgrade ${count})`);
  return { table, upgraded: APPLY ? upgraded : count };
}

(async () => {
  const results = [];
  results.push(await run("card_catalog", "tcgplayer_id"));
  // sealed_catalog may not exist / may use a different pk
  try {
    results.push(await run("sealed_catalog", "tcgplayer_id"));
  } catch (e) {
    log(`\nsealed_catalog: skipped (${e.message})`);
  }
  log(`\n==== ${APPLY ? "DONE" : "DRY RUN"} ====`);
  for (const r of results) log(`  ${r.table}: ${r.upgraded}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

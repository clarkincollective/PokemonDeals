#!/usr/bin/env node
// PRESERVATION - verify the raw capture files line by line (2026-09-26).
//
//   node scripts/preservation/verifyCaptures.mjs <dir> [<dir2> ...]
//
// backup.mjs --verify covers the fourteen table files against manifest.json.
// The capture files it does not know about are verified here, from their
// own bytes, in every directory given (so a mirror is proven independently):
//   - percard.part*.ndjson.gz : gunzip streams, EVERY line parses as JSON,
//     every line's `body` parses as JSON with a `data` object, line count
//     equals the part's summary.json `saved`, ids are unique across parts
//     and equal percard.done.json
//   - printings-export.staged.ndjson.gz : every line parses, count equals
//     the export manifest's staged.rows; raw .csv.gz sha256 equals manifest
// Read-only. No provider request. Exit 1 on any failure.
import { createReadStream, readFileSync, readdirSync, existsSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { join } from "node:path";

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error("  usage: verifyCaptures.mjs <dir> [<dir2> ...]");
  process.exit(2);
}
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

async function lines(path, onLine) {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (!line) continue;
    n++;
    onLine(JSON.parse(line), n);
  }
  return n;
}

let bad = 0;
for (const dir of dirs) {
  console.log(`\n${dir}`);
  const parts = readdirSync(dir).filter((f) => /^percard\.part\d+\.ndjson\.gz$/.test(f)).sort();
  const ids = new Set();
  let totalSaved = 0;
  for (const f of parts) {
    const sum = JSON.parse(readFileSync(join(dir, f.replace(".ndjson.gz", ".summary.json")), "utf8"));
    let bodiesOk = 0;
    let n = 0;
    try {
      n = await lines(join(dir, f), (o) => {
        const b = JSON.parse(o.body);
        if (b && typeof b === "object" && b.data && typeof b.data === "object") bodiesOk++;
        ids.add(`${o.tcgPlayerId}|${o.language}`);
      });
    } catch (e) {
      console.log(`  FAIL ${f}: ${e.message.slice(0, 80)}`);
      bad++;
      continue;
    }
    totalSaved += sum.saved;
    const ok = n === sum.saved && bodiesOk === n;
    if (!ok) bad++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${f.padEnd(28)} lines ${String(n).padStart(5)} / summary saved ${String(sum.saved).padStart(5)}   bodies with data ${bodiesOk}`);
  }
  const done = JSON.parse(readFileSync(join(dir, "percard.done.json"), "utf8")).ids;
  const doneSet = new Set(done);
  const idsOk = ids.size === totalSaved && done.length === ids.size && [...ids].every((k) => doneSet.has(k));
  if (!idsOk) bad++;
  console.log(`  ${idsOk ? "ok  " : "FAIL"} unique ids across parts ${ids.size}  = total saved ${totalSaved}  = done.json ${done.length}`);

  const man = JSON.parse(readFileSync(join(dir, "printings-export.manifest.json"), "utf8"));
  const rawDigest = sha256(join(dir, man.raw.file));
  const rawOk = rawDigest === man.raw.sha256;
  if (!rawOk) bad++;
  console.log(`  ${rawOk ? "ok  " : "FAIL"} ${man.raw.file.padEnd(28)} sha256 ${rawOk ? "match" : "MISMATCH"}`);
  let stagedN = 0;
  try {
    stagedN = await lines(join(dir, man.staged.file), () => {});
  } catch (e) {
    console.log(`  FAIL ${man.staged.file}: ${e.message.slice(0, 80)}`);
    bad++;
  }
  const stagedOk = stagedN === man.staged.rows && sha256(join(dir, man.staged.file)) === man.staged.sha256;
  if (!stagedOk) bad++;
  console.log(`  ${stagedOk ? "ok  " : "FAIL"} ${man.staged.file.padEnd(28)} lines ${stagedN} / manifest ${man.staged.rows}  digest ${stagedOk ? "match" : "MISMATCH"}`);
  for (const f of ["import-history.write.summary.json", "manifest.json"]) {
    const present = existsSync(join(dir, f));
    if (!present) bad++;
    console.log(`  ${present ? "ok  " : "FAIL"} ${f} present`);
  }
}
console.log(bad ? `\n  ${bad} check(s) FAILED` : "\n  all capture files verified");
process.exit(bad ? 1 : 0);

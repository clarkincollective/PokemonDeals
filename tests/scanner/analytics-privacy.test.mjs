// Phase 13A - the privacy contract, enforced by scanning the tree.
//
//  * no capture() call passes raw query text / email / free-text keys
//  * AffiliateLink never mutates the affiliate destination or its EPN /
//    Impact parameters, and never blocks navigation
//  * the analytics client gates on Do Not Track and on the presence of a
//    key (hard no-op otherwise)
//  * session storage use is limited to the disclosed first-party keys

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.jsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const FILES = [...walk("app"), ...walk("components"), ...walk("lib")];

// crude but effective: pull the argument blob of every capture(...) call
// and every data-analytics-props={...} literal and check it for
// sensitive keys / obvious raw-text forwarding.
function captureArgBlobs(src) {
  const blobs = [];
  const re = /capture\s*\(\s*[^,]+,\s*({[\s\S]*?})\s*\)/g;
  let m;
  while ((m = re.exec(src))) blobs.push(m[1]);
  const re2 = /data-analytics-props=\{JSON\.stringify\(([\s\S]*?)\)\}/g;
  while ((m = re2.exec(src))) blobs.push(m[1]);
  return blobs;
}

const FORBIDDEN_KEY_RE =
  /(^|[\s{,])(email|e_mail|user_email|alert_email|name|first_name|last_name|full_name|query|q|search_query|search_term|raw_query|text|message|body|clipboard|password|token|seller|seller_id|ip_address|affiliate_id|campid)\s*:/i;

test("no capture()/data-analytics-props blob contains a sensitive key", () => {
  const offenders = [];
  for (const f of FILES) {
    const src = stripComments(read(f));
    for (const blob of captureArgBlobs(src)) {
      if (FORBIDDEN_KEY_RE.test(blob)) offenders.push(`${f} :: ${blob.slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [], `sensitive key in analytics payload:\n${offenders.join("\n")}`);
});

test("no capture() object-literal argument forwards a raw query value", () => {
  const offenders = [];
  // a property whose VALUE is a bare query-ish identifier:  key: q   /   query: someVar
  const RAW_VALUE_RE =
    /(?:^|[\s{,])(?:[a-z_]+)\s*:\s*(q|query|rawQuery|queryText|searchText|term|rawText)\b/i;
  const KEY_RE = /(?:^|[\s{,])(query|q|rawQuery|queryText|searchText|term|rawText)\s*:/i;
  for (const f of FILES) {
    const src = stripComments(read(f));
    for (const blob of captureArgBlobs(src)) {
      if (RAW_VALUE_RE.test(blob) || KEY_RE.test(blob)) {
        offenders.push(`${f} :: ${blob.replace(/\s+/g, " ").slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("AffiliateLink does not mutate href or affiliate params, and does not block navigation", () => {
  const src = read("components/AffiliateLink.js");
  // href is passed straight to <a href={href}>
  assert.match(src, /<a\s+[\s\S]*?href=\{href\}/);
  // no rewriting of EPN / Impact params
  assert.doesNotMatch(src, /campid|mkcid|mkrid|mkevt|customid|\.replace\(\s*\/.*(campid|mkcid)/i);
  // click handler swallows analytics errors (try/catch around capture)
  assert.match(src, /try\s*\{[\s\S]*capture\(/);
  // navigation is a normal anchor - no preventDefault / router.push in the handler
  assert.doesNotMatch(src, /preventDefault\(\)|router\.push|window\.location\s*=/);
});

test("analytics client hard-no-ops without a key and respects Do Not Track", () => {
  const src = read("lib/analytics/client.js");
  assert.match(src, /analyticsEnabled\(\)/);
  assert.match(src, /isDoNotTrackEnabled\(\)/);
  // dynamic import so posthog-js is off the critical path
  assert.match(src, /import\(\s*["']posthog-js["']\s*\)/);
  assert.match(src, /requestIdleCallback|setTimeout\(start/);
});

test("session helper references no pdf:* storage key at all", () => {
  const src = read("lib/analytics/session.js");
  assert.equal([...src.matchAll(/["']pdf:[a-zA-Z]+["']/g)].length, 0, "session.js still names a pdf:* storage key");
});

test("privacy page discloses PostHog + cookieless + DNT and NO LONGER lists the removed analytics storage", () => {
  const src = read("app/privacy/page.js");
  assert.match(src, /PostHog/);
  assert.match(src, /cookieless/i);
  assert.match(src, /Global Privacy Control|Do Not Track/i);
  assert.doesNotMatch(src, /pdf:firstSeen|pdf:attribution|first seen/i);
});

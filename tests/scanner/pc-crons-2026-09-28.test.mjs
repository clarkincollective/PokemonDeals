// Scheduled jobs on the owner's PC (28 Sep 2026): crons.json is the one list
// of jobs; those with host "pc" run on the PC (scripts/crons/runJob.mjs via
// Task Scheduler), those with host "vercel" stay Vercel crons and vercel.json
// must list exactly them. The route code is unchanged either way.
//
//   node --test tests/scanner/pc-crons-2026-09-28.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const { cronMatches, dueMinutes, parseCron } = await import(new URL("../../scripts/crons/cronMatch.mjs", import.meta.url).href);
const crons = JSON.parse(read("crons.json"));
const vercel = JSON.parse(read("vercel.json"));

test("PC-1 vercel.json lists exactly the crons.json entries kept on Vercel, in order", () => {
  const kept = crons.crons.filter((c) => c.host === "vercel").map(({ path, schedule }) => ({ path, schedule }));
  assert.deepEqual(vercel.crons ?? [], kept);
  for (const c of crons.crons) assert.ok(["pc", "vercel"].includes(c.host), `${c.path}: host`);
});

test("PC-2 every scheduled path has a route file and a parseable schedule; PC jobs need no Vercel-only secret", () => {
  const vercelOnly = /RESEND_API_KEY|ALERT_FROM_EMAIL|SOCIAL_ALERT_EMAIL|BUFFER_ACCESS_TOKEN|SOCIAL_BUFFER|OUTREACH_AUTOMATION_ENABLED/;
  for (const c of crons.crons) {
    const routeFile = join(REPO, "app", ...new URL(c.path, "https://x").pathname.split("/").filter(Boolean), "route.js");
    assert.ok(existsSync(routeFile), `${c.path}: route file`);
    assert.doesNotThrow(() => parseCron(c.schedule), `${c.path}: schedule "${c.schedule}"`);
    if (c.host === "pc") {
      const src = read(routeFile.slice(REPO.length + 1).replace(/\\/g, "/"));
      assert.doesNotMatch(src, vercelOnly, `${c.path}: reads a Vercel-only secret directly and must stay on Vercel until the PC has it`);
    }
  }
  assert.equal(crons.pcEnv.BROWSE_BUDGET_MODE, "observe", "production's ledger rows are browse_budget_observe:*");
});

test("PC-3 the cron matcher fires exactly when Vercel's would (UTC)", () => {
  const t = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi);
  assert.equal(cronMatches("*/15 * * * *", t(2026, 9, 28, 4, 20)), false);
  assert.equal(cronMatches("*/15 * * * *", t(2026, 9, 28, 4, 45)), true);
  assert.equal(cronMatches("*/30 * * * *", t(2026, 9, 28, 4, 30)), true);
  assert.equal(cronMatches("20 4 * * *", t(2026, 9, 28, 4, 20)), true);
  assert.equal(cronMatches("5 */2 * * *", t(2026, 9, 28, 4, 5)), true);
  assert.equal(cronMatches("5 */2 * * *", t(2026, 9, 28, 5, 5)), false);
  assert.equal(cronMatches("0 16 * * 2", t(2026, 9, 28, 16, 0)), false, "Monday");
  assert.equal(cronMatches("0 16 * * 2", t(2026, 9, 29, 16, 0)), true, "Tuesday");
  assert.equal(cronMatches("0 20 * * 6,2", t(2026, 10, 3, 20, 0)), true, "Saturday");
  assert.equal(cronMatches("30 11,23 * * *", t(2026, 9, 28, 23, 30)), true);
  assert.equal(cronMatches("0 15 * * 1", t(2026, 9, 28, 15, 0)), true, "Monday 15:00");
  assert.deepEqual(dueMinutes("*/15 * * * *", t(2026, 9, 28, 4, 10), t(2026, 9, 28, 4, 31)).map((m) => new Date(m).toISOString().slice(11, 16)), ["04:15", "04:30"]);
  assert.throws(() => parseCron("* * * *"));
  assert.throws(() => parseCron("60 * * * *"));
});

test("PC-4 the runner invokes the route like Vercel's scheduler and hands cache expiries to the site", () => {
  const run = read("scripts/crons/runJob.mjs");
  assert.match(run, /authorization: `Bearer \$\{process\.env\.CRON_SECRET\}`/);
  assert.match(run, /flushRevalidations\(/);
  assert.match(run, /maxDuration \+ 60/, "the route's own duration cap");
  const hooks = read("scripts/crons/hooks.mjs");
  assert.match(hooks, /specifier === "next\/cache"/);
  assert.doesNotMatch(hooks, /@\/lib\/ebay"|@\/lib\/supabaseAdmin|@\/lib\/pokemonPriceTracker/, "no provider is stubbed - production modules only");
  const route = read("app/api/revalidate/route.js");
  assert.match(route, /Bearer \$\{process\.env\.CRON_SECRET\}/);
  assert.match(route, /revalidateTag\(t, t === BOARD_DEALS_TAG \? "max" : \{ expire: 0 \}\)/, "hard expiry for every tag except the board index (28 Sep 2026: stale-while-revalidate)");
  const shim = read("scripts/crons/nextCacheShim.mjs");
  assert.match(shim, /\/api\/revalidate/);
});

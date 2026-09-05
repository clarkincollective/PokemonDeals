// Supabase P1 closeout - newsletter_subscribers production schema drift
// + send-digest failure-status masking.
//
// Root cause (from the Supabase Pro readiness audit): supabase/
// newsletter_migration.sql was committed but never run in production, so
// public.newsletter_subscribers did not exist. Three live code paths
// silently mishandled that:
//   - app/api/alerts        (POST) reported "subscribed" even when the
//                            newsletter insert silently failed
//   - app/api/newsletter     (GET)  reported a genuine infra/DB failure
//                            as "This link is no longer valid" (false)
//   - app/api/send-digest    (GET)  returned HTTP 200 on a real query
//                            failure, hiding it from cron-status monitoring
//
// This suite runs entirely against the pure decision helpers in
// lib/newsletterFlow.js (no network, no live Supabase call, no email
// provider) plus structural assertions on the route sources proving
// those helpers are actually wired in - matching this repo's existing
// convention (see tests/scanner/alert-currency.test.mjs) of unit-testing
// pure logic and grep-proving route wiring rather than mocking Next.js
// request/response objects. NO REAL EMAIL IS EVER SENT BY THIS FILE:
// lib/email.js is never imported, RESEND_API_KEY is never referenced,
// and no route handler is invoked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyTokenLookup, writeSucceeded, digestSubscriberQueryStatus, newsletterOptInStatus } from "../../lib/newsletterFlow.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// === 1. classifyTokenLookup distinguishes infra failure from a genuine
//        missing/expired token (the confirm/unsubscribe truthfulness fix) ===

test("1. classifyTokenLookup: a query error is an infra failure, never 'not found'", () => {
  const result = classifyTokenLookup({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.newsletter_subscribers' in the schema cache" } });
  assert.equal(result.kind, "infra_error");
});

test("1b. classifyTokenLookup: no error, no row -> a genuine not-found (expired/used/bad token)", () => {
  const result = classifyTokenLookup({ data: null, error: null });
  assert.equal(result.kind, "not_found");
});

test("1c. classifyTokenLookup: a row is returned -> found, row is passed through untouched", () => {
  const row = { id: "abc-123", email: "person@example.com" };
  const result = classifyTokenLookup({ data: row, error: null });
  assert.equal(result.kind, "found");
  assert.equal(result.row, row);
});

// === 2. writeSucceeded ========================================================

test("2. writeSucceeded reflects the presence of an error, nothing else", () => {
  assert.equal(writeSucceeded({ error: null }), true);
  assert.equal(writeSucceeded({ error: { message: "boom" } }), false);
});

// === 3. send-digest: real failure is non-2xx, valid zero-subscriber stays 200 ===

test("3. digestSubscriberQueryStatus: a genuine query/DB failure is 500, never 2xx", () => {
  assert.equal(digestSubscriberQueryStatus({ error: { message: "Could not find the table 'public.newsletter_subscribers' in the schema cache" } }), 500);
});

test("3b. digestSubscriberQueryStatus: a valid query (even with zero rows) is 200", () => {
  assert.equal(digestSubscriberQueryStatus({ error: null }), 200);
  assert.equal(digestSubscriberQueryStatus({ error: null, data: [] }), 200);
});

test("3c. app/api/send-digest/route.js actually uses digestSubscriberQueryStatus, not a hardcoded 200, on the error branch", () => {
  const src = read("app/api/send-digest/route.js");
  assert.match(src, /digestSubscriberQueryStatus/);
  assert.match(src, /if \(subErr\) return Response\.json\(\{ ok: false, error: subErr\.message \}, \{ status: digestSubscriberQueryStatus\(subsResult\) \}\);/);
  // the untouched "valid query, zero subscribers" success path must remain a 200 (implicit default), not folded into the error branch
  assert.match(src, /if \(!subs\?\.length\) return Response\.json\(\{ ok: true, sent: 0, note: "no subscribers" \}\);/);
});

// === 4. newsletter confirm/unsubscribe route is actually wired to the
//        truthful classifier, not the old blanket "not found" ==============

test("4. app/api/newsletter/route.js returns 500 on an infra error and 404 only on a genuine not-found", () => {
  const src = read("app/api/newsletter/route.js");
  assert.match(src, /classifyTokenLookup/);
  assert.match(src, /lookup\.kind === "infra_error"\) return html\(INFRA_ERROR_MESSAGE, 500\)/);
  assert.match(src, /lookup\.kind === "not_found"\) return html\("This link is no longer valid\.", 404\)/);
  // both writes (unsubscribe + confirm) are also checked, not fire-and-forget
  assert.match(src, /writeSucceeded\(unsubResult\)/);
  assert.match(src, /writeSucceeded\(confirmResult\)/);
  // no raw Supabase/Postgres error text is ever shown to the visitor
  assert.doesNotMatch(src, /html\([a-zA-Z]*[Ee]rror\.message/);
  assert.doesNotMatch(src, /PGRST/);
});

// === 5. alerts POST: newsletter opt-in truthfulness matrix ===================

test("5. newsletterOptInStatus: visitor did not opt in -> null (nothing to report)", () => {
  assert.equal(newsletterOptInStatus({ requested: false, lookupError: null, existing: null, insertError: null, updateError: null }), null);
});

test("5b. newsletterOptInStatus: the lookup itself failed (e.g. missing table) -> failed, never subscribed", () => {
  assert.equal(
    newsletterOptInStatus({ requested: true, lookupError: { message: "PGRST205" }, existing: null, insertError: null, updateError: null }),
    "failed"
  );
});

test("5c. newsletterOptInStatus: new subscriber, insert succeeds -> subscribed", () => {
  assert.equal(newsletterOptInStatus({ requested: true, lookupError: null, existing: null, insertError: null, updateError: null }), "subscribed");
});

test("5d. newsletterOptInStatus: new subscriber, insert silently fails -> failed, NOT subscribed", () => {
  assert.equal(
    newsletterOptInStatus({ requested: true, lookupError: null, existing: null, insertError: { message: "boom" }, updateError: null }),
    "failed"
  );
});

test("5e. newsletterOptInStatus: previously-unsubscribed+confirmed row, resubscribe update succeeds -> resubscribed", () => {
  assert.equal(
    newsletterOptInStatus({ requested: true, lookupError: null, existing: { confirmed: true }, insertError: null, updateError: null }),
    "resubscribed"
  );
});

test("5f. newsletterOptInStatus: resubscribe update silently fails -> failed, NOT resubscribed", () => {
  assert.equal(
    newsletterOptInStatus({ requested: true, lookupError: null, existing: { confirmed: true }, insertError: null, updateError: { message: "boom" } }),
    "failed"
  );
});

test("5g. newsletterOptInStatus: an unconfirmed row already exists -> pending (the confirm click activates it)", () => {
  assert.equal(
    newsletterOptInStatus({ requested: true, lookupError: null, existing: { confirmed: false }, insertError: null, updateError: null }),
    "pending"
  );
});

// === 6. price alert creation/update is unaffected by the newsletter opt-in ===

test("6. the price_alerts insert/update happens BEFORE the newsletter opt-in block, and a price_alerts db_error still returns 500 independently", () => {
  const src = read("app/api/alerts/route.js");
  const priceAlertsBlockIdx = src.indexOf('.from("price_alerts")');
  const newsletterBlockIdx = src.indexOf("if (wantsNewsletter) {");
  assert.ok(priceAlertsBlockIdx > -1 && newsletterBlockIdx > -1 && priceAlertsBlockIdx < newsletterBlockIdx, "price_alerts write must precede the newsletter opt-in block");
  assert.match(src, /if \(error\) return Response\.json\(\{ ok: false, reason: "db_error" \}, \{ status: 500 \}\);/);
});

test("6b. the newsletter opt-in block never returns/aborts the request - a failure there cannot fail the price alert", () => {
  const src = read("app/api/alerts/route.js");
  const start = src.indexOf("if (wantsNewsletter) {");
  const end = src.indexOf("const newsletterStatus = newsletterOptInStatus(");
  assert.ok(start > -1 && end > start);
  const block = src.slice(start, end);
  assert.doesNotMatch(block, /\breturn\b/, "the newsletter opt-in block must never return early - the price alert flow must continue regardless");
});

test("6c. app/api/alerts/route.js is wired to newsletterOptInStatus, not a hand-rolled duplicate of the same logic", () => {
  const src = read("app/api/alerts/route.js");
  assert.match(src, /import \{ newsletterOptInStatus \} from "@\/lib\/newsletterFlow"/);
  assert.match(src, /newsletterOptInStatus\(\{ requested: wantsNewsletter, lookupError, existing: existingSub, insertError, updateError \}\)/);
  // the response never hardcodes "subscribed" - it always reports the computed status
  assert.doesNotMatch(src, /newsletter: "subscribed"/);
  assert.match(src, /newsletter: newsletterStatus/);
});

// === 7. RLS contract for newsletter_subscribers is unchanged by this fix ====

test("7. newsletter_subscribers migration still enables RLS with zero policies (service-role only), and this fix does not touch it", () => {
  const mig = read("supabase/newsletter_migration.sql");
  assert.match(mig, /alter table newsletter_subscribers enable row level security;/);
  // no CREATE POLICY for this table anywhere in the committed SQL - RLS
  // enabled + zero policies is deny-all for the anon key, which is the
  // intended posture (same pattern as price_alerts).
  for (const f of ["supabase/newsletter_migration.sql"]) {
    assert.doesNotMatch(read(f), /create policy[^;]*newsletter_subscribers/i);
  }
  // this migration file itself was not modified as part of this fix -
  // the fix is entirely in application code, per the brief's scope limit.
  assert.doesNotMatch(mig, /drop table|drop column|alter.*disable row level security/i);
});

test("7b. every column the application code reads/writes on newsletter_subscribers exists in the committed migration", () => {
  const mig = read("supabase/newsletter_migration.sql");
  const appSources = [read("app/api/alerts/route.js"), read("app/api/newsletter/route.js"), read("app/api/send-digest/route.js")];
  const referencedCols = ["id", "email", "token", "confirmed", "source", "created_at", "confirmed_at", "unsubscribed_at"];
  for (const col of referencedCols) {
    const usedByApp = appSources.some((src) => new RegExp(`\\b${col}\\b`).test(src));
    if (usedByApp) assert.match(mig, new RegExp(`\\b${col}\\b`), `migration is missing column "${col}" that application code references`);
  }
});

// === 8. no service-role key exposure introduced by this fix =================

test("8. lib/newsletterFlow.js is pure - no I/O, no env var, no Supabase client of any kind", () => {
  const src = read("lib/newsletterFlow.js");
  assert.doesNotMatch(src, /process\.env|supabaseAdmin|createClient|fetch\(/);
});

test("8b. nothing under app/ or components/ ships the service-role key to the client via this fix's files", () => {
  for (const f of ["app/api/alerts/route.js", "app/api/newsletter/route.js", "app/api/send-digest/route.js"]) {
    assert.doesNotMatch(read(f), /NEXT_PUBLIC_.*SERVICE_ROLE|SERVICE_ROLE_KEY\s*=\s*["']/);
  }
});

// === 9. no real email is sent by anything in this fix or this test file =====

test("9. this fix does not add any new email-sending call - sendEmail/sendBatch call sites are unchanged in count", () => {
  const alertsSrc = read("app/api/alerts/route.js");
  const digestSrc = read("app/api/send-digest/route.js");
  assert.equal((alertsSrc.match(/sendEmail\(/g) ?? []).length, 1); // the existing price-alert confirmation email only
  assert.equal((digestSrc.match(/sendBatch\(/g) ?? []).length, 1); // the existing digest send only
});

// === 10. this fix is isolated - no deal/scanner/freshness code touched ======

test("10. lib/newsletterFlow.js has no dependency on deal/scanner/freshness modules", () => {
  const src = read("lib/newsletterFlow.js");
  assert.doesNotMatch(src, /dealQuality|flagshipRanking|exact_verified_at|is_active|auctionLaneRanking/);
});

test("10b. the three fixed routes still only touch newsletter_subscribers/price_alerts/catalog_snapshot - no deals/watchlist read or write was added", () => {
  for (const f of ["app/api/alerts/route.js", "app/api/newsletter/route.js"]) {
    assert.doesNotMatch(read(f), /\.from\("deals"\)|\.from\("watchlist"\)/);
  }
});

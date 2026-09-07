// Phase CRM-1 - email capture + return-visitor loop.
//
// Pure-logic unit tests + structural (grep) assertions on the routes and
// components, matching this repo's convention (see
// tests/scanner/newsletter-schema-drift-p1.test.mjs) of testing pure
// helpers and proving wiring, not mocking Next.js request/response.
//
// NO REAL EMAIL IS SENT: lib/email.js is never imported here,
// RESEND_API_KEY is never referenced, no route handler is invoked. No
// live Supabase call. No eBay call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  SUBSCRIBER_STATUS,
  SIGNUP_STATUS,
  CONSENT_VERSION,
  CONSENT_COPY,
  PRIMARY_CTA,
  normalizeEmail,
  isValidEmail,
  deriveStatus,
  isActive,
  canReceiveMail,
  cleanUtm,
  cleanSignupRoute,
  buildSignupRecord,
} from "../../lib/crm/subscribers.js";
import { honeypotTripped, rateLimit, _reset } from "../../lib/crm/signupGuard.js";
import { renderDigest, listUnsubscribeHeaders } from "../../lib/crm/digestTemplate.js";
import { summarizeSubscribers, summaryFromCounts } from "../../lib/crm/summary.js";
import { EVENTS, ALLOWED_EVENTS } from "../../lib/analytics/events.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ============================ email model ============================

test("CRM1-1 valid emails accepted, malformed rejected", () => {
  for (const ok of ["a@b.co", "First.Last@example.com", "x+tag@mail.example.io", " Foo@Bar.COM "]) {
    assert.equal(isValidEmail(ok), true, `should accept ${ok}`);
  }
  for (const bad of ["", "x", "no-at.example.com", "two@@x.com", "a@b", "a b@c.com", "a@b..com", "trailing space @x.com", null, undefined, 42]) {
    assert.equal(isValidEmail(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test("CRM1-2 normalizeEmail trims + lowercases (no plus-stripping)", () => {
  assert.equal(normalizeEmail("  Foo.Bar+News@Gmail.COM "), "foo.bar+news@gmail.com");
});

test("CRM1-3 status derivation: unsubscribe outranks confirmed; explicit status wins", () => {
  assert.equal(deriveStatus({ confirmed: false }), "PENDING");
  assert.equal(deriveStatus({ confirmed: true }), "ACTIVE");
  assert.equal(deriveStatus({ confirmed: true, unsubscribed_at: "2026-01-01" }), "UNSUBSCRIBED");
  assert.equal(deriveStatus({ status: "BOUNCED", confirmed: true }), "BOUNCED");
  assert.equal(deriveStatus({ status: "COMPLAINED" }), "COMPLAINED");
});

test("CRM1-4 an unsubscribed / bounced row is never ACTIVE or sendable", () => {
  const unsub = { confirmed: true, unsubscribed_at: "2026-02-02" };
  assert.equal(isActive(unsub), false);
  assert.equal(canReceiveMail(unsub), false);
  assert.equal(canReceiveMail({ status: "BOUNCED" }), false);
  assert.equal(canReceiveMail({ status: "COMPLAINED" }), false);
  assert.equal(canReceiveMail({ confirmed: true }), true); // ACTIVE
});

test("CRM1-5 a fresh signup lands PENDING (double opt-in), never ACTIVE", () => {
  assert.equal(SIGNUP_STATUS, SUBSCRIBER_STATUS.PENDING);
  const rec = buildSignupRecord({ email: "New@X.com", placement: "homepage", route: "/" });
  assert.equal(rec.status, "PENDING");
  assert.equal(rec.email, "new@x.com");
  assert.equal(rec.consent_version, CONSENT_VERSION);
});

test("CRM1-6 signup record preserves sanitised UTM attribution + signup route", () => {
  const rec = buildSignupRecord({
    email: "a@b.co",
    placement: "deal_detail",
    route: "/deals/12345?utm_source=tiktok#x",
    utm: { utm_source: "tiktok", utm_campaign: "deal_drop_1", utm_medium: "social", utm_content: "hook_a" },
  });
  assert.equal(rec.utm_source, "tiktok");
  assert.equal(rec.utm_campaign, "deal_drop_1");
  assert.equal(rec.utm_medium, "social");
  assert.equal(rec.utm_content, "hook_a");
  // route is stored as a bare path - query string + hash stripped
  assert.equal(rec.signup_route, "/deals/12345");
});

test("CRM1-7 UTM / route guards reject free text, URLs, over-long values", () => {
  assert.equal(cleanUtm("has spaces and a really long free form sentence that is not a code"), null);
  assert.equal(cleanUtm("mailto:a@b.com"), null);
  assert.equal(cleanUtm("x".repeat(80)), null);
  assert.equal(cleanUtm("tiktok"), "tiktok");
  assert.equal(cleanSignupRoute("https://evil.example/x"), null);
  assert.equal(cleanSignupRoute("/deals/9?token=secret"), "/deals/9");
});

// ============================ abuse guard ============================

test("CRM1-8 honeypot: filled hidden field is a bot; absent/empty is a human", () => {
  assert.equal(honeypotTripped({ company_website: "acme inc" }), true);
  assert.equal(honeypotTripped({ company_website: "" }), false);
  assert.equal(honeypotTripped({}), false);
});

test("CRM1-9 rate limit: bounded per key per window, then blocked with a retry hint", () => {
  _reset();
  const key = "ip:test";
  for (let i = 0; i < 5; i++) assert.equal(rateLimit(key, { now: 1000 }).allowed, true, `call ${i + 1}`);
  const blocked = rateLimit(key, { now: 1000 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  // a different key is unaffected; the window resets
  assert.equal(rateLimit("ip:other", { now: 1000 }).allowed, true);
  assert.equal(rateLimit(key, { now: 1000 + 61_000 }).allowed, true);
});

// ============================ digest template ============================

test("CRM1-10 digest links are website-first only - never an eBay / affiliate URL", () => {
  const rows = [
    { id: 111, name: "Charizard", set: "Base Set", priceLabel: "$180.00", marketRefLabel: "$450.00", pct: 60, imageUrl: "https://img.example/c.jpg" },
    { id: 222, name: "Blastoise", set: "Base Set", priceLabel: "$90.00", pct: 40 },
  ];
  const unsub = "https://pokemondealfinder.com/api/newsletter?token=abc123&action=unsubscribe";
  const { subject, html, text } = renderDigest(rows, { unsubscribeUrl: unsub });

  for (const out of [html, text]) {
    assert.doesNotMatch(out, /ebay\.|rover\.ebay|ebay\.to|\/rover\/|campid=|mkcid=/i, "no eBay/affiliate link in the digest");
    assert.match(out, /pokemondealfinder\.com\/deals\/111/);
    assert.match(out, /pokemondealfinder\.com\/deals\/222/);
    assert.match(out, /unsubscribe/i);
  }
  // footer essentials (html-escapes the & in the query string)
  assert.match(html, /token=abc123&(?:amp;)?action=unsubscribe/);
  assert.match(text, /token=abc123&action=unsubscribe/);
  assert.match(text, /Browse all live deals: https:\/\/pokemondealfinder\.com\/deals/);
  assert.ok(subject && !/instant|guaranteed|every deal/i.test(subject), "subject makes no over-promise");
});

test("CRM1-11 renderDigest requires an unsubscribe URL", () => {
  assert.throws(() => renderDigest([{ id: 1, name: "x", priceLabel: "$1" }], {}), /unsubscribeUrl/);
});

test("CRM1-12 one-click List-Unsubscribe headers are available for the send layer", () => {
  const h = listUnsubscribeHeaders("https://pokemondealfinder.com/api/newsletter?token=t&action=unsubscribe");
  assert.match(h["List-Unsubscribe"], /^<https:\/\/pokemondealfinder\.com\/api\/newsletter\?token=t&action=unsubscribe>$/);
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

// ============================ operator summary (no PII) ============================

test("CRM1-13 subscriber summary returns counts only - never an email", () => {
  const now = Date.parse("2026-09-07T00:00:00Z");
  const rows = [
    { status: "ACTIVE", created_at: "2026-09-06T00:00:00Z", utm_source: "tiktok" },
    { status: "ACTIVE", created_at: "2026-08-01T00:00:00Z", utm_source: "tiktok" },
    { status: "PENDING", created_at: "2026-09-05T00:00:00Z", source: "capture_homepage" },
    { confirmed: true, unsubscribed_at: "2026-09-02T00:00:00Z", created_at: "2026-07-01T00:00:00Z" },
  ];
  const s = summarizeSubscribers(rows, { now });
  assert.equal(s.active, 2);
  assert.equal(s.pending, 1);
  assert.equal(s.unsubscribed, 1);
  assert.equal(s.signups_7d, 2);
  assert.equal(s.signups_30d, 2); // 09-06 + 09-05; 08-01 is 37d out
  assert.equal(s.top_signup_source, "tiktok");
  assert.ok(!JSON.stringify(s).includes("@"), "summary has nothing email-shaped");
});

test("CRM1-14 summaryFromCounts is pure arithmetic on pre-aggregated counts", () => {
  const s = summaryFromCounts({ byStatus: { ACTIVE: 10, PENDING: 3, UNSUBSCRIBED: 2 }, signups7d: 4, signups30d: 9, topSource: "instagram" });
  assert.equal(s.total, 15);
  assert.equal(s.active, 10);
  assert.equal(s.signups_7d, 4);
  assert.equal(s.top_signup_source, "instagram");
});

test("CRM1-15 crm:summary + operator panel never select the email column", () => {
  const cli = read("scripts/crmSummary.mjs");
  assert.doesNotMatch(cli, /\.select\([^)]*email/i, "crm:summary must not select email");
  assert.match(cli, /deliberately NOT selecting `email`/);
  const dash = read("scripts/socialDashboard.mjs");
  const panel = dash.slice(dash.indexOf("subscribers summary"), dash.indexOf("subscribers summary") + 1400);
  assert.doesNotMatch(panel, /select\(\s*["']email/i);
  assert.match(dash, /Subscribers \(CRM-1 — counts only, no addresses\)/);
});

// ============================ analytics contract ============================

test("CRM1-16 the six email events are declared and allow-listed", () => {
  for (const e of [
    "email_capture_viewed",
    "email_signup_submitted",
    "email_signup_success",
    "email_signup_error",
    "email_confirmation_success",
    "email_unsubscribed",
  ]) {
    assert.ok(Object.values(EVENTS).includes(e), `EVENTS missing ${e}`);
    assert.ok(ALLOWED_EVENTS.has(e), `ALLOWED_EVENTS missing ${e}`);
  }
});

test("CRM1-17 the capture component never puts the email in an analytics prop", () => {
  const src = read("components/EmailCapture.js");
  // every capture() call carries only placement / page_type / reason
  const calls = [...src.matchAll(/capture\(EVENTS\.[A-Z_]+,\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(calls.length >= 4, "expected several capture() calls");
  for (const args of calls) {
    assert.doesNotMatch(args, /email|address|\bhp\b|honeypot/i, `capture props leak: ${args}`);
  }
  // goes through the analytics helper, not posthog directly
  assert.match(src, /from "@\/lib\/analytics\/client"/);
  assert.doesNotMatch(src, /posthog/i);
});

test("CRM1-18 email is a forbidden analytics prop key (defence in depth)", () => {
  const san = read("lib/analytics/sanitize.js");
  assert.match(san, /"email"/);
});

// ============================ route wiring ============================

const SUB = () => read("app/api/newsletter/subscribe/route.js");
const NEWS = () => read("app/api/newsletter/route.js");

test("CRM1-19 subscribe route is gated on emailEnabled() - nothing collected while disabled", () => {
  const src = SUB();
  assert.match(src, /if \(!emailEnabled\(\)\) return Response\.json\(DISABLED, \{ status: 503 \}\)/);
});

test("CRM1-20 subscribe route is non-enumerating: one generic success shape", () => {
  const src = stripComments(SUB());
  // honeypot, already-active, and new/resubscribe paths all return GENERIC_SUCCESS
  assert.ok((src.match(/GENERIC_SUCCESS/g) || []).length >= 3, "generic success reused across outcomes");
  // never a response body that reveals membership
  assert.doesNotMatch(src, /["'][^"']*already (subscribed|registered|on the list|exists)[^"']*["']/i);
  assert.doesNotMatch(src, /reason:\s*["'](already_[a-z]+|exists|duplicate)["']/);
});

test("CRM1-21 subscribe route writes PENDING + attribution and double-opt-ins", () => {
  const src = SUB();
  assert.match(src, /buildSignupRecord/);
  assert.match(src, /sanitizeUtmValue/);
  assert.match(src, /status: SUBSCRIBER_STATUS\.PENDING/);
  assert.match(src, /action=confirm/); // confirmation link
  // the only send is the CONFIRMATION (transactional), and it is a single call
  assert.equal((src.match(/sendEmail\(/g) || []).length, 1);
  assert.match(src, /subject: "Confirm your Pokemon deal alerts"/);
  assert.doesNotMatch(src, /sendBatch/); // no bulk/marketing send here
});

test("CRM1-22 subscribe route: a deliberate re-opt-in after unsubscribe is allowed; stale confirm links are not (no accidental resubscribe)", () => {
  const sub = SUB();
  // POST clears unsubscribed_at + re-PENDs + new token on a deliberate re-signup
  assert.match(sub, /unsubscribed_at: null/);
  assert.match(sub, /confirmed: false/);
  const news = NEWS();
  // GET confirm refuses to reactivate an unsubscribed row
  assert.match(news, /if \(row\.unsubscribed_at\) \{[\s\S]*previously unsubscribed/);
  // and it no longer blanket-clears unsubscribed_at on confirm
  assert.doesNotMatch(news, /confirmed: true, confirmed_at: new Date\(\)\.toISOString\(\), unsubscribed_at: null/);
});

test("CRM1-23 unsubscribe keeps status in sync and is tokenised + no-login", () => {
  const news = NEWS();
  assert.match(news, /action === "unsubscribe"/);
  assert.match(news, /unsubscribed_at: new Date\(\)\.toISOString\(\), status: "UNSUBSCRIBED"/);
  assert.match(news, /confirmed: true, confirmed_at: new Date\(\)\.toISOString\(\), status: "ACTIVE"/);
  // no auth / session / cookie check on the unsubscribe path
  assert.doesNotMatch(news, /authorization|getSession|cookies\(\)/i);
});

test("CRM1-24 send-digest still sends exactly one batch, website-first, and skips BOUNCED/COMPLAINED", () => {
  const src = read("app/api/send-digest/route.js");
  assert.equal((src.match(/sendBatch\(/g) || []).length, 1);
  assert.match(src, /renderDigest\(digestRows, \{ unsubscribeUrl: unsub, siteUrl: SITE_URL, preset: "weekly" \}\)/);
  assert.match(src, /status !== "BOUNCED" && s\.status !== "COMPLAINED"/);
  // no eBay/affiliate URL construction anywhere in the digest route
  assert.doesNotMatch(src, /ebay\.com|ebay\.to|rover\.ebay|\/rover\/|campid=|affiliate_url|wrapEbay/i);
});

test("CRM1-24b the weekly digest has its own kill switch, separate from emailEnabled()", () => {
  const src = read("app/api/send-digest/route.js");
  // both locks are checked, DIGEST_SEND_ENABLED is the second, independent one
  assert.match(src, /if \(!emailEnabled\(\)\) return Response\.json\(\{ ok: true, skipped: "disabled" \}\)/);
  assert.match(src, /if \(!digestSendEnabled\(\)\) return Response\.json\(\{ ok: true, skipped: "digest_send_disabled" \}\)/);
  const gateIdx = src.indexOf("if (!digestSendEnabled())");
  const sendIdx = src.indexOf("sendBatch(");
  assert.ok(gateIdx > -1 && gateIdx < sendIdx, "the gate is checked before any send");
  // the predicate: ONLY the literal string "true" (any case, trimmed) opens it
  assert.match(src, /DIGEST_SEND_ENABLED \?\? ""\)\.trim\(\)\.toLowerCase\(\) === "true"/);
  assert.doesNotMatch(src, /DIGEST_SEND_ENABLED[\s\S]{0,40}(!==|\bfalse\b)/, "not a default-on / negated check");
});

// ============================ placement rules ============================

test("CRM1-25 homepage capture is present and gated", () => {
  const src = read("app/page.js");
  assert.match(src, /<EmailCapture placement="homepage"/);
  assert.match(src, /emailEnabled\(\) && \(\s*<EmailCapture placement="homepage"/);
});

test("CRM1-26 expired-deal capture is present", () => {
  const src = read("app/deals/[id]/page.js");
  assert.match(src, /<EmailCapture placement="expired_deal"/);
});

test("CRM1-27 capture never renders above the primary deal CTA", () => {
  const src = read("app/deals/[id]/page.js");
  const primaryCta = src.indexOf('{isAuction ? "Bid on eBay →" : "View on eBay →"}');
  const relatedFirst = src.indexOf("<RelatedDeals");
  const dealCapture = src.indexOf('<EmailCapture placement="deal_detail"');
  const expiredCapture = src.indexOf('<EmailCapture placement="expired_deal"');
  assert.ok(primaryCta > -1);
  assert.ok(dealCapture > primaryCta, "deal_detail capture must be below the View on eBay CTA");
  assert.ok(dealCapture > relatedFirst, "deal_detail capture must be below the related-deals module");
  assert.ok(expiredCapture > -1);
});

test("CRM1-28 the capture module is inline - not a popup / modal / exit-intent / countdown", () => {
  const src = stripComments(read("components/EmailCapture.js"));
  assert.match(src, /<section/);
  assert.doesNotMatch(src, /position:\s*fixed|className="[^"]*\bfixed\b|role="dialog"|aria-modal|Dialog|createPortal/);
  assert.doesNotMatch(src, /mouseleave|mouseout|exit.?intent|beforeunload|setTimeout\([^)]*\bopen\b|countdown|scarcity/i);
});

test("CRM1-29 form asks for EMAIL only - no name/phone, no pre-checked consent box", () => {
  const src = read("components/EmailCapture.js");
  const inputs = [...src.matchAll(/<input[\s\S]*?\/>/g)].map((m) => m[0]);
  const visibleTypes = inputs
    .filter((i) => !/tabIndex=\{-1\}/.test(i)) // exclude the honeypot
    .map((i) => (i.match(/type="([^"]+)"/) || [])[1]);
  assert.deepEqual(visibleTypes, ["email"], `only an email field should be visible, got ${visibleTypes}`);
  assert.doesNotMatch(src, /type="checkbox"/);
  assert.doesNotMatch(src, /defaultChecked|checked=\{true\}/);
  assert.ok(src.includes(CONSENT_COPY), "the truthful consent copy is shown");
  assert.match(src, new RegExp(PRIMARY_CTA));
});

// ============================ isolation / safety ============================

test("CRM1-30 subscriber mail is fully separate from the cold-outreach provider", () => {
  const email = read("lib/email.js");
  assert.doesNotMatch(email, /outreach|instantly/i);
  const provider = read("lib/outreach/provider.js");
  assert.doesNotMatch(provider, /RESEND_API_KEY|lib\/email|ALERT_FROM_EMAIL/);
  for (const f of ["lib/crm/subscribers.js", "lib/crm/digestTemplate.js", "lib/crm/signupGuard.js", "lib/crm/summary.js", "app/api/newsletter/subscribe/route.js"]) {
    assert.doesNotMatch(read(f), /instantly/i, `${f} references Instantly`);
  }
});

test("CRM1-31 nothing in CRM-1 makes an eBay call or ships the service-role key to the client", () => {
  for (const f of [
    "lib/crm/subscribers.js",
    "lib/crm/digestTemplate.js",
    "lib/crm/signupGuard.js",
    "lib/crm/summary.js",
    "components/EmailCapture.js",
    "app/api/newsletter/subscribe/route.js",
    "scripts/crmSummary.mjs",
  ]) {
    const src = stripComments(read(f));
    assert.doesNotMatch(src, /ebay\.com|ebay\.to|browse\.api|getBrowseRateLimit|fetchCardOffers|EBAY_CLIENT/i, `${f} makes an eBay call`);
    assert.doesNotMatch(src, /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/, `${f} leaks the service-role key`);
  }
  // the client component never imports a server-only secret module
  assert.doesNotMatch(read("components/EmailCapture.js"), /supabaseAdmin|SUPABASE_SERVICE_ROLE_KEY/);
});

test("CRM1-32 pure crm libs do no I/O", () => {
  for (const f of ["lib/crm/subscribers.js", "lib/crm/digestTemplate.js", "lib/crm/summary.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /process\.env|createClient|supabaseAdmin|\bfetch\(/, `${f} is not pure`);
  }
});

test("CRM1-33 the migration is non-destructive (add-only + backfill + comments)", () => {
  const mig = read("supabase/newsletter_capture_migration.sql");
  assert.doesNotMatch(mig, /drop table|drop column|truncate|delete from|disable row level security/i);
  assert.match(mig, /add column if not exists status\s+text/);
  assert.match(mig, /add column if not exists utm_source/);
  assert.match(mig, /add column if not exists signup_route/);
  assert.match(mig, /add column if not exists consent_version/);
  // the original migration is not modified by this phase
  assert.doesNotMatch(read("supabase/newsletter_migration.sql"), /CRM-1|utm_source|consent_version/);
});

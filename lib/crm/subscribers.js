// Phase CRM-1 - pure subscriber-model helpers.
//
// No I/O, no env var, no Supabase client, no email provider - mirrors the
// lib/newsletterFlow.js convention (pure decision logic in lib/, thin
// route handlers in app/). Unit-tested by
// tests/scanner/email-return-loop-crm1.test.mjs with no live database.
//
// The store is the existing `newsletter_subscribers` table extended by
// supabase/newsletter_capture_migration.sql. Field mapping to the CRM-1
// model:
//   subscriber_id   -> id (uuid)
//   email_normalized-> email        (we normalise before write; unique)
//   status          -> status       (authoritative; see deriveStatus)
//   created_at / confirmed_at / unsubscribed_at -> same
//   source          -> source
//   utm_*           -> utm_*
//   signup_route    -> signup_route
//   consent_version -> consent_version

const SUBSCRIBER_STATUS = Object.freeze({
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  UNSUBSCRIBED: "UNSUBSCRIBED",
  BOUNCED: "BOUNCED",
  COMPLAINED: "COMPLAINED",
});

// The state a fresh signup lands in: a confirmation email must be clicked
// before anything is ever sent to the address.
const SIGNUP_STATUS = SUBSCRIBER_STATUS.PENDING;

// Statuses that may receive mail. BOUNCED/COMPLAINED are terminal and are
// only ever set by a future provider webhook.
const SENDABLE_STATUSES = Object.freeze([SUBSCRIBER_STATUS.ACTIVE]);

// Bump when the consent copy below materially changes - every signup
// records the version it was shown so consent is auditable.
const CONSENT_VERSION = "crm1-2026-09";
const CONSENT_COPY =
  "Occasional emails about standout Pokemon card deals and market finds. Unsubscribe anytime.";

// The one primary CTA, used on every capture surface (do not vary it).
const PRIMARY_CTA = "Get deal alerts";

// ---- email normalisation + validation ------------------------------
//
// Conservative: trim, lowercase the whole address (domains are
// case-insensitive; the local part technically is not, but every mailbox
// provider a hobby audience uses treats it case-insensitively, and
// lowercasing is what prevents Foo@x / foo@x becoming two subscribers).
// No plus-address stripping - that is surprising and destroys a
// legitimate deliverable address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

function normalizeEmail(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

function isValidEmail(raw) {
  const e = normalizeEmail(raw);
  return e.length > 0 && e.length <= EMAIL_MAX && EMAIL_RE.test(e) && !e.includes("..");
}

// ---- status derivation --------------------------------------------
//
// `status` is authoritative once present. For rows written before the
// CRM-1 migration (or by a path that only set the legacy fields) we
// derive it from `confirmed` + `unsubscribed_at`. An unsubscribe is
// terminal and outranks `confirmed`.
function deriveStatus(row = {}) {
  const s = String(row.status ?? "").toUpperCase();
  if (SUBSCRIBER_STATUS[s]) return s;
  if (row.unsubscribed_at) return SUBSCRIBER_STATUS.UNSUBSCRIBED;
  if (row.confirmed === true) return SUBSCRIBER_STATUS.ACTIVE;
  return SUBSCRIBER_STATUS.PENDING;
}

function isActive(row = {}) {
  return deriveStatus(row) === SUBSCRIBER_STATUS.ACTIVE;
}

function canReceiveMail(row = {}) {
  return SENDABLE_STATUSES.includes(deriveStatus(row));
}

// ---- signup context (attribution + placement) --------------------
//
// `utm` values must already be run through the analytics layer's
// sanitizeUtmValue() by the caller (the route) - this is a final guard,
// not the primary validator. `placement` is one of a fixed set; anything
// else is coerced to "other" so the column never carries free text.
const PLACEMENTS = Object.freeze(["homepage", "deal_detail", "expired_deal", "deals_browse", "other"]);
const ROUTE_MAX = 120;
const UTM_MAX = 64;
const UTM_SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9 _.+-]{0,62}[A-Za-z0-9]$|^[A-Za-z0-9]$/;

function cleanUtm(v) {
  const s = String(v ?? "").trim();
  if (!s || s.length > UTM_MAX || !UTM_SAFE_RE.test(s)) return null;
  return s;
}

function normalizePlacement(p) {
  const s = String(p ?? "").trim().toLowerCase();
  return PLACEMENTS.includes(s) ? s : "other";
}

// A bare route/placement token, never a URL with a query string.
function cleanSignupRoute(v) {
  let s = String(v ?? "").trim();
  if (!s) return null;
  s = s.split(/[?#]/)[0];
  if (s.length > ROUTE_MAX) s = s.slice(0, ROUTE_MAX);
  // no whitespace, no protocol
  if (/\s/.test(s) || /^https?:/i.test(s)) return null;
  return s;
}

function buildSignupRecord({ email, placement, route, utm = {}, source } = {}) {
  return {
    email: normalizeEmail(email),
    status: SIGNUP_STATUS,
    source: source || `capture_${normalizePlacement(placement)}`,
    signup_route: cleanSignupRoute(route) ?? normalizePlacement(placement),
    consent_version: CONSENT_VERSION,
    utm_source: cleanUtm(utm.utm_source),
    utm_medium: cleanUtm(utm.utm_medium),
    utm_campaign: cleanUtm(utm.utm_campaign),
    utm_content: cleanUtm(utm.utm_content),
  };
}

// ---- generic (non-enumerating) responses -------------------------
//
// Every signup outcome that is not a hard input error returns the SAME
// success shape, so a caller can never tell "new address" from "already
// on the list" from "previously unsubscribed".
const GENERIC_SUCCESS = Object.freeze({ ok: true, status: "received" });
const INVALID_EMAIL = Object.freeze({ ok: false, reason: "invalid_email" });
const DISABLED = Object.freeze({ ok: false, reason: "disabled" });
const RATE_LIMITED = Object.freeze({ ok: false, reason: "rate_limited" });

module.exports = {
  SUBSCRIBER_STATUS,
  SIGNUP_STATUS,
  SENDABLE_STATUSES,
  CONSENT_VERSION,
  CONSENT_COPY,
  PRIMARY_CTA,
  PLACEMENTS,
  normalizeEmail,
  isValidEmail,
  deriveStatus,
  isActive,
  canReceiveMail,
  cleanUtm,
  normalizePlacement,
  cleanSignupRoute,
  buildSignupRecord,
  GENERIC_SUCCESS,
  INVALID_EMAIL,
  DISABLED,
  RATE_LIMITED,
};

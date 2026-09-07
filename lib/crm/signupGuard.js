// Phase CRM-1 - lightweight abuse protection for the signup endpoint.
// No CAPTCHA (the brief forbids one unless genuinely necessary): a hidden
// honeypot field + a bounded in-memory fixed-window rate limit.
//
// The rate limiter is best-effort and per-instance (serverless instances
// don't share memory) - it is a brake on a hammering client, not a
// security boundary. Real enforcement is the DB unique constraint + the
// generic non-enumerating response.

// ---- honeypot ----------------------------------------------------
// The form renders a visually-hidden field a human never fills. Accept
// EITHER an absent value or an empty string; anything else = a bot.
const HONEYPOT_FIELD = "company_website";

function honeypotTripped(body = {}) {
  const v = body[HONEYPOT_FIELD];
  return v != null && String(v).trim() !== "";
}

// ---- fixed-window limiter --------------------------------------
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5; // signups accepted per key per minute

const _buckets = new Map(); // key -> { count, resetAt }

// Returns { allowed, retryAfterSec }. `now` is injectable for tests.
function rateLimit(key, { now = Date.now(), windowMs = WINDOW_MS, max = MAX_PER_WINDOW } = {}) {
  if (!key) return { allowed: true, retryAfterSec: 0 };
  const b = _buckets.get(key);
  if (!b || now >= b.resetAt) {
    _buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (b.count >= max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

// prevent unbounded growth on a long-lived instance
function _sweep(now = Date.now()) {
  for (const [k, b] of _buckets) if (now >= b.resetAt) _buckets.delete(k);
}

// derive a coarse rate-limit key from a request (never stored, never logged)
function keyFromRequest(request) {
  try {
    const h = request.headers;
    const fwd = h.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0].trim() || h.get("x-real-ip") || "";
    return ip ? `ip:${ip}` : null;
  } catch {
    return null;
  }
}

function _reset() {
  _buckets.clear();
}

module.exports = {
  HONEYPOT_FIELD,
  honeypotTripped,
  rateLimit,
  keyFromRequest,
  WINDOW_MS,
  MAX_PER_WINDOW,
  _sweep,
  _reset,
};

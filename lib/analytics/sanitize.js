// Phase 13A - the last line of defence before anything leaves the browser.
//
// Two layers:
//   1. sanitizeProps(props)  - run inside our capture() helper, on the
//      properties WE attach. Drops anything that looks sensitive and
//      caps string length. Our callers already only pass structural
//      values, so this should almost never have to do anything - it's a
//      guard against a future careless call site.
//   2. buildBeforeSend()     - PostHog `before_send` hooks. Run on EVERY
//      outgoing event (including SDK-internal ones). Strips query strings
//      from $current_url / $referrer, redacts email-looking strings,
//      hard-drops any non-allowlisted custom event, truncates long
//      strings.
//
// No PII, no raw query text, no free text is ever meant to reach here;
// this module makes "meant to" enforced.

import { ALLOWED_EVENTS } from "./events.js";

const MAX_STRING = 200;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// property keys that must never carry a value, whatever a caller passes.
const FORBIDDEN_KEYS = new Set([
  "email",
  "e_mail",
  "user_email",
  "alert_email",
  "name",
  "full_name",
  "first_name",
  "last_name",
  "query",
  "q",
  "search_query",
  "search_term",
  "search_term_string",
  "raw_query",
  "text",
  "message",
  "body",
  "input",
  "clipboard",
  "password",
  "token",
  "ebay_user",
  "seller",
  "seller_id",
  "ip",
  "ip_address",
  "affiliate_id",
  "campid",
]);

export function stripUrlQuery(url) {
  if (typeof url !== "string" || !url) return url;
  try {
    const u = new URL(url);
    // keep origin + pathname only - no search, no hash (either could
    // carry a ?q= / #q= the visitor typed).
    return `${u.origin}${u.pathname}`;
  } catch {
    // not a parseable URL - chop at the first ? or #
    return url.split(/[?#]/)[0];
  }
}

export function redactPII(value) {
  if (typeof value !== "string") return value;
  let v = value;
  if (EMAIL_RE.test(v)) v = v.replace(new RegExp(EMAIL_RE.source, "gi"), "[redacted-email]");
  if (v.length > MAX_STRING) v = v.slice(0, MAX_STRING);
  return v;
}

// Layer 1: our own props.
export function sanitizeProps(props) {
  if (!props || typeof props !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue;
    if (typeof v === "string") {
      if (EMAIL_RE.test(v)) continue; // drop the whole prop, don't half-keep it
      out[k] = v.length > MAX_STRING ? v.slice(0, MAX_STRING) : v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 20).map((x) => (typeof x === "string" ? redactPII(x) : x));
    }
    // objects are intentionally dropped - events are flat
  }
  return out;
}

const URL_PROP_KEYS = ["$current_url", "$referrer", "$referring_domain", "$pathname", "url", "referrer"];

// Layer 2: PostHog before_send. Returns an array (before_send accepts one
// fn or an array; an array documents the steps).
export function buildBeforeSend({ allowed = ALLOWED_EVENTS } = {}) {
  const dropDisallowedEvents = (event) => {
    if (!event) return null;
    const name = event.event;
    // allow SDK-internal ($-prefixed) housekeeping through; hard-drop any
    // custom event we didn't declare.
    if (typeof name === "string" && !name.startsWith("$") && !allowed.has(name)) return null;
    return event;
  };

  const scrubProperties = (event) => {
    if (!event) return null;
    const p = event.properties;
    if (p && typeof p === "object") {
      for (const key of URL_PROP_KEYS) {
        if (typeof p[key] === "string") p[key] = stripUrlQuery(p[key]);
      }
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "string") {
          if (FORBIDDEN_KEYS.has(k.toLowerCase())) {
            delete p[k];
            continue;
          }
          p[k] = redactPII(v);
        }
      }
    }
    // we never use person profiles - make sure nothing rides along.
    if (event.$set) delete event.$set;
    if (event.$set_once) delete event.$set_once;
    return event;
  };

  return [dropDisallowedEvents, scrubProperties];
}

// Phase 13A.1 - client-side helpers with ZERO browser persistence.
//
// The analytics layer must not create, read, or depend on localStorage,
// sessionStorage, cookies, or IndexedDB (enforced by
// tests/scanner/analytics-no-storage.test.mjs). Everything here is
// derived fresh from the current URL / referrer / navigator at call
// time. Session continuity across in-page navigations comes only from
// the in-memory common-context in client.js (persistence: "memory");
// across a full page load it is re-derived and, by design, loses UTM /
// original-referrer context - an accepted trade-off.

import { UTM_KEYS, classifyTrafficSource, deviceClassFromWidth, sanitizeUtmValue } from "./props.js";

const hasWindow = () => typeof window !== "undefined";

// ---- Do Not Track / Global Privacy Control -------------------------
export function isDoNotTrackEnabled() {
  if (!hasWindow()) return false;
  try {
    const dnt =
      window.doNotTrack ||
      window.navigator.doNotTrack ||
      window.navigator.msDoNotTrack ||
      (window.external &&
        window.external.msTrackingProtectionEnabled &&
        window.external.msTrackingProtectionEnabled());
    if (dnt === "1" || dnt === 1 || dnt === "yes" || dnt === true) return true;
    if (window.navigator.globalPrivacyControl === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

// ---- landing-scoped attribution (NO storage) ----------------------
// Read straight from the CURRENT url + referrer. On the landing page
// this is the real acquisition source; after a full-page navigation the
// url has no UTM and the referrer is same-host, so it naturally reads
// as "internal" / "direct". We do not persist or reconstruct it -
// downstream same-session association is done in PostHog analysis.
function readUtmFromLocation() {
  if (!hasWindow()) return {};
  try {
    const sp = new URLSearchParams(window.location.search);
    const out = {};
    for (const k of UTM_KEYS) {
      const clean = sanitizeUtmValue(sp.get(k));
      if (clean) out[k] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

export function readLandingAttribution() {
  if (!hasWindow()) {
    return { traffic_source: "unknown" };
  }
  const utm = readUtmFromLocation();
  let referrer = "";
  try {
    referrer = document.referrer || "";
  } catch {
    referrer = "";
  }
  const traffic_source = classifyTrafficSource({
    referrer,
    utmSource: utm.utm_source,
    utmMedium: utm.utm_medium,
    currentHost: window.location.hostname,
  });
  return {
    traffic_source,
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
  };
}

// ---- device class (viewport width; client-side only) --------------
export function deviceClass() {
  if (!hasWindow()) return "unknown";
  return deviceClassFromWidth(window.innerWidth || 0);
}

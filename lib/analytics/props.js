// Phase 13A - deterministic helpers that turn raw values into the small,
// stable enums the event taxonomy uses. Pure functions, no DOM, no PII.

// ---- price band (USD) -------------------------------------------------
export function priceBandUsd(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n < 0) return "unknown";
  if (n < 25) return "under_25";
  if (n < 50) return "25_50";
  if (n < 100) return "50_100";
  if (n < 500) return "100_500";
  return "500_plus";
}

// ---- discount band -------------------------------------------------
// Accepts either a fraction (0.42) or a percentage (42).
export function discountBand(pct) {
  let n = Number(pct);
  if (!Number.isFinite(n)) return "unknown";
  if (n > 0 && n <= 1) n *= 100;
  if (n < 15) return "under_15";
  if (n < 30) return "15_30";
  if (n < 50) return "30_50";
  if (n < 70) return "50_70";
  return "70_plus";
}

// ---- listing type -------------------------------------------------
export function listingTypeProp(value) {
  const s = String(value ?? "").toUpperCase();
  if (s === "AUCTION") return "AUCTION";
  if (s === "FIXED_PRICE" || s === "BIN" || s === "FIXEDPRICE") return "BIN";
  return "unknown";
}

// ---- raw vs graded -------------------------------------------------
export function rawVsGraded(isGraded) {
  if (isGraded === true) return "graded";
  if (isGraded === false) return "raw";
  return "unknown";
}

// ---- viewer country (from the marketplace the currency context resolves)
const MARKETPLACE_TO_COUNTRY = {
  EBAY_US: "US",
  EBAY_GB: "GB",
  EBAY_AU: "AU",
  EBAY_CA: "CA",
  EBAY_DE: "DE",
  EBAY_IT: "IT",
};
export function viewerCountryFromMarketplace(marketplace) {
  return MARKETPLACE_TO_COUNTRY[String(marketplace ?? "")] ?? "other";
}

// ---- device class (viewport width; called client-side only) --------
export function deviceClassFromWidth(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return "unknown";
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

// ---- result-count band (search) ---------------------------------
export function resultCountBand(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "unknown";
  if (v === 0) return "0";
  if (v <= 5) return "1_5";
  if (v <= 20) return "6_20";
  if (v <= 100) return "21_100";
  return "100_plus";
}

// ---- latency band (ms) ----------------------------------------
export function latencyBand(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return "unknown";
  if (v < 300) return "under_300";
  if (v < 800) return "300_800";
  if (v < 2000) return "800_2000";
  if (v < 5000) return "2000_5000";
  return "5000_plus";
}

// ---- traffic source classification -----------------------------
// Prefer an explicit utm_source; otherwise categorise the referrer host.
// Never stores the full referrer URL - only the derived category.
const SOCIAL_HOSTS = {
  "instagram.com": "instagram",
  "l.instagram.com": "instagram",
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "reddit.com": "reddit",
  "www.reddit.com": "reddit",
  "out.reddit.com": "reddit",
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "l.facebook.com": "facebook",
  "lm.facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "t.co": "other_social",
  "x.com": "other_social",
  "twitter.com": "other_social",
  "bsky.app": "other_social",
  "pinterest.com": "other_social",
};
const SEARCH_HOSTS = /(^|\.)(google\.|bing\.|duckduckgo\.|yahoo\.|ecosia\.|startpage\.|yandex\.|baidu\.)/i;

function utmSourceToCategory(src) {
  const s = String(src ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("instagram") || s === "ig") return "instagram";
  if (s.includes("youtube") || s === "yt") return "youtube";
  if (s.includes("reddit")) return "reddit";
  if (s.includes("facebook") || s === "fb" || s === "meta") return "facebook";
  if (["twitter", "x", "bluesky", "bsky", "pinterest", "threads"].some((k) => s.includes(k)))
    return "other_social";
  if (["google", "bing", "cpc", "ppc", "adwords", "google_ads"].some((k) => s.includes(k)))
    return s.includes("cpc") || s.includes("ppc") || s.includes("ads") ? "paid_search" : "organic_search";
  if (s === "newsletter" || s === "email") return "referral";
  return "referral";
}

export function classifyTrafficSource({ referrer = "", utmSource = "", utmMedium = "", currentHost = "" } = {}) {
  const medium = String(utmMedium ?? "").toLowerCase();
  if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium.includes("paidsearch"))
    return "paid_search";

  const fromUtm = utmSourceToCategory(utmSource);
  if (fromUtm) {
    if (fromUtm === "organic_search" && (medium === "cpc" || medium === "ppc")) return "paid_search";
    return fromUtm;
  }

  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (!host) return "unknown";
  if (currentHost && host === String(currentHost).toLowerCase()) return "internal";
  if (SOCIAL_HOSTS[host]) return SOCIAL_HOSTS[host];
  if (SEARCH_HOSTS.test(host)) return "organic_search";
  return "referral";
}

// utm keys we accept (campaign codes, never free text / PII).
export const UTM_KEYS = Object.freeze(["utm_source", "utm_medium", "utm_campaign", "utm_content"]);

// UTM values are EXTERNAL INPUT - never trusted as clean campaign codes.
// Accept only a short, conservative token (letters, digits, _ . - and
// single spaces). Reject anything email-looking, URL-looking, or that
// smells of free-form text / PII. Returns the cleaned value or undefined.
const UTM_MAX_LEN = 64;
const UTM_ALLOWED_RE = /^[A-Za-z0-9](?:[A-Za-z0-9 _.+-]{0,62}[A-Za-z0-9])?$/;
const UTM_EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const UTM_URLISH_RE = /(?:https?:)?\/\/|www\.|\.[a-z]{2,}(?:\/|$)|%[0-9a-f]{2}|[<>{}[\]|\\^`"']/i;

export function sanitizeUtmValue(raw) {
  if (raw == null || typeof raw === "number") return undefined;
  const s = String(raw).trim();
  if (!s || s.length > UTM_MAX_LEN) return undefined;
  if (UTM_EMAIL_RE.test(s)) return undefined;
  if (UTM_URLISH_RE.test(s)) return undefined;
  if (/[\t\r\n]/.test(s)) return undefined;
  if (/\s{2,}/.test(s)) return undefined; // collapsed whitespace -> not a code
  if ((s.match(/ /g) || []).length > 2) return undefined; // >2 spaces -> free-form text
  if (!UTM_ALLOWED_RE.test(s)) return undefined;
  return s;
}

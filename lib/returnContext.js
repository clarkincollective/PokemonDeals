// Pure, dependency-free validation for the /deals/[id] "return to
// browsing" hint. Shared by components/DealBackLink and its tests. The
// only thing that matters here: a `from` value is ONLY ever accepted if
// it is one of a fixed set of internal route families - never an
// arbitrary path, never anything that could become an external URL or a
// traversal.

// One leading slash, a known family, an [a-z0-9-] slug (must start
// alphanumeric). Plus the two exact list routes. Everything else - "//",
// "..", backslashes, colons, "%", "<"/">", other paths - is rejected.
const FROM_SLUG_RE = /^\/(?:pokemon|sets|cards|deals)\/[a-z0-9][a-z0-9-]*$/;
const FROM_EXACT = new Set(["/deals", "/best-finds"]);

export function safeReturnPath(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.includes("//") || v.includes("..") || v.includes("\\") || /[:%<>]/.test(v)) return null;
  return FROM_EXACT.has(v) || FROM_SLUG_RE.test(v) ? v : null;
}

export function returnLabel(path) {
  if (path === "/deals") return "all deals";
  if (path === "/best-finds") return "Best Finds";
  const m = String(path || "").match(/^\/(pokemon|sets|cards|deals)\/([a-z0-9-]+)$/);
  if (!m) return "browsing";
  const words = m[2].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (m[1] === "pokemon") return `${words} cards & deals`;
  if (m[1] === "sets") return words;
  if (m[1] === "deals") return `${words} deals`;
  return "this card";
}

// country is only meaningful when returning to a shopping surface.
export function returnHref(from, country) {
  if (country && (from.startsWith("/pokemon/") || from.startsWith("/sets/"))) {
    return `${from}?country=${country}`;
  }
  return from;
}

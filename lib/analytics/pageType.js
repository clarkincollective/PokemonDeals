// Phase 17B - a coarse, low-cardinality page TYPE from a pathname, for
// click events fired from site-wide components (the footer) that don't
// know which page they're on. Never the path itself, never an id.
export const PAGE_TYPES = Object.freeze([
  "home", "card", "species", "set", "deal", "category", "sealed", "search",
  "guide", "market_data", "hub", "info", "other",
]);

const INFO = new Set(["/about", "/how-it-works", "/methodology", "/affiliate-disclosure", "/privacy", "/contact"]);
const HUBS = new Set(["/cards", "/pokemon", "/sets", "/deals", "/best-finds", "/japanese-cards", "/sealed-deals"]);

export function pageTypeFromPath(pathname) {
  const p = String(pathname ?? "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  if (HUBS.has(p)) return "hub";
  if (INFO.has(p)) return "info";
  if (/^\/cards\/[^/]+$/.test(p)) return "card";
  if (/^\/pokemon\/[^/]+$/.test(p)) return "species";
  if (/^\/sets\/[^/]+$/.test(p)) return "set";
  if (/^\/deals\/\d+$/.test(p)) return "deal";
  if (/^\/deals\/[a-z0-9-]+$/.test(p)) return "category";
  if (/^\/sealed-deals\/[^/]+$/.test(p)) return "sealed";
  if (p === "/search") return "search";
  if (p === "/guides" || p.startsWith("/guides/")) return "guide";
  if (p === "/market-data" || p.startsWith("/market-data/")) return "market_data";
  return "other";
}

// Per-viewer "saved searches" - a filtered grid URL the visitor wants to
// come back to, kept only in their own browser (localStorage), like
// lib/recentCards. No account, no server, no cross-device sync. Every
// path is guarded: SSR returns empty, storage failures are swallowed.
//
// A stored entry:
//   { id, href, label, scope, ts }
// `href` is a same-origin path + query (never an absolute URL, never a
// hash); `id` is derived from the normalised href so re-saving the same
// search is a no-op rather than a duplicate. `label` is the human summary
// of the applied filters (built from lib/dealFilters chips by the caller);
// `scope` names the grid it applies to ("All deals", "Base Set", ...).

const KEY = "pdf:savedSearches";
const CAP = 30;
export const SEARCHES_EVENT = "pdf:searchesChanged";

const EMPTY = Object.freeze([]);
let cache = { raw: null, value: EMPTY };

// Normalise a grid URL: same-origin path + sorted query, page dropped.
export function normaliseSearchHref(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return null;
  const [pathAndQuery] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const sp = new URLSearchParams(query);
  sp.delete("page");
  const entries = [...sp.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = new URLSearchParams(entries).toString();
  return qs ? `${path}?${qs}` : path;
}

export function searchId(href) {
  const n = normaliseSearchHref(href);
  return n ? `s:${n}` : null;
}

function read() {
  if (typeof window === "undefined") return EMPTY;
  let raw = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (cache.raw === raw) return cache.value;
  let parsed = EMPTY;
  try {
    const j = raw ? JSON.parse(raw) : [];
    if (Array.isArray(j)) parsed = j.filter((e) => e && typeof e.href === "string" && e.id);
  } catch {
    parsed = EMPTY;
  }
  cache = { raw, value: parsed };
  return parsed;
}

function write(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore - the in-memory result the caller got is still correct
  }
  cache.raw = null;
  window.dispatchEvent(new Event(SEARCHES_EVENT));
}

export function subscribeSearches(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(SEARCHES_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEARCHES_EVENT, onChange);
  };
}

export const getServerSnapshot = () => EMPTY;
export const readSavedSearches = () => read();

export function isSearchSaved(href) {
  const id = searchId(href);
  return Boolean(id) && read().some((e) => e.id === id);
}

// Returns { saved: boolean, list }. Saving an already-saved search removes it.
export function toggleSavedSearch({ href, label, scope }) {
  const id = searchId(href);
  if (!id) return { saved: false, list: read() };
  const current = read();
  const exists = current.some((e) => e.id === id);
  const list = exists
    ? current.filter((e) => e.id !== id)
    : [{ id, href: normaliseSearchHref(href), label: String(label ?? "").slice(0, 120), scope: String(scope ?? "").slice(0, 80), ts: Date.now() }, ...current].slice(0, CAP);
  write(list);
  return { saved: !exists, list };
}

export function removeSavedSearch(id) {
  write(read().filter((e) => e.id !== id));
}

export function clearSavedSearches() {
  write([]);
}

// Phase 17C.11 - per-viewer checklist progress, kept ONLY in the
// visitor's own browser. Mirrors lib/recentCards.js rather than inventing
// a second storage convention:
//   * "pdf:" key prefix, one key per set
//   * SSR returns a frozen EMPTY so useSyncExternalStore's server snapshot
//     and the first client render agree (no hydration mismatch)
//   * every storage access is try/caught
//   * snapshots are memoised on the raw JSON string so consumers get a
//     stable reference between renders
//
// HONEST FAILURE (17C.11): when localStorage is unavailable (private mode,
// quota, disabled), writes fall back to an in-memory map so the current
// page still works, and every mutator returns FALSE. The UI uses that to
// say the marks were not saved - it must never imply persistence it did
// not achieve. Nothing is ever sent to a server.

const PREFIX = "pdf:checklist:";
export const CHECKLIST_EVENT = "pdf:checklistChanged";

const EMPTY = Object.freeze([]);
const cache = new Map(); // storageKey -> { raw, value }
const memory = new Map(); // storageKey -> string[]  (fallback only)

export function storageKey(setName) {
  return `${PREFIX}${String(setName ?? "").trim().toLowerCase()}`;
}

// Probe once per call rather than caching a stale answer: a browser can
// start denying storage mid-session (quota).
export function storageWorks() {
  if (typeof window === "undefined") return false;
  try {
    const probe = "pdf:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function parse(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return EMPTY;
    const keys = parsed.filter((k) => typeof k === "string" || typeof k === "number").map(String);
    return keys.length ? Object.freeze(keys) : EMPTY;
  } catch {
    return EMPTY;
  }
}

// Array of owned row keys for one set. Unparseable data reads as empty
// rather than throwing - corrupted storage loses progress, it never breaks
// the checklist.
export function readOwned(setName) {
  if (typeof window === "undefined") return EMPTY;
  const key = storageKey(setName);
  let raw = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // storage unreadable - fall back to whatever this session holds
    return memory.get(key) ?? EMPTY;
  }
  const slot = cache.get(key);
  if (slot && slot.raw === raw) return slot.value;
  const value = parse(raw);
  cache.set(key, { raw, value });
  return value;
}

// Returns true when the value was persisted, false when it only lives in
// memory for this page view.
function write(setName, list) {
  const key = storageKey(setName);
  if (typeof window === "undefined") return false;
  const frozen = Object.freeze(list.map(String));
  let persisted = false;
  try {
    if (frozen.length) window.localStorage.setItem(key, JSON.stringify(frozen));
    else window.localStorage.removeItem(key);
    persisted = true;
    memory.delete(key);
  } catch {
    // Keep the session usable, but the caller is told it was NOT saved.
    memory.set(key, frozen);
  }
  cache.set(key, { raw: persisted ? JSON.stringify(frozen) : null, value: frozen.length ? frozen : EMPTY });
  if (!persisted) cache.delete(key);
  window.dispatchEvent(new Event(CHECKLIST_EVENT));
  return persisted;
}

export function toggleOwned(setName, rowKey) {
  const k = rowKey == null ? null : String(rowKey);
  if (!k) return false;
  const current = readOwned(setName);
  const next = current.includes(k) ? current.filter((x) => x !== k) : [...current, k];
  return write(setName, next);
}

export function clearOwned(setName) {
  return write(setName, []);
}

export function subscribeChecklist(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(CHECKLIST_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHECKLIST_EVENT, onChange);
  };
}

export function getServerSnapshot() {
  return EMPTY;
}

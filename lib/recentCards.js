// Per-viewer "recently viewed" and "saved" card lists, kept only in the
// visitor's own browser (localStorage). No account, no server, no cross-
// device sync - this is a lightweight convenience, so every path is
// guarded: SSR returns empty, and any storage failure (private mode,
// quota, disabled) is swallowed rather than thrown.
//
// A stored entry is a minimal card descriptor - enough to render a tile
// and link to the hub without another fetch:
//   { slug, name, set, image, price, ts }
//
// The snapshot getters are memoised on the raw JSON string so that
// useSyncExternalStore consumers get a stable reference between renders
// (a fresh array every call would loop forever).

const RECENT_KEY = "pdf:recentCards";
const SAVED_KEY = "pdf:savedCards";
const RECENT_CAP = 12;
const SAVED_CAP = 60;

// One shared "changed" signal for all in-page consumers.
export const CARDS_EVENT = "pdf:cardsChanged";

const EMPTY = Object.freeze([]);
const cache = {
  [RECENT_KEY]: { raw: null, value: EMPTY },
  [SAVED_KEY]: { raw: null, value: EMPTY },
};

function read(key) {
  if (typeof window === "undefined") return EMPTY;
  let raw = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return EMPTY;
  }
  const slot = cache[key];
  if (slot.raw === raw) return slot.value;
  let parsed = EMPTY;
  try {
    const j = raw ? JSON.parse(raw) : [];
    if (Array.isArray(j)) parsed = j;
  } catch {
    parsed = EMPTY;
  }
  slot.raw = raw;
  slot.value = parsed;
  return parsed;
}

function write(key, list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // ignore - the in-memory result the caller got is still correct for
    // this session
  }
  // Prime the cache so the next snapshot read is consistent even if the
  // storage round-trip is lossy.
  cache[key].raw = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CARDS_EVENT));
  }
}

// Normalise so callers can pass a hub row, a deal row, or a loose object
// without worrying about the exact keys.
function toEntry(card) {
  if (!card || !card.slug) return null;
  return {
    slug: String(card.slug),
    name: card.name ?? card.title ?? "",
    set: card.set ?? "",
    image: card.image ?? card.image_url ?? null,
    price: card.price ?? card.total_price ?? null,
    ts: Date.now(),
  };
}

export function subscribeCards(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(CARDS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CARDS_EVENT, onChange);
  };
}

export function getServerSnapshot() {
  return EMPTY;
}

export function readRecent() {
  return read(RECENT_KEY);
}

export function recordRecent(card) {
  const entry = toEntry(card);
  if (!entry) return readRecent();
  const next = [entry, ...readRecent().filter((c) => c.slug !== entry.slug)].slice(0, RECENT_CAP);
  write(RECENT_KEY, next);
  return next;
}

export function readSaved() {
  return read(SAVED_KEY);
}

export function isSaved(slug) {
  if (!slug) return false;
  return readSaved().some((c) => c.slug === slug);
}

// Returns { saved: boolean, list } so the caller can update its button
// state without a second read.
export function toggleSaved(card) {
  const entry = toEntry(card);
  if (!entry) return { saved: false, list: readSaved() };
  const current = readSaved();
  const exists = current.some((c) => c.slug === entry.slug);
  const list = exists
    ? current.filter((c) => c.slug !== entry.slug)
    : [entry, ...current].slice(0, SAVED_CAP);
  write(SAVED_KEY, list);
  return { saved: !exists, list };
}

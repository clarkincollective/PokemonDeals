// cache-retire-r1 - an offline MODEL of the Next 16 cache behaviour this
// release relies on, read from node_modules/next (unstable-cache.js,
// revalidate.js). Not Next itself:
//   - unstable_cache(fn, keyParts, { revalidate, tags }): an entry is reused
//     while fresh; once older than `revalidate` it is served STALE while a
//     background refresh runs (request context) - or awaited fresh during a
//     page regeneration (static generation); an entry any of whose tags was
//     expired after it was stored is recomputed before it is served.
//   - the tags of every cache entry read while rendering a page are copied
//     onto that page's ISR entry (workUnitStore.tags), so expiring a tag
//     expires the page too.
//   - revalidateTag(tag, { expire: 0 }) expires immediately.
import { AsyncLocalStorage } from "node:async_hooks";

const M = (globalThis.__nextCacheModel ??= { now: 0, seq: 0, entries: new Map(), pages: new Map(), tagExpiredAt: new Map(), calls: [], log: [] });
const renderStore = new AsyncLocalStorage();

// ordering by a monotonic sequence, so an expiry and a later store in the same clock tick stay ordered
const expiredByTag = (entry) => entry.tags.some((t) => (M.tagExpiredAt.get(t) ?? -Infinity) > entry.seq);

export function unstable_cache(fn, keyParts, options = {}) {
  const revalidate = options.revalidate ?? Infinity;
  const tags = [...(options.tags ?? [])];
  return async (...args) => {
    const key = JSON.stringify([keyParts, args]);
    const render = renderStore.getStore();
    if (render) for (const t of tags) render.tags.add(t);
    const entry = M.entries.get(key);
    const compute = async () => {
      const value = await fn(...args);
      M.entries.set(key, { value: structuredClone(value), storedAt: M.now, seq: ++M.seq, tags, revalidate });
      M.log.push({ key: keyParts[0], recomputed: true });
      return value;
    };
    if (!entry || expiredByTag(entry)) return compute();
    if (M.now - entry.storedAt >= revalidate * 1000) {
      if (render?.staticGeneration) return compute();
      compute(); // background refresh
      return structuredClone(entry.value); // stale served
    }
    return structuredClone(entry.value);
  };
}

export function revalidateTag(tag, profile) {
  M.calls.push({ tag, profile });
  M.tagExpiredAt.set(tag, ++M.seq); // this release always passes { expire: 0 }
}
export function revalidatePath() {}

// A page with ISR `revalidate` seconds: serves its cached HTML while fresh and
// untouched by tag expiry; otherwise regenerates (static generation), reading
// its loaders again and collecting their tags.
export async function renderIsrPage(path, revalidateSeconds, render) {
  const page = M.pages.get(path);
  const fresh = page && M.now - page.storedAt < revalidateSeconds * 1000 && !page.tags.some((t) => (M.tagExpiredAt.get(t) ?? -Infinity) > page.seq);
  if (fresh) return { html: page.html, regenerated: false };
  const store = { tags: new Set(), staticGeneration: true };
  const html = await renderStore.run(store, render);
  M.pages.set(path, { html, storedAt: M.now, seq: ++M.seq, tags: [...store.tags] });
  return { html, regenerated: true, tags: [...store.tags] };
}

export function model() {
  return M;
}

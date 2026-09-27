// `next/cache` for a route handler running OUTSIDE Next (on the owner's PC,
// scripts/crons/runJob.mjs). unstable_cache has nothing to cache into here
// and simply runs the function; revalidateTag / revalidatePath are
// COLLECTED and, when the job finishes, sent in one request to the site's
// /api/revalidate route, which calls Next's real revalidateTag on Vercel -
// so a scan run on the PC expires exactly the caches it would have expired
// on Vercel. Anything else Next exports here is a no-op.
const pendingTags = new Set();
const pendingPaths = new Set();

export function revalidateTag(tag) {
  if (tag) pendingTags.add(String(tag));
}
export function revalidatePath(path) {
  if (path) pendingPaths.add(String(path));
}
export function unstable_cache(fn) {
  return fn;
}
export function unstable_noStore() {}
export function cacheTag() {}
export function cacheLife() {}
export function updateTag(tag) {
  revalidateTag(tag);
}
export function expireTag(tag) {
  revalidateTag(tag);
}
export function expirePath(path) {
  revalidatePath(path);
}

export function pendingRevalidations() {
  return { tags: [...pendingTags], paths: [...pendingPaths] };
}

// POST the collected tags to the site. Returns { sent, ok, error }.
// Never throws: a job's data writes are done; an expiry that fails is
// reported and the caches fall back to their own windows.
export async function flushRevalidations({ site = process.env.SITE_ORIGIN || "https://pokemondealfinder.com", secret = process.env.CRON_SECRET, fetchImpl = globalThis.fetch } = {}) {
  const tags = [...pendingTags];
  const paths = [...pendingPaths];
  pendingTags.clear();
  pendingPaths.clear();
  if (!tags.length && !paths.length) return { sent: 0, ok: true, error: null };
  try {
    const res = await fetchImpl(`${site}/api/revalidate`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "user-agent": "pc-cron/1" },
      body: JSON.stringify({ tags, paths }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { sent: tags.length + paths.length, ok: false, error: `HTTP ${res.status}` };
    return { sent: tags.length + paths.length, ok: true, error: null };
  } catch (e) {
    return { sent: tags.length + paths.length, ok: false, error: e?.message ?? String(e) };
  }
}

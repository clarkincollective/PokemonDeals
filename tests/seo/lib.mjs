// Shared helpers for the SEO test suite. No dependencies - plain fetch +
// regex parsing is enough for Next's server-rendered HTML, and keeping
// this dependency-free matches the rest of the repo.

export const BASE = (process.env.SEO_TEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// How many sample URLs to check per dynamic page type (sets, cards,
// pokemon, deals, ...). Kept small so the suite runs in seconds against a
// catalogue of ~11k URLs.
export const SAMPLE_PER_TYPE = 3;

const UA = "pokemondealfinder-seo-tests";

// One fetch, redirects NOT followed - so a canonical/sitemap URL that
// 30x-redirects is caught rather than silently resolved.
export async function get(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": UA },
  });
  const body = res.status >= 200 && res.status < 300 ? await res.text() : "";
  return {
    url,
    status: res.status,
    location: res.headers.get("location"),
    contentType: res.headers.get("content-type") || "",
    isRedirect: res.status >= 300 && res.status < 400,
    headers: res.headers,
    body,
  };
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}

function stripTags(s) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&middot;/g, "·")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Parse the SEO-relevant bits out of a rendered HTML document.
export function parseHtml(html) {
  const canonicalTags = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/gi) || [];
  const canonicals = canonicalTags.map((t) => attr(t, "href")).filter(Boolean);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : null;

  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  const metaDescription = descMatch ? decodeEntities(attr(descMatch[0], "content") || "") : null;

  const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i);
  const robots = robotsMatch ? (attr(robotsMatch[0], "content") || "").toLowerCase() : null;

  const h1s = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || []).map((t) =>
    decodeEntities(stripTags(t.replace(/^<h1[^>]*>/i, "").replace(/<\/h1>$/i, "")))
  );

  const ldBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const jsonLd = ldBlocks.map((block) => {
    const raw = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      return { ok: true, data: JSON.parse(raw) };
    } catch (err) {
      return { ok: false, error: err.message, raw };
    }
  });

  // Internal links, path-only (drop hash and query), deduped.
  const links = new Set();
  for (const m of html.matchAll(/href=["'](\/[^"'#?\s]*)/gi)) {
    links.add(m[1]);
  }

  return { canonicals, title, metaDescription, robots, h1s, jsonLd, internalLinks: [...links] };
}

// Normalise a path for comparison: strip trailing slash (except root),
// strip query/hash.
export function normPath(p) {
  try {
    const u = new URL(p, BASE);
    let path = u.pathname;
    if (path.length > 1) path = path.replace(/\/$/, "");
    return path;
  } catch {
    return p;
  }
}

export function pathOf(urlOrPath) {
  try {
    return normPath(new URL(urlOrPath, BASE).pathname);
  } catch {
    return normPath(urlOrPath);
  }
}

// The authored, distinctive part of a <title> - everything before the
// final " | Pokemon Deal Finder" template suffix. Used for the length
// check so the shared site-name suffix doesn't count against every page.
export function titleCore(title) {
  if (!title) return "";
  const idx = title.lastIndexOf(" | ");
  return idx === -1 ? title : title.slice(0, idx);
}

// Pull every <loc> out of sitemap.xml and bucket them by first path
// segment ("sets", "cards", "pokemon", "deals", "sealed-deals",
// "market-data", or "" for top-level).
// Fetch /sitemap.xml and flatten it to a list of page <loc>s. Transparently
// follows a <sitemapindex> to its child sitemaps. Returns the child
// sitemap URLs too (empty when /sitemap.xml is a plain urlset).
export async function sitemapUrls() {
  const res = await get("/sitemap.xml");
  if (res.status !== 200) throw new Error(`/sitemap.xml returned ${res.status}`);

  const isIndex = /<sitemapindex[\s>]/i.test(res.body);
  const childSitemaps = isIndex
    ? [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1].trim()))
    : [];

  const bodies = [];
  if (isIndex) {
    for (const child of childSitemaps) {
      const c = await get(pathOf(child));
      if (c.status !== 200) throw new Error(`child sitemap ${child} returned ${c.status}`);
      if (!/<urlset[\s>]/i.test(c.body)) throw new Error(`child sitemap ${child} is not a <urlset>`);
      bodies.push(c.body);
    }
  } else {
    bodies.push(res.body);
  }

  const locs = [];
  for (const body of bodies) {
    for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/g)) locs.push(decodeEntities(m[1].trim()));
  }

  const byType = new Map();
  for (const loc of locs) {
    const seg = pathOf(loc).split("/")[1] || "";
    if (!byType.has(seg)) byType.set(seg, []);
    byType.get(seg).push(loc);
  }
  return { locs, byType, childSitemaps, isIndex };
}

// A deterministic spread of up to `n` items from an array (first, last,
// and evenly-spaced middle) so samples aren't all clustered at the top of
// the sitemap.
// ---------------------------------------------------------------------------
// Sampled deal URLs: telling a post-snapshot exit from a wrongly advertised one
// ---------------------------------------------------------------------------
//
// A /deals/<id> URL can leave the indexable set between the sitemap snapshot
// and the fetch by two routes, both CORRECT:
//   * the listing ends or sells  -> 308 to its own card page (event-driven)
//   * its freshness TTL lapses   -> 200 + noindex, no canonical (time-driven)
//
// The membership itself is computed by `fetchActiveDealIds`, an
// unstable_cache with revalidate: 300 - so for up to ~5 minutes the segment
// can still advertise a URL whose page has just left the set. Measured
// 2026-09-16T23:14Z: /deals/38465 was seen 48.24 h earlier against a 48 h
// low-tier TTL, i.e. it had aged out 14 minutes before the run; both the
// full row AND the sitemap's own column projection agreed it was no longer
// displayable (`freshness:stale`). Nothing was wrong except the clock.
//
// A cache-busting query string does NOT settle this: it re-renders the route
// but reads the same cached membership. The honest discriminator is the
// segment's own <lastmod> (which IS last_seen_at) against the published
// freshness TTLs:
//
//   noindex, last seen  <  the SHORTEST TTL  -> no freshness tier can explain
//                                              it: a data-driven gate (hold,
//                                              identity, condition, evidence)
//                                              was missed at build time. DEFECT.
//   noindex, last seen >=  the shortest TTL  -> it aged out after the
//                                              snapshot. RACE.
//   advertised, last seen > the longest TTL  -> the segment is holding a row
//     + a margin                               that cannot be fresh in any
//                                              tier. DEFECT.
//
// None of this resamples, waits, or accepts "some redirect to some card page".
import { FRESHNESS_TTL_HOURS } from "../../lib/dealQuality.js";

export const MIN_FRESHNESS_TTL_H = Math.min(...Object.values(FRESHNESS_TTL_HOURS));
export const MAX_FRESHNESS_TTL_H = Math.max(...Object.values(FRESHNESS_TTL_HOURS));
// the membership cache window (lib/sitemap.js revalidate: 300), plus slack
export const SITEMAP_MEMBERSHIP_CACHE_H = 0.25;

export function isNoindexHtml(html) {
  return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html ?? "");
}

// Per-URL <lastmod> from one sitemap child, as a Map(path -> ISO string).
export async function lastmodByPath(segment) {
  const res = await get(`/sitemaps/${segment}.xml`);
  const map = new Map();
  if (res.status !== 200) return map;
  for (const block of res.body.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = (block.match(/<loc>([^<]+)<\/loc>/) ?? [])[1];
    const lm = (block.match(/<lastmod>([^<]+)<\/lastmod>/) ?? [])[1];
    if (loc && lm) map.set(pathOf(decodeEntities(loc)), lm);
  }
  return map;
}

const hoursSince = (iso) => (Date.now() - Date.parse(iso)) / 3600_000;

// Is `location` the card page for a retired deal? The destination must be a
// /cards/<slug> page that resolves - never the homepage, an index, a species
// or a set page. WHICH card is correct is asserted per row, against the
// deal's own identity, in tests/scanner/deal-lifecycle-routes.test.mjs.
export async function isRetiredDealRedirect(location) {
  const target = pathOf(location ?? "");
  if (!/^\/cards\/[a-z0-9][a-z0-9-]*$/.test(target)) return { ok: false, reason: `destination ${target} is not a card page` };
  const res = await get(target);
  if (res.status !== 200) return { ok: false, reason: `destination ${target} -> HTTP ${res.status}` };
  return { ok: true, reason: null, target };
}

export async function classifyDealSample(url, res, lastmod = null) {
  const age = lastmod ? hoursSince(lastmod) : null;
  const seen = lastmod ? `last seen ${age.toFixed(1)}h ago` : "last-seen unknown";

  if (age != null && age > MAX_FRESHNESS_TTL_H + SITEMAP_MEMBERSHIP_CACHE_H) {
    return { kind: "defect", detail: `${url} is advertised but ${seen} - beyond the ${MAX_FRESHNESS_TTL_H}h maximum freshness TTL, so it cannot be indexable in any tier` };
  }
  if (res.isRedirect) {
    const dest = await isRetiredDealRedirect(res.location);
    if (!dest.ok) return { kind: "defect", detail: `${url} redirects, but ${dest.reason}` };
    return { kind: "race", detail: `${url} -> 308 ${dest.target} (ended after the snapshot, ${seen})` };
  }
  if (res.status === 200 && isNoindexHtml(res.body)) {
    if (age != null && age < MIN_FRESHNESS_TTL_H) {
      return { kind: "defect", detail: `${url} is noindex but ${seen} - inside the ${MIN_FRESHNESS_TTL_H}h minimum TTL, so freshness cannot explain it: a data-driven gate was missed when the segment was built` };
    }
    return { kind: "race", detail: `${url} -> noindex (${seen}, past the ${MIN_FRESHNESS_TTL_H}h minimum TTL)` };
  }
  return { kind: "ok", detail: null };
}

export function sample(arr, n) {
  if (arr.length <= n) return [...arr];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.floor((i * (arr.length - 1)) / (n - 1))]);
  }
  return [...new Set(out)];
}

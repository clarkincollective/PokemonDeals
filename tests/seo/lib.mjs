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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&middot;/g, "·");
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
// final " | Pokémon Deal Finder" template suffix. Used for the length
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
export function sample(arr, n) {
  if (arr.length <= n) return [...arr];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.floor((i * (arr.length - 1)) / (n - 1))]);
  }
  return [...new Set(out)];
}

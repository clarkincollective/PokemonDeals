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
// Sampled deal URLs: what a live observation can and cannot establish
// ---------------------------------------------------------------------------
//
// The live suite samples /deals/<id> URLs out of the sitemap. One of them can
// be ineligible by the time its page is fetched - the listing sold or ended,
// a hold or quarantine landed, it aged out of the freshness window - or the
// membership query advertised something it should already have excluded.
// Those are different things, and over HTTP they look identical.
//
// TWO EARLIER ATTEMPTS TO TELL THEM APART WERE WRONG, and both are pinned
// against in tests/scanner/sitemap-live-classification.test.mjs:
//
//   * the segment's <lastmod> with the freshness TTLs. <lastmod> is the
//     row's last_seen_at: it does not date the snapshot, a recent value with
//     a noindex page is explained by any later eligibility change, and age
//     past a TTL is equally consistent with membership that was already
//     stale when the segment was built.
//   * the response's cache metadata (Date - Age). That dates the HTTP cache
//     entry, not the application-cached membership behind it: the segment's
//     rows come from an unstable_cache with its own revalidate window, so a
//     CDN MISS can still serve a membership computed minutes earlier, and a
//     missing Age says nothing about when the membership was computed.
//
// So the ordering is simply NOT OBSERVABLE from here. What is recorded is
// what was actually seen: the URL was advertised in the segment, and the
// page responded thus. Anything that needs to know which happened first is
// INCONCLUSIVE, reported as such, and counted neither as a pass nor as a
// defect. No production timestamp, telemetry, provider call or repeated
// fetch is added to manufacture the missing chronology.
//
// What still fails unconditionally needs no chronology at all: a malformed
// URL in the segment, a redirect whose destination is not a resolving
// /cards/<slug>, a redirect chain or loop, and a server error. Genuinely
// incorrect membership is caught deterministically, on controlled data, by
// tests/scanner/sitemap-substance.test.mjs and the count/comment
// reconciliation in tests/seo/seo3-card-sitemap-shards.test.mjs.

export const CLASSIFICATION = Object.freeze({
  OK: "ok",
  DEFECT: "confirmed_contract_defect",
  INCONCLUSIVE: "inconclusive",
});

// One read of a sitemap child: which paths it advertises. Deliberately no
// generation time - see above.
export async function membershipSnapshot(segment) {
  const res = await get(`/sitemaps/${segment}.xml`);
  const advertised = new Set();
  if (res.status === 200) {
    for (const m of res.body.matchAll(/<loc>([^<]+)<\/loc>/g)) advertised.add(pathOf(decodeEntities(m[1].trim())));
  }
  return { segment, status: res.status, advertised };
}

export function isNoindexHtml(html) {
  return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html ?? "");
}

// UNCONDITIONAL destination validation for a deal redirect: shape, a single
// hop, and that the destination actually resolves. Whether it is the RIGHT
// card is not decidable here; that assertion lives in the offline harness
// (tests/scanner/deal-lifecycle-routes.test.mjs), where the row is known.
export async function checkRetiredDealRedirect(location) {
  const target = pathOf(location ?? "");
  if (!/^\/cards\/[a-z0-9][a-z0-9-]*$/.test(target)) return { ok: false, reason: `destination ${target} is not a card page` };
  const res = await get(target);
  if (res.isRedirect) return { ok: false, reason: `destination ${target} itself redirects to ${res.location} (chain or loop)` };
  if (res.status !== 200) return { ok: false, reason: `destination ${target} -> HTTP ${res.status}` };
  return { ok: true, reason: null, target };
}

// PURE. Records what was observed and says only what it establishes.
//   page { status, isRedirect, noindex, destinationOk, destinationReason }
//   advertised - the URL was present in the segment that was sampled
export function classifyDealObservation({ url, page, advertised = true }) {
  const seen = `advertised=${advertised}, page=HTTP ${page.status}${page.isRedirect ? ` -> ${page.location ?? "?"}` : page.status === 200 && page.noindex ? " noindex" : ""}`;
  const at = (kind, reason) => ({ kind, url, advertised, reason });

  // Unconditional: no chronology can excuse these.
  if (page.isRedirect && page.destinationOk === false) {
    return at(CLASSIFICATION.DEFECT, `${url} redirects, but ${page.destinationReason} (${seen})`);
  }
  if (page.status >= 500) {
    return at(CLASSIFICATION.DEFECT, `${url} is advertised but the page returned a server error: HTTP ${page.status} (${seen})`);
  }
  if (!page.isRedirect && page.status === 200 && !page.noindex) return at(CLASSIFICATION.OK, null);

  // Everything else - noindex, a valid redirect to a card page, 404 or 410 -
  // is a state the lifecycle legitimately produces. Which came first, the
  // membership or the change, is not observable over HTTP.
  return at(
    CLASSIFICATION.INCONCLUSIVE,
    `${url}: ${seen}. The lifecycle can legitimately produce this after the membership was computed, and no independent membership or transition timing is available - neither a defect nor a pass.`
  );
}

// Inconclusive observations are REPORTED, never silently absorbed.
export function reportObservations(label, observations) {
  const inconclusive = observations.filter((o) => o.kind === CLASSIFICATION.INCONCLUSIVE);
  if (inconclusive.length) {
    console.error(`  ${label}: ${inconclusive.length} INCONCLUSIVE observation(s) - lifecycle ordering not established by the available evidence:`);
    for (const o of inconclusive) console.error(`    - ${o.reason}`);
  }
  return { inconclusive };
}

export function sample(arr, n) {
  if (arr.length <= n) return [...arr];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.floor((i * (arr.length - 1)) / (n - 1))]);
  }
  return [...new Set(out)];
}

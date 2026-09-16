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
// Sampled deal URLs: what the evidence can and cannot establish
// ---------------------------------------------------------------------------
//
// A /deals/<id> URL taken from the sitemap can be ineligible by the time the
// page is fetched - the listing sold or ended (308 to its card page), a hold
// or quarantine landed, or it aged out of the freshness window. All of those
// are CORRECT behaviour. The defect is the opposite: a membership query that
// advertises a URL it should already have excluded.
//
// WHAT AN EARLIER VERSION OF THIS FILE GOT WRONG. It judged the two apart
// using the segment's <lastmod> and the freshness TTLs. Every step of that
// was unsound:
//   * <lastmod> is the row's last_seen_at. It is NOT when the segment was
//     generated, so it cannot date the snapshot.
//   * a recent last_seen_at with a noindex page is not a defect - a sale, a
//     hold, a quarantine or any other eligibility change can land after the
//     snapshot while the row was seen minutes ago.
//   * age beyond a TTL does not prove the row went stale AFTER the snapshot;
//     it is equally consistent with membership that was already stale when
//     the segment was built, which IS a defect.
//   * a redirect landing on a real card page does not prove that card is the
//     one this listing was for. Over HTTP the row is not available, so the
//     own-card assertion belongs in the offline harness
//     (tests/scanner/deal-lifecycle-routes.test.mjs), where the fixture row
//     and its destination are both known.
//
// WHAT THE EVIDENCE DOES SUPPORT. The cache metadata on the segment response
// dates the membership: generatedAt = Date(response) - age. If a membership
// generated AFTER the page was observed ineligible still advertises the URL,
// the query and the page genuinely disagree - a defect, with no timing
// inference. If such a membership no longer advertises it, the transition
// after the snapshot is confirmed. If no post-observation membership is
// available (the cache has not turned over), the observation is
// INCONCLUSIVE - reported as such, never counted as a pass or a defect.
//
// No production instrumentation and no provider request is added to fill the
// gap: transition records are not exposed over HTTP, and inventing a way to
// see them is not worth a test's convenience.

export const CLASSIFICATION = Object.freeze({
  OK: "ok",
  DEFECT: "confirmed_contract_defect",
  TRANSITION: "confirmed_transition_after_snapshot",
  INCONCLUSIVE: "inconclusive",
});

// When was this membership computed? `age` is how long the shared cache has
// been serving it, so Date(response) - age dates the generation. Absent age
// (a MISS, or a server that sends none) means it was generated for this
// request. Null when the response carries no usable Date at all.
export function membershipGeneratedAt(headers, receivedAt = Date.now()) {
  const dateHeader = headers?.get?.("date") ?? null;
  const ageHeader = headers?.get?.("age") ?? null;
  const base = dateHeader ? Date.parse(dateHeader) : receivedAt;
  if (!Number.isFinite(base)) return null;
  const age = ageHeader != null && /^\d+$/.test(String(ageHeader).trim()) ? Number(ageHeader) * 1000 : 0;
  return base - age;
}

// One read of a sitemap child, with the membership dated and the advertised
// paths extracted.
export async function membershipSnapshot(segment) {
  const receivedAt = Date.now();
  const res = await get(`/sitemaps/${segment}.xml`);
  const advertised = new Set();
  if (res.status === 200) {
    for (const m of res.body.matchAll(/<loc>([^<]+)<\/loc>/g)) advertised.add(pathOf(decodeEntities(m[1].trim())));
  }
  return {
    segment,
    status: res.status,
    advertised,
    generatedAt: res.status === 200 ? membershipGeneratedAt(res.headers, receivedAt) : null,
    cacheState: res.headers?.get?.("x-vercel-cache") ?? null,
  };
}

export function isNoindexHtml(html) {
  return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html ?? "");
}

// UNCONDITIONAL destination validation for a retired-deal redirect. Shape,
// single hop, and that the destination actually resolves. Whether it is the
// RIGHT card is not decidable here and is asserted per row offline.
export async function checkRetiredDealRedirect(location) {
  const target = pathOf(location ?? "");
  if (!/^\/cards\/[a-z0-9][a-z0-9-]*$/.test(target)) return { ok: false, reason: `destination ${target} is not a card page` };
  const res = await get(target);
  if (res.isRedirect) return { ok: false, reason: `destination ${target} itself redirects to ${res.location} (chain or loop)` };
  if (res.status !== 200) return { ok: false, reason: `destination ${target} -> HTTP ${res.status}` };
  return { ok: true, reason: null, target };
}

// PURE. Given what was observed, say what the evidence establishes.
//
//   page     { status, isRedirect, noindex, destinationOk, destinationReason, observedAt }
//   snapshot { generatedAt } - the membership the URL was sampled from
//   recheck  { generatedAt, advertised } | null - a later membership read
//
// Fixtures for the three outcomes live in
// tests/scanner/sitemap-live-classification.test.mjs.
export function classifyDealObservation({ url, page, snapshot = null, recheck = null }) {
  const at = (kind, reason) => ({ kind, url, reason });

  // Unconditional failures: nothing about timing can excuse these.
  if (page.isRedirect && page.destinationOk === false) {
    return at(CLASSIFICATION.DEFECT, `${url} redirects, but ${page.destinationReason}`);
  }
  if (!page.isRedirect && page.status !== 200) {
    return at(CLASSIFICATION.DEFECT, `${url} is advertised but returned HTTP ${page.status}`);
  }
  if (!page.isRedirect && page.status === 200 && !page.noindex) return at(CLASSIFICATION.OK, null);

  // The URL is advertised and not indexable. Only a membership computed
  // AFTER the observation can say which side is wrong.
  const observedAt = page.observedAt ?? null;
  if (recheck && recheck.generatedAt != null && observedAt != null && recheck.generatedAt > observedAt) {
    return recheck.advertised
      ? at(CLASSIFICATION.DEFECT, `${url} is not indexable, yet a membership generated after it was observed (${new Date(recheck.generatedAt).toISOString()}) still advertises it`)
      : at(CLASSIFICATION.TRANSITION, `${url} left the indexable set after the snapshot; the membership generated at ${new Date(recheck.generatedAt).toISOString()} no longer advertises it`);
  }
  const why =
    recheck == null
      ? "no later membership was read"
      : recheck.generatedAt == null
        ? "the later membership carried no usable cache metadata"
        : `the latest membership (${new Date(recheck.generatedAt).toISOString()}) predates the observation`;
  return at(
    CLASSIFICATION.INCONCLUSIVE,
    `${url} is advertised but not indexable; ${why}, and transition timing is not exposed over HTTP - neither a defect nor a pass${snapshot?.generatedAt ? ` (sampled membership generated ${new Date(snapshot.generatedAt).toISOString()})` : ""}`
  );
}

// A readable line for the suite output. Inconclusive observations are
// REPORTED, never silently absorbed.
export function reportObservations(label, observations) {
  const inconclusive = observations.filter((o) => o.kind === CLASSIFICATION.INCONCLUSIVE);
  const transitions = observations.filter((o) => o.kind === CLASSIFICATION.TRANSITION);
  if (transitions.length) console.error(`  ${label}: ${transitions.length} confirmed transition(s) after the snapshot`);
  if (inconclusive.length) {
    console.error(`  ${label}: ${inconclusive.length} INCONCLUSIVE observation(s) - not verified, not a defect:`);
    for (const o of inconclusive) console.error(`    - ${o.reason}`);
  }
  return { inconclusive, transitions };
}

export function sample(arr, n) {
  if (arr.length <= n) return [...arr];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.floor((i * (arr.length - 1)) / (n - 1))]);
  }
  return [...new Set(out)];
}

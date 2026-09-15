// IndexNow submission - tells Bing, DuckDuckGo, Yandex, Seznam and Naver
// (the IndexNow participants; Google does not take part) which URLs to
// crawl, straight from the live sitemaps. A new domain otherwise waits on
// those engines' own discovery the same way it waits on Google's.
//
// The key is a plain file the engines fetch to prove we own the host:
// public/<key>.txt, served at https://pokemondealfinder.com/<key>.txt. The
// key is not a secret (it is public by design), so it lives in the repo.
//
//   node scripts/indexnowSubmit.mjs                       # every URL in every child sitemap
//   node scripts/indexnowSubmit.mjs --segments pages,sets,pokemon
//   node scripts/indexnowSubmit.mjs --urls /cards,/pokemon  # explicit paths
//   node scripts/indexnowSubmit.mjs --dry                   # count only, no request
//
// One POST per 10,000 URLs (the protocol's per-request cap). 200 / 202 =
// accepted; 4xx is printed and the run exits 1. Read-only against the
// site; nothing is written anywhere.

const SITE = "https://pokemondealfinder.com";
const HOST = "pokemondealfinder.com";
const KEY = "7a55ee1154e991b2366b89fcc47ed41e";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH = 10_000;

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? "");
};
const dry = args.includes("--dry");

async function locsOf(xmlUrl) {
  const res = await fetch(xmlUrl, { headers: { "user-agent": "pokemondealfinder-indexnow" } });
  if (!res.ok) throw new Error(`${xmlUrl}: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function collect() {
  const explicit = opt("urls");
  if (explicit != null) {
    return explicit
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => (p.startsWith("http") ? p : `${SITE}${p.startsWith("/") ? p : `/${p}`}`));
  }
  const children = await locsOf(`${SITE}/sitemap.xml`);
  const wanted = opt("segments");
  const keep = wanted ? new Set(wanted.split(",").map((s) => s.trim())) : null;
  const urls = [];
  for (const child of children) {
    const segment = child.match(/\/sitemaps\/([^/]+)\.xml$/)?.[1];
    if (keep && !keep.has(segment)) continue;
    const locs = await locsOf(child);
    console.log(`${segment}: ${locs.length}`);
    urls.push(...locs);
  }
  return [...new Set(urls)].filter((u) => u.startsWith(SITE));
}

async function submit(urlList) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
  });
  const text = (await res.text()).trim();
  return { status: res.status, text };
}

const urls = await collect();
console.log(`${urls.length} URLs`);
if (dry) process.exit(0);

let failed = false;
for (let i = 0; i < urls.length; i += BATCH) {
  const chunk = urls.slice(i, i + BATCH);
  const { status, text } = await submit(chunk);
  const ok = status === 200 || status === 202;
  console.log(`batch ${i / BATCH + 1}: ${chunk.length} URLs -> HTTP ${status}${text ? ` ${text}` : ""}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);

// SOCIAL-LIVE-3 - is a published post actually PUBLIC on the right account?
// Uses each platform's own public, unauthenticated endpoint (no scraping of
// logged-in pages). -> { ok, detail }

const ACCOUNTS = Object.freeze({ youtube: "@pokemondealfinder", tiktok: "pokemondealfinder", x: "pkmdealfinder", instagram: "pokemondealfinder" });

export async function verifyPublicPost(platform, url, { fetchImpl = fetch } = {}) {
  if (!url) return { ok: false, detail: "no platform URL recorded" };
  const t = { signal: AbortSignal.timeout(20000) };
  try {
    if (platform === "youtube") {
      const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, t);
      const j = r.ok ? await r.json() : null;
      return { ok: Boolean(j && String(j.author_url ?? "").toLowerCase().includes(ACCOUNTS.youtube)), detail: j ? `${j.author_name} · ${j.title}` : `oembed http ${r.status}` };
    }
    if (platform === "tiktok") {
      // Buffer records "https://tiktok.com/@..."; TikTok's oEmbed only accepts www.
      const u = String(url).replace(/^https?:\/\/(?:m\.)?tiktok\.com\//i, "https://www.tiktok.com/");
      const r = await fetchImpl(`https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`, t);
      const j = r.ok ? await r.json() : null;
      return { ok: Boolean(j && j.author_unique_id === ACCOUNTS.tiktok && j.thumbnail_url), detail: j ? `@${j.author_unique_id} thumbnail ${j.thumbnail_width}x${j.thumbnail_height}` : `oembed http ${r.status}` };
    }
    if (platform === "x") {
      const id = /status\/(\d+)/.exec(url)?.[1];
      const r = await fetchImpl(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=a`, t);
      const j = r.ok ? await r.json().catch(() => null) : null;
      return { ok: Boolean(j && String(j.user?.screen_name ?? "").toLowerCase() === ACCOUNTS.x), detail: j ? `@${j.user?.screen_name} media ${(j.mediaDetails ?? []).length}` : `syndication http ${r.status}` };
    }
    if (platform === "instagram") {
      const r = await fetchImpl(url, { ...t, headers: { "User-Agent": "facebookexternalhit/1.1" } });
      const html = r.ok ? await r.text() : "";
      const og = /<meta property="og:url" content="([^"]+)"/.exec(html)?.[1] ?? "";
      return { ok: og.includes(`/${ACCOUNTS.instagram}/`), detail: og ? og : `http ${r.status}` };
    }
  } catch (e) {
    return { ok: false, detail: String(e?.message ?? e).slice(0, 120) };
  }
  return { ok: false, detail: `unknown platform ${platform}` };
}

// SOCIAL-LIVE-3 - autopilot creative: one 4:5 image (Instagram + X) and the
// 9:16 scene set for one short video (TikTok + YouTube Shorts), plus the
// per-platform captions. Deterministic HTML in the brand tokens; every word
// and number comes from the story object. The background is an approved,
// safety-scanned OpenAI image from the reusable library (no new generation).

import { TOKENS } from "../creativeSpec.mjs";
import { FONT_FACE_CSS } from "../fontData.mjs";
import { fitText, fitHeroNumber } from "../../newsroom/hybrid/textFit.mjs";
import { attributedCtaUrl } from "../distribution/attribution.mjs";

const C = TOKENS.color;
const S = Object.fromEntries(Object.entries(TOKENS.type).map(([k, v]) => [k, v && typeof v === "object" ? v.size : v]));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const usd = (n) => { const v = Number(n); const cents = v < 100 && !Number.isInteger(v); return `$${v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`; };
const SITE = "pokemondealfinder.com";

function page({ w, h, bg, inner, blur = 0, dim = [0.62, 0.42, 0.78] }) {
  const bgLayer = bg
    ? `<div style="position:absolute;inset:${blur ? -40 : 0}px;background:${C.bg} url('${bg}') center/cover no-repeat;${blur ? `filter:blur(${blur}px);` : ""}"></div>
       <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,13,${dim[0]}),rgba(11,11,13,${dim[1]}) 45%,rgba(11,11,13,${dim[2]}))"></div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_FACE_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:${C.bg};color:${C.ink};font-family:${S.family};-webkit-font-smoothing:antialiased}
.eyebrow{font-size:${S.label}px;letter-spacing:.16em;text-transform:uppercase;color:${C.up};font-weight:800}
.wm{font-size:${S.fine}px;letter-spacing:.02em;color:${C.inkSub};font-weight:800}
.card{border-radius:16px;display:block;object-fit:contain;box-shadow:0 24px 60px rgba(0,0,0,.55)}
.num{font-weight:800;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;line-height:.95}
</style></head><body>${bgLayer}<div style="position:absolute;inset:0">${inner}</div></body></html>`;
}

// ---- 4:5 image ----------------------------------------------------------
export function renderStoryImageHtml(story, { art = {}, bg = null } = {}) {
  const W = 1080, H = 1350, PAD = 76, inner = W - 2 * PAD;
  const head = fitText(story.headline, { boxW: inner, minPx: 40, maxPx: 62, maxLines: 3, tracking: -0.02, lineHeight: 1.04 });
  const top = `
    <div style="display:flex;justify-content:space-between;align-items:baseline"><div class="eyebrow">${esc(story.eyebrow)}</div><div class="wm">PokemonDealFinder</div></div>
    <h1 style="font-size:${head.px}px;line-height:1.04;letter-spacing:-0.02em;font-weight:800;margin-top:16px">${esc(story.headline)}</h1>
    <div style="font-size:${S.body}px;line-height:1.3;color:${C.inkSub};margin-top:12px;max-width:40ch">${esc(story.sub)}</div>`;
  let body;
  if (story.layout === "tip") {
    const c = story.cards[0];
    const cardH = 600, cardW = Math.round(cardH * 0.717), gap = 44, railW = inner - cardW - gap;
    body = `<div style="display:flex;gap:${gap}px;align-items:center;flex:1;min-height:0">
      <div style="flex:0 0 ${cardW}px;display:flex;flex-direction:column;gap:12px">
        <img class="card" src="${esc(art[c.id])}" style="width:${cardW}px;height:${cardH}px">
        <div style="font-size:${S.fine}px;color:${C.inkSub};text-align:center">${esc(c.name)} &middot; ${esc(c.detail)}</div>
      </div>
      <div style="flex:0 0 ${railW}px;display:flex;flex-direction:column;gap:22px">
        ${story.points.map((p) => `<div style="border-left:4px solid ${C.up};padding-left:18px">
          <div style="font-size:${fitText(p.title, { boxW: railW - 24, minPx: 26, maxPx: 38, maxLines: 1 }).px}px;font-weight:800;line-height:1.05">${esc(p.title)}</div>
          <div style="font-size:${S.fine + 3}px;line-height:1.3;color:${C.inkSub};margin-top:6px">${esc(p.text)}</div></div>`).join("")}
      </div></div>`;
  } else {
    const gap = 28, cellW = Math.floor((inner - 2 * gap) / 3), cardH = Math.round(cellW / 0.717);
    body = `<div style="display:flex;gap:${gap}px;align-items:center;justify-content:center;flex:1;min-height:0">
      ${story.cards.slice(0, 3).map((c, i) => {
        const label = story.labels?.[i] ?? c.name;
        const lf = fitText(label, { boxW: cellW, minPx: 20, maxPx: 26, maxLines: 2, lineHeight: 1.15 });
        const price = c.market_usd != null ? `<div class="num" style="font-size:${fitHeroNumber(usd(c.market_usd), cellW, { minPx: 36, maxPx: 60 }).px}px;color:${C.up};margin-top:4px">${usd(c.market_usd)}</div>` : "";
        return `<div style="flex:0 0 ${cellW}px;width:${cellW}px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
          <img class="card" src="${esc(art[c.id])}" style="width:${cellW}px;height:${cardH}px">
          <div style="font-size:${lf.px}px;font-weight:800;line-height:1.15;max-width:100%">${esc(label)}</div>
          <div style="font-size:${S.fine}px;color:${C.inkSub};line-height:1.2">${esc(c.detail)}</div>${price}</div>`;
      }).join("")}</div>`;
  }
  const foot = `
    <div style="border-top:1px solid ${C.hair};padding-top:16px;font-size:${S.fine + 2}px;line-height:1.35;color:${C.inkSub}">${esc(story.note)}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
      <span style="font-size:${S.fine}px;color:${C.inkFaint}">${story.href.length <= 34 ? esc(story.href) : ""}</span>
      <span style="font-size:${S.cta}px;font-weight:800;color:${C.ink}">${SITE} &rarr;</span></div>`;
  return page({ w: W, h: H, bg, inner: `<div style="position:absolute;inset:${PAD}px;display:flex;flex-direction:column;gap:26px">${top}${body}<div>${foot}</div></div>` });
}

// ---- 9:16 video scenes ------------------------------------------------------
// safe area: top 210, bottom 420 (platform UI), sides 96
export function renderStoryScenesHtml(story, { art = {}, bg = null } = {}) {
  const W = 1080, H = 1920, L = 96, inner = W - 2 * L;
  const frame = (inner) => page({ w: W, h: H, bg, blur: 26, dim: [0.7, 0.55, 0.8], inner: `<div style="position:absolute;top:120px;left:${L}px" class="wm">PokemonDealFinder</div><div style="position:absolute;left:${L}px;right:${L}px;top:230px;bottom:420px;display:flex;flex-direction:column;justify-content:center">${inner}</div>` });
  const scenes = [];
  const hh = fitText(story.headline, { boxW: inner, minPx: 70, maxPx: 112, maxLines: 5, tracking: -0.03, lineHeight: 1.02 });
  scenes.push({ id: "hook", secs: 3.0, html: frame(`<div style="display:flex;flex-direction:column;gap:36px">
    <div class="eyebrow" style="font-size:34px">${esc(story.eyebrow)}</div>
    <div style="font-size:${hh.px}px;font-weight:800;line-height:1.02;letter-spacing:-0.03em">${esc(story.headline)}</div>
    <div style="font-size:44px;line-height:1.25;color:${C.inkSub}">${esc(story.sub)}</div></div>`) });
  if (story.layout === "tip") {
    const c = story.cards[0];
    story.points.forEach((p, i) => scenes.push({ id: `point${i}`, secs: 2.8, html: frame(`<div style="display:flex;flex-direction:column;align-items:center;gap:40px;text-align:center">
      <img class="card" src="${esc(art[c.id])}" style="height:760px;border-radius:24px">
      <div style="font-size:${fitText(p.title, { boxW: inner, minPx: 56, maxPx: 96, maxLines: 1 }).px}px;font-weight:800;color:${C.up};line-height:1">${esc(p.title)}</div>
      <div style="font-size:48px;line-height:1.25">${esc(p.text)}</div></div>`) }));
  } else {
    story.cards.slice(0, 3).forEach((c, i) => {
      const label = story.labels?.[i] ?? c.name;
      scenes.push({ id: `card${i}`, secs: 2.8, html: frame(`<div style="display:flex;flex-direction:column;align-items:center;gap:30px;text-align:center">
        <img class="card" src="${esc(art[c.id])}" style="height:820px;border-radius:24px">
        <div style="font-size:${fitText(label, { boxW: inner, minPx: 48, maxPx: 76, maxLines: 2, lineHeight: 1.05 }).px}px;font-weight:800;line-height:1.05">${esc(label)}</div>
        <div style="font-size:40px;color:${C.inkSub}">${esc(c.detail)}</div>
        ${c.market_usd != null ? `<div style="display:flex;align-items:baseline;gap:20px"><div class="num" style="font-size:112px;color:${C.up}">${usd(c.market_usd)}</div><div style="font-size:34px;color:${C.inkSub};text-align:left;line-height:1.2">market reference<br>Near Mint</div></div>` : ""}
      </div>`) });
    });
  }
  scenes.push({ id: "end", secs: 3.2, html: frame(`<div style="display:flex;flex-direction:column;align-items:center;gap:40px;text-align:center">
    <div style="font-size:52px;line-height:1.25;color:${C.inkSub}">${esc(story.note)}</div>
    <div style="font-size:${fitText(SITE, { boxW: inner - 20, minPx: 48, maxPx: 88, maxLines: 1, tracking: -0.02 }).px}px;font-weight:800;letter-spacing:-0.02em;line-height:1;white-space:nowrap">${SITE}</div>
    <div style="font-size:${story.href.length > 34 ? 30 : 40}px;color:${C.up};font-weight:800;word-break:break-all">${esc(story.href)}</div></div>`) });
  return scenes;
}

// ---- captions -------------------------------------------------------------
export function storyCaptions(story, { storyId }) {
  const link = (platform) => attributedCtaUrl({ baseUrl: `https://${SITE}${story.href}`, platform, contentGoal: "TRUST", contentId: storyId });
  const facts = story.cards.map((c, i) => `${story.labels?.[i] ?? c.name} (${c.detail})${c.market_usd != null ? `: ${usd(c.market_usd)}` : ""}`);
  const tags = story.hashtags ?? ["#pokemontcg"];
  const factLines = story.layout === "tip" ? story.points.map((p) => `${p.title}: ${p.text}`) : facts;
  const priceNote = story.cards.some((c) => c.market_usd != null) ? `\nNear Mint market references as of ${story.date_label}; not a guaranteed sale price.` : "";
  const ig = [story.headline, "", story.sub, "", ...factLines.map((l) => `• ${l}`), priceNote, "", story.note, "", `More on ${SITE}${story.href}`, "", tags.join(" ")].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // X-SPECIFIC BODY (optional). X is the one feed where the shared
  // headline+note composition routinely overruns: the attributed URL alone is
  // ~161 raw characters, so the 275 guard below drops the note and leaves
  // headline + link. A story may therefore author `xText` - hook, one
  // actionable point and the caveat, sized to fit WITH the link - and skip the
  // hashtags to buy the room. Nothing else changes: the URL is still built by
  // attributedCtaUrl (never hand-written, parameters untouched), and every
  // other platform's caption is composed exactly as before.
  //
  // The 275 raw guard stays while Buffer's URL counting is unverified. X's own
  // rules weight a URL at 23, but Buffer once rejected a 297-char caption on a
  // raw count, so an over-long caption must still degrade rather than be sent.
  let x = story.xText
    ? `${story.xText}\n\n${link("x")}`
    : `${story.headline}\n${story.layout === "tip" ? story.note : factLines.join("\n")}\n\n${link("x")}\n\n${tags.slice(0, 2).join(" ")}`;
  if (x.length > 275) x = `${story.headline}\n\n${link("x")}\n\n${tags.slice(0, 2).join(" ")}`;
  const tiktok = [story.headline, "", ...factLines, priceNote.trim(), "", `More on ${SITE}`, "", [...tags, "#pokemon"].join(" ")].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const ytTitle = `${story.headline.replace(/[.:]+$/, "").slice(0, 88)} #shorts`;
  const youtube = [story.sub, "", ...factLines, priceNote.trim(), "", `More: ${link("youtube")}`, "", "#shorts #pokemon #pokemontcg"].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    instagram: { text: ig, siteLink: link("instagram") },
    x: { text: x },
    tiktok: { text: tiktok.slice(0, 2100), tiktokTitle: story.headline.slice(0, 90) },
    youtube: { text: youtube.slice(0, 4900), youtubeTitle: ytTitle },
  };
}

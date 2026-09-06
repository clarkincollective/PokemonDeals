// Phase 13E.4 - `npm run social:video`
//
// The production entry point for the deterministic short-form VIDEO
// system (Instagram Reels + TikTok). It:
//   1. selects verified content from real fixtures (the frozen 13E.3D
//      payload builders - hook engine / resolveCta / content_goal)
//   2. resolves REAL canonical card artwork (fail closed where a family
//      requires it) and an already-APPROVED OpenAI background
//   3. builds a structured timeline, renders it to an animated HTML
//      document, and rasterises that frame-by-frame under a virtual
//      clock into an H.264 / yuv420p / 1080x1920 / 30fps MP4
//   4. drafts IG + TikTok captions and runs the video QA gate
//   5. writes a local review bundle to .social-preview/13e4/
//
// It NEVER publishes, schedules, or calls OpenAI. Preview MP4s are local
// artefacts only (gitignored via .social-preview/).

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { buildDealPayload, buildMoverPayload, buildSpotlightPayload } from "../lib/social/payload.mjs";
import { pathToFileUrl } from "../lib/social/templates.mjs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { resolveCardArtwork, CARD_ART_CACHE_DIR } from "../lib/social/cardArtwork.mjs";
import { fetchCatalogRows } from "../lib/social/db.mjs";
import { loadAssetManifest, resolveBackgroundForPost } from "../lib/social/assets.mjs";
import { buildCarouselSequence, TOKENS } from "../lib/social/creativeSpec.mjs";
import { buildVideoTimeline, VIDEO_PLATFORMS } from "../lib/social/videoTimeline.mjs";
import { renderVideoHtml } from "../lib/social/videoDocument.mjs";
import { renderTimelineToMp4, probeMp4 } from "../lib/social/videoRender.mjs";
import { buildVideoCaptions } from "../lib/social/videoCaption.mjs";
import { runVideoQa } from "../lib/social/videoQa.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "13e4");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("-")); // optional family filter
const PLATFORMS = process.argv.includes("--reel-only") ? ["reel"] : VIDEO_PLATFORMS;

const fx = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/social-deals.json"), "utf8"));
const now = Date.now();
const manifest = loadAssetManifest().manifest;
const C = TOKENS.color;

const rowOf = (label) => (fx.deals.find((d) => d.label === label) ?? fx.deals[0]).row;
const bgFor = (payload) => {
  const bg = manifest ? resolveBackgroundForPost(payload, { manifest }) : null;
  return bg && existsSync(bg.absFile) ? bg : null;
};

// ---- real canonical card artwork -------------------------------------
let CATALOG = {};
async function artFor(row) {
  const r = await resolveCardArtwork(
    { card_tcgplayer_id: row.card_tcgplayer_id, card_name: row.card_name, card_set: row.card_set },
    { rightsState: RIGHTS_STATE, catalogRow: CATALOG[String(row.card_tcgplayer_id)] ?? null, cacheDir: CARD_ART_CACHE_DIR },
  );
  if (r.status !== "ready") return null;
  return { card: { fileUrl: pathToFileUrl(r.localPath) }, tcgplayerId: String(row.card_tcgplayer_id), localPath: r.localPath };
}

// ---- one real pokemondealfinder.com screenshot (brand family) -------
async function captureSite(url, outPath, { w = 1000, h = 1180 } = {}) {
  const userDir = path.join(os.tmpdir(), "pdf-vshot-" + Date.now());
  const chrome = spawn(
    process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--remote-debugging-port=0", "--user-data-dir=" + userDir, "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let ws = null;
  chrome.stderr.on("data", (b) => {
    const m = String(b).match(/ws:\/\/[^\s]+/);
    if (m && !ws) ws = m[0];
  });
  for (let i = 0; i < 100 && !ws; i++) await sleep(100);
  if (!ws) {
    chrome.kill();
    throw new Error("no CDP endpoint for screenshot");
  }
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => {
    sock.addEventListener("open", res, { once: true });
    sock.addEventListener("error", rej, { once: true });
  });
  let id = 0;
  const cdp = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      const on = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.id === mid) {
          sock.removeEventListener("message", on);
          m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result);
        }
      };
      sock.addEventListener("message", on);
      sock.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }));
    });
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => cdp(m, p, sessionId);
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await sleep(3500);
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(outPath, Buffer.from(data, "base64"));
  sock.close();
  chrome.kill();
  return outPath;
}

// ---- content-slot builders (verified payload -> renderer slots) ----
function dealDropContent(payload, art) {
  const d = payload.deal_data;
  const pct = Math.round(d.discount_pct * 100);
  const listed = Number(d.total_price_usd ?? d.total_price);
  const reference = Number(d.market_price);
  const savingUsd = Math.max(0, Math.round(reference - listed));
  // the hero metric must NOT restate what the hook already says. If the
  // hook carries the "%", lead with dollars saved; otherwise lead with %.
  const hookHasPct = /%/.test(payload.hook.text);
  return {
    hookText: payload.hook.text,
    metricValue: hookHasPct ? `$${savingUsd}` : `${pct}%`,
    metricLabel: hookHasPct ? "SAVED VS. RECENT MARKET" : "BELOW RECENT MARKET",
    listed,
    reference,
    accentColor: C.up, // real positive discount only
    tag: `${d.is_graded ? `${d.grader ?? "Graded"} ${d.grade ?? ""}`.trim() : "Raw"} · ${String(d.marketplace ?? "EBAY_US").replace("EBAY_", "eBay ")}`,
  };
}

function moverContent(payload, art) {
  const m = payload.movement;
  const series = m.series ?? [];
  const dir = m.direction === "up" ? "up" : "down";
  const row = payload.deal_data ?? payload.subject ?? {};
  return {
    name: row.card_name ?? "",
    set: row.card_set ?? "",
    moveValue: `${dir === "up" ? "▲" : "▼"} ${Math.round(Math.abs(m.pct) * 100)}%`,
    periodLabel: `Last ${m.windowLabel}`,
    series,
    firstValue: series[0]?.v ?? null,
    lastValue: series[series.length - 1]?.v ?? null,
    accentColor: dir === "up" ? C.up : C.down,
  };
}

function carouselContent(timeline, cards, moreCount) {
  return {
    hookText: timeline.facts.hook_text,
    moreCount,
    cards: cards.map((c) => ({
      fileUrl: c.art.card.fileUrl,
      name: c.row.card_name ?? "",
      metricValue: `${Math.round(c.row.discount_pct * 100)}%`,
      listed: Number(c.row.total_price_usd ?? c.row.total_price),
      reference: Number(c.row.market_price),
      accentColor: C.up,
    })),
  };
}

// ---- per-family production ------------------------------------------
async function produceDealDrop() {
  // biggest genuine gap in the set -> the strongest, fully data-supported hook
  const row = rowOf("short-name raw, large saving");
  const payload = buildDealPayload({ contentType: "deal_of_day", row, now, utmCampaign: "deal_of_day" });
  const art = await artFor(row);
  const bg = bgFor(payload);
  const content = dealDropContent(payload, art);
  console.log(`  deal_drop: card=${art ? "ready " + art.tcgplayerId : "UNRESOLVED"} bg=${bg ? bg.assetId : "none"} hook="${payload.hook.text}"`);
  return { family: "deal_drop", payload, layers: { cardArtwork: art, background: bg }, content, fixtureId: row.id };
}

async function produceMarketMover() {
  for (const mv of fx.movers) {
    if (!mv.movement || mv.movement.ok !== true) continue;
    const art = await artFor(mv.row);
    if (!art) {
      console.warn(`  market_mover: "${mv.row.card_name}" canonical artwork unresolved - trying next mover (fail closed)`);
      continue;
    }
    if ((mv.movement.series?.length ?? 0) < 6) {
      console.warn(`  market_mover: "${mv.row.card_name}" history too thin - trying next mover (fail closed)`);
      continue;
    }
    const payload = buildMoverPayload({ row: mv.row, movement: mv.movement, now });
    const bg = bgFor(payload);
    const content = moverContent(payload, art);
    return { family: "market_mover", payload, layers: { cardArtwork: art, background: bg }, content, fixtureId: mv.row.id };
  }
  return { family: "market_mover", skipped: "no mover had BOTH confident history AND resolvable canonical artwork" };
}

async function produceCarousel() {
  const cRows = [...fx.deals.map((d) => d.row), ...(fx.carousel?.deals ?? [])];
  const payload = buildSpotlightPayload({
    contentType: "pokemon_spotlight",
    displayName: "Under market today",
    dealCount: cRows.length,
    topDeals: cRows,
    destinationRoute: "/deals",
    now,
  });
  const seq = buildCarouselSequence(cRows);
  const cardSlides = seq.slides.filter((x) => x.kind === "card");
  const resolved = [];
  for (const cs of cardSlides) {
    const art = await artFor(cs.deal);
    if (art) resolved.push({ row: cs.deal, art });
  }
  if (resolved.length < 2) {
    return { family: "hook_carousel", skipped: `only ${resolved.length} distinct card(s) had resolvable canonical artwork (need >= 2)` };
  }
  const moreCount = Math.max(0, seq.distinctPrintings - resolved.length);
  const carousel = {
    distinctCount: resolved.length,
    distinctPrintings: seq.distinctPrintings,
    moreCount,
    cards: resolved.map((r) => ({ fileUrl: r.art.card.fileUrl, tcgplayerId: r.art.tcgplayerId, name: r.row.card_name })),
  };
  const bg = bgFor(payload);
  return {
    family: "hook_carousel",
    payload,
    carousel,
    layers: { background: bg },
    contentFrom: (timeline) => carouselContent(timeline, resolved, moreCount),
    fixtureId: resolved.map((r) => r.row.id),
  };
}

async function produceBrand(shotPath) {
  if (!existsSync(shotPath)) return { family: "brand_ad", skipped: "no pokemondealfinder.com screenshot captured" };
  const row = rowOf("raw, high price");
  const base = buildDealPayload({ contentType: "deal_of_day", row, now, utmCampaign: "brand_ad" });
  // the brand video is not about this one deal - drop the deal's baked
  // hook + creative id so buildVideoTimeline mints a brand_ad identifier
  // and uses the fixed brand hook.
  const { hook: _h, creative: _c, cta: _cta, ...rest } = base;
  const payload = { ...rest, content_type: "brand_ad", content_goal: "BRAND", destination: { route: "/deals" } };
  const bg = bgFor(base);
  const content = { benefits: ["Live eBay listings", "Real market reference", "Below-market finds"], urlLabel: "pokemondealfinder.com" };
  return {
    family: "brand_ad",
    payload,
    layers: { background: bg, screenshot: { fileUrl: pathToFileUrl(shotPath) } },
    content,
    fixtureId: row.id,
  };
}

// ---- render one family for reel + tiktok ---------------------------
async function renderFamily(spec) {
  if (spec.skipped) {
    console.warn(`\n[${spec.family}] SKIPPED - ${spec.skipped}`);
    return { family: spec.family, skipped: spec.skipped, platforms: {} };
  }
  const results = {};
  for (const platform of PLATFORMS) {
   try {
    const carousel = spec.carousel ?? null;
    const timeline = buildVideoTimeline({
      payload: spec.payload,
      family: spec.family,
      platform,
      cardArtwork: spec.layers?.cardArtwork ?? null,
      background: spec.layers?.background ?? null,
      carousel,
    });
    const content = spec.contentFrom ? spec.contentFrom(timeline) : spec.content;
    const html = renderVideoHtml(timeline, content, spec.layers ?? {});
    const outPath = path.join(OUT, `${spec.family}_${platform}.mp4`);
    const t0 = Date.now();
    let r;
    try {
      r = await renderTimelineToMp4(timeline, html, outPath);
    } catch (e) {
      console.error(`  [${spec.family}/${platform}] render attempt 1 failed (${e.message}) - retrying once`);
      r = await renderTimelineToMp4(timeline, html, outPath);
    }
    const probe = await probeMp4(outPath);
    const captions = buildVideoCaptions({ timeline, payload: spec.payload });
    const qa = await runVideoQa({ timeline, mp4: outPath, payload: spec.payload, captions, layers: { ...spec.layers, carousel } });
    console.log(
      `  [${spec.family}/${platform}] ${((Date.now() - t0) / 1000).toFixed(1)}s  ${probe.width}x${probe.height} ${probe.codec}/${probe.pix_fmt} ${r.frames}f/${(timeline.durationMs / 1000).toFixed(1)}s  QA ${qa.ok ? "PASS" : "FAIL"}${qa.ok ? "" : " -> " + qa.failed.join("; ")}`,
    );
    results[platform] = {
      mp4: path.relative(ROOT, outPath),
      content_id: timeline.content_id,
      content_goal: timeline.content_goal,
      hook: timeline.facts.hook_text,
      cta_label: timeline.facts.cta_label,
      cta_url: timeline.facts.cta_url,
      duration_s: timeline.durationMs / 1000,
      frames: r.frames,
      probe,
      qa: { ok: qa.ok, passed: qa.passed, total: qa.total, failed: qa.failed },
      captions,
    };
   } catch (e) {
    console.error(`  [${spec.family}/${platform}] render error: ${e.message}`);
    results[platform] = { error: e.message };
   }
  }
  return { family: spec.family, background_id: spec.layers?.background?.assetId ?? null, fixtureId: spec.fixtureId ?? null, platforms: results };
}

async function main() {
  // a full run starts clean; a family-filtered run keeps the other
  // families' clips in place (so a re-render of one family is cheap).
  if (ONLY.length === 0) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const ids = [...new Set([...fx.deals, ...(fx.movers ?? []).map((m) => ({ row: m.row })), ...(fx.carousel?.deals ?? []).map((r) => ({ row: r }))].map((d) => d.row.card_tcgplayer_id).filter(Boolean).map(String))];
  ({ byId: CATALOG } = await fetchCatalogRows(ids).catch(() => ({ byId: {} })));

  const shotPath = path.join(ROOT, ".social-preview", "brand-ad", "home.png");
  mkdirSync(path.dirname(shotPath), { recursive: true });
  try {
    await captureSite("https://pokemondealfinder.com/", shotPath);
    console.log("captured real site screenshot ->", path.relative(ROOT, shotPath));
  } catch (e) {
    console.warn("screenshot capture failed:", e.message);
  }

  const want = (fam) => ONLY.length === 0 || ONLY.includes(fam);
  const tryProduce = async (fam, fn) => {
    try {
      return await fn();
    } catch (e) {
      console.error(`  [${fam}] production error: ${e.message}`);
      return { family: fam, skipped: `production error: ${e.message}` };
    }
  };
  const specs = [];
  if (want("deal_drop")) specs.push(await tryProduce("deal_drop", produceDealDrop));
  if (want("market_mover")) specs.push(await tryProduce("market_mover", produceMarketMover));
  if (want("hook_carousel")) specs.push(await tryProduce("hook_carousel", produceCarousel));
  if (want("brand_ad")) specs.push(await tryProduce("brand_ad", () => produceBrand(shotPath)));

  const rendered = [];
  for (const spec of specs) rendered.push(await renderFamily(spec));

  // a family-filtered run merges its results into the existing manifest
  // instead of dropping the families it didn't touch.
  let families = rendered;
  const manifestPath = path.join(OUT, "manifest.json");
  if (ONLY.length > 0 && existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(readFileSync(manifestPath, "utf8"));
      const byFam = new Map((prev.families ?? []).map((f) => [f.family, f]));
      for (const f of rendered) byFam.set(f.family, f);
      families = [...byFam.values()];
    } catch {}
  }

  const manifestOut = {
    phase: "13E.4",
    generated_at: new Date().toISOString(),
    fps: 30,
    master: "1080x1920 / 9:16 / H.264 / yuv420p / no audio",
    platforms: PLATFORMS,
    published: false,
    families,
  };
  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifestOut, null, 2));
  const txt = families
    .map((fam) => {
      if (fam.skipped) return `${fam.family}: SKIPPED (${fam.skipped})`;
      return Object.entries(fam.platforms)
        .map(([p, r]) =>
          r.error
            ? `${fam.family} / ${p}\n  RENDER ERROR: ${r.error}`
            : `${fam.family} / ${p}\n  ${r.mp4}\n  id=${r.content_id} goal=${r.content_goal}\n  hook: ${r.hook}\n  cta: ${r.cta_label} -> ${r.cta_url}\n  ${r.duration_s}s ${r.frames}f  ${r.probe.width}x${r.probe.height} ${r.probe.codec}/${r.probe.pix_fmt} audio=${r.probe.has_audio}\n  QA: ${r.qa.ok ? "PASS" : "FAIL " + r.qa.failed.join("; ")}`,
        )
        .join("\n");
    })
    .join("\n\n");
  writeFileSync(path.join(OUT, "manifest.txt"), txt + "\n");

  const anyFail = families.some((f) => !f.skipped && Object.values(f.platforms).some((p) => p.error || !p.qa?.ok));
  console.log(`\n-> ${path.relative(ROOT, OUT)}/  (manifest.json, manifest.txt, ${families.filter((f) => !f.skipped).length * PLATFORMS.length} mp4)`);
  console.log(anyFail ? "QA: one or more clips FAILED - see manifest.txt" : "QA: all rendered clips PASSED");
  console.log("NOTE: nothing was published. This script never publishes or schedules.");
  if (anyFail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

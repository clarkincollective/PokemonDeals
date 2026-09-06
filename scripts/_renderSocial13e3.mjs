// Phase 13E.3 - render the four creative families with REAL fixtures for
// visual review + Impeccable critique. Local only, writes to
// .social-preview/13e3/. No publish, no OpenAI generation (it may read an
// already-approved background if one exists, else Mode B).
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { buildDealPayload, buildMoverPayload, buildSpotlightPayload } from "../lib/social/payload.mjs";
import { buildSlideContent, buildCoverSlideContent, buildCloseSlideContent, renderHtml, pathToFileUrl } from "../lib/social/templates.mjs";
import { createRenderer } from "../lib/social/render.mjs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { resolveCardArtwork, resolveMultiCardArtwork, CARD_ART_CACHE_DIR } from "../lib/social/cardArtwork.mjs";
import { fetchCatalogRows } from "../lib/social/db.mjs";
import { loadAssetManifest, resolveBackgroundForPost } from "../lib/social/assets.mjs";
import { buildCarouselSequence } from "../lib/social/creativeSpec.mjs";

const OUT = path.join(process.cwd(), ".social-preview", "13e3");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const fx = JSON.parse(readFileSync("tests/fixtures/social-deals.json", "utf8"));
const now = Date.now();
const rowOf = (label) => (fx.deals.find((d) => d.label === label) ?? fx.deals[0]).row;

// --- capture a REAL pokemondealfinder.com screenshot -------------------
async function captureSite(url, outPath, { w = 1000, h = 1100 } = {}) {
  const userDir = path.join(os.tmpdir(), "pdf-shot-" + Date.now());
  const chrome = spawn(
    process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--remote-debugging-port=0", "--user-data-dir=" + userDir, "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  let ws = null;
  chrome.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !ws) ws = m[0]; });
  for (let i = 0; i < 100 && !ws; i++) await sleep(100);
  if (!ws) { chrome.kill(); throw new Error("no CDP endpoint for screenshot"); }
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => { sock.addEventListener("open", res, { once: true }); sock.addEventListener("error", rej, { once: true }); });
  let id = 0;
  const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    const on = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.id === mid) { sock.removeEventListener("message", on); m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result); } };
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
  sock.close(); chrome.kill();
  return outPath;
}

const manifest = loadAssetManifest().manifest;
function bgFor(payload) {
  const bg = manifest ? resolveBackgroundForPost(payload, { manifest }) : null;
  return bg && existsSync(bg.absFile) ? bg : null;
}

async function main() {
  // real canonical card art for the fixtures we'll feature
  const ids = [...new Set(fx.deals.map((d) => d.row.card_tcgplayer_id).filter(Boolean).map(String))];
  const { byId } = await fetchCatalogRows(ids).catch(() => ({ byId: {} }));

  // brand-ad screenshot
  const shotDir = path.join(process.cwd(), ".social-preview", "brand-ad");
  mkdirSync(shotDir, { recursive: true });
  const shotPath = path.join(shotDir, "home.png");
  try { await captureSite("https://pokemondealfinder.com/", shotPath); console.log("captured real site screenshot ->", shotPath); }
  catch (e) { console.warn("screenshot capture failed:", e.message); }

  const renderer = await createRenderer();
  const jobs = [];
  const artFor = async (row) => {
    const r = await resolveCardArtwork(
      { card_tcgplayer_id: row.card_tcgplayer_id, card_name: row.card_name, card_set: row.card_set },
      { rightsState: RIGHTS_STATE, catalogRow: byId[String(row.card_tcgplayer_id)] ?? null, cacheDir: CARD_ART_CACHE_DIR }
    );
    return r.status === "ready" ? { presentation: "hero_left", card: { fileUrl: pathToFileUrl(r.localPath) } } : null;
  };
  const shot = async (name, html) => { const p = path.join(OUT, name); await renderer.renderToPng(html, p); jobs.push(name); };

  try {
    // 1. DEAL DROP - a few fixtures, A + B, with real card art
    for (const [label, tag] of [
      ["short-name raw, large saving", "raichu"],
      ["long-name raw, modest saving", "zekrom-long"],
      ["graded slab, high price", "lugia-psa9"],
      ["raw, high price", "blastoise"],
      ["non-US marketplace", "wigglytuff-gb"],
    ]) {
      const row = rowOf(label);
      const payload = buildDealPayload({ contentType: "deal_of_day", row, now, utmCampaign: "deal_of_day" });
      const slide = buildSlideContent(payload);
      const art = await artFor(row);
      const bg = bgFor(payload);
      await shot(`dealdrop_${tag}_A.png`, renderHtml(slide, { variant: "A", cardArtwork: art }));
      await shot(`dealdrop_${tag}_B.png`, renderHtml(slide, { variant: "B", cardArtwork: art }));
      if (bg) await shot(`dealdrop_${tag}_A_bg.png`, renderHtml(slide, { variant: "A", cardArtwork: art, background: bg }));
    }

    // 2. MARKET MOVER - real movement
    for (const m of fx.movers.slice(0, 3)) {
      const payload = buildMoverPayload({ row: m.row, movement: m.movement, now });
      const slide = buildSlideContent(payload);
      const art = await artFor(m.row);
      const bg = bgFor(payload);
      const tag = String(m.row.card_name).toLowerCase().replace(/\W+/g, "-").slice(0, 20);
      await shot(`mover_${tag}_A.png`, renderHtml(slide, { variant: "A", cardArtwork: art }));
      await shot(`mover_${tag}_B.png`, renderHtml(slide, { variant: "B", cardArtwork: art }));
      if (bg) await shot(`mover_${tag}_A_bg.png`, renderHtml(slide, { variant: "A", cardArtwork: art, background: bg }));
    }

    // 3. HOOK CAROUSEL - cover + card slides + close
    const cRows = fx.carousel.deals;
    const cPayload = buildSpotlightPayload({
      contentType: "pokemon_spotlight",
      displayName: "Charizard",
      dealCount: cRows.length,
      topDeals: cRows,
      destinationRoute: "/pokemon/charizard",
      now,
    });
    const seq = buildCarouselSequence(cRows);
    await shot(`carousel_1_cover.png`, renderHtml(buildCoverSlideContent(cPayload), { variant: "A" }));
    let i = 2;
    for (const s of seq.slides.filter((x) => x.kind === "card")) {
      const dp = buildDealPayload({ contentType: "deal_of_day", row: s.deal, now, utmCampaign: "best_deals_found_today" });
      const slide = buildSlideContent(dp);
      slide.carousel = { position: s.index + 1, total: seq.count };
      const art = await artFor(s.deal);
      await shot(`carousel_${i}_card.png`, renderHtml(slide, { variant: "A", cardArtwork: art }));
      i++;
    }
    await shot(`carousel_${i}_close.png`, renderHtml(buildCloseSlideContent(cPayload), { variant: "A" }));

    // 4. BRAND / CONVERSION AD - Version D, real screenshot
    if (existsSync(shotPath)) {
      const anyPayload = buildDealPayload({ contentType: "deal_of_day", row: rowOf("raw, high price"), now, utmCampaign: "deal_of_day" });
      const slide = buildSlideContent(anyPayload);
      await shot(`brandad_A.png`, renderHtml(slide, {
        variant: "A",
        brandAd: {
          screenshot: { fileUrl: pathToFileUrl(shotPath) },
          sub: "PokemonDealFinder scans live eBay listings and compares each one to a real market reference - so you see the ones priced below it.",
          urlLabel: "pokemondealfinder.com",
        },
      }));
    }
  } finally {
    await renderer.close();
  }
  console.log(`\nrendered ${jobs.length} creatives -> ${OUT}`);
  jobs.forEach((j) => console.log("  " + j));
}
main().catch((e) => { console.error(e); process.exit(1); });

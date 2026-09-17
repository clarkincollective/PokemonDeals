#!/usr/bin/env node
// SOCIAL-LIVE-3 - DAILY SOCIAL AUTOPILOT (Instagram, X, TikTok, YouTube Shorts).
//
//   node scripts/socialAutopilot.mjs [--dry] [--no-review] [--horizon-hours=48] [--json]
//
// Keeps the next 48 h of story slots filled: two distinct stories a day,
// each adapted to all four feeds (one 4:5 image for Instagram + X, one 9:16
// short for TikTok + YouTube). For every story slot with a free feed slot:
//   pick the next unused story (90-day cooldown per statistic) -> resolve
//   real facts + canonical card art -> check the linked page is live ->
//   render image + video scenes over an approved library background ->
//   deterministic checks -> Layer-5 visual review (PASS only) -> host
//   (content-addressed) -> persist story + AUTOPILOT_READY placements that
//   reserve their feed slots (planned_for).
// This is the RENDER worker (GitHub Actions: Chrome + ffmpeg + OpenAI key).
// Queueing to Buffer, the health check and owner alerts run on Vercel
// (/api/social-autopilot-queue, /api/social-health), where the Buffer token
// and the Resend key already live - no secret is copied into CI.
// Duplicate protection: a feed slot already holding or reserving a post is
// never re-booked; a group that is partly reserved reuses its own story.
// Emergency pause: the durable backlog circuit (socialBacklogCircuit.mjs
// suspend) stops every run before any provider call.
// Cost: no image generation (library backgrounds); at most MAX_REVIEWS
// vision reviews per run (~$0.01 each). Video: local ffmpeg, $0.

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const a = args.find((x) => x.startsWith(`${f}=`)); return a ? a.split("=")[1] : d; };
const DRY = has("--dry");
const NO_REVIEW = has("--no-review");
const HORIZON_H = Number(val("--horizon-hours", 48));
const MAX_REVIEWS = Number(val("--max-reviews", 6));
const NOW = Date.now();

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { loadPlacements, loadStories, upsertStory, upsertPlacements, recordQaRun } = await import("../lib/social/newsroom/db.mjs");
const { storyRow, placementRows, qaRunRow } = await import("../lib/social/newsroom/persist.mjs");
const { loadBacklogCircuit } = await import("../lib/social/newsroom/backlogCircuit.mjs");
const { slotsBooked } = await import("../lib/newsroom/backlogRefill.mjs");
const { getStorageProvider } = await import("../lib/social/storage/index.mjs");
const { createRenderer } = await import("../lib/social/render.mjs");
const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");
const { reviewRenderedCreative } = await import("../lib/newsroom/visualReview.mjs");
const ST = await import("../lib/social/autopilot/stories.mjs");
const CR = await import("../lib/social/autopilot/creative.mjs");
const { assembleShort } = await import("../lib/social/autopilot/video.mjs");
const { planSlotGroups, brisbaneLabel } = await import("../lib/social/autopilot/slots.mjs");

const BG_LIB = JSON.parse(readFileSync("lib/social/autopilot/backgrounds.json", "utf8")).backgrounds;
const WORK = path.join(os.tmpdir(), `social-autopilot-${NOW}`);
mkdirSync(WORK, { recursive: true });

const report = { generated_at: new Date(NOW).toISOString(), version: ST.AUTOPILOT_VERSION, dry: DRY, horizon_hours: HORIZON_H, circuit: null, groups: [], scheduled: [], skipped: [], alerts: [], reviews_used: 0 };
const alert = (msg) => { report.alerts.push(msg); };
const log = (...a) => { if (!has("--json")) console.log(...a); };
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const recentCards = new Set();

async function main() {
  // ---- 0. emergency pause + credentials -------------------------------
  const circuit = await loadBacklogCircuit({ now: NOW });
  report.circuit = circuit.state;
  if (circuit.state !== "CLOSED") { alert(`backlog circuit ${circuit.state} - autopilot paused, nothing scheduled`); return; }

  // ---- 1. slot plan ------------------------------------------------------
  const { rows: placements } = await loadPlacements({});
  const { rows: stories } = await loadStories({});
  const booked = slotsBooked(placements);
  const cooldownFrom = NOW - ST.STORY_COOLDOWN_DAYS * 86_400_000;
  const used = new Set(stories.filter((s) => String(s.series).startsWith("AUTOPILOT_") && Date.parse(s.captured_at ?? s.updated_at ?? 0) >= cooldownFrom).map((s) => s.subject_id));
  const groups = planSlotGroups({ now: NOW, horizonHours: HORIZON_H });
  const dayIndex = Math.floor((NOW + 10 * 3_600_000) / 86_400_000);
  const queue = ST.candidateQueue({ used, dayIndex });
  // a card featured in the last 21 days (or earlier this run) is not featured again
  for (const s of stories) if (String(s.series).startsWith("AUTOPILOT_") && Date.parse(s.captured_at ?? 0) >= NOW - 21 * 86_400_000) for (const id of s.card_ids ?? []) recentCards.add(String(id));

  const renderer = await createRenderer();
  const sceneRenderer = await createRenderer({ width: 1080, height: 1920 });
  try {
    for (const grp of groups) {
      const storyId = `autopilot-${grp.date}-${grp.slot}`;
      const free = Object.entries(grp.times).filter(([p, t]) => !booked.has(`${p}|${Date.parse(t)}`));
      const g = { key: grp.key, story_id: storyId, times: Object.fromEntries(Object.entries(grp.times).map(([p, t]) => [p, brisbaneLabel(t)])), free: free.map(([p]) => p) };
      report.groups.push(g);
      if (!free.length) { g.outcome = "all feed slots already booked"; continue; }

      // a partially scheduled group reuses ITS story + hosted assets
      const existing = placements.filter((p) => p.story_id === storyId && p.caption_style?.autopilot && ["AUTOPILOT_READY", "BUFFER_SUBMITTING", "BUFFER_QUEUED", "PUBLISHED"].includes(p.status));
      let pkg = existing.length ? existing[0].caption_style.autopilot : null;
      if (pkg) g.reused_story = pkg.key;
      while (!pkg) {
        const cand = queue.shift();
        if (!cand) { alert(`story supply exhausted for ${grp.key} - no unused story inside the ${ST.STORY_COOLDOWN_DAYS}-day cooldown`); break; }
        // eslint-disable-next-line no-await-in-loop
        const built = await buildPackage(cand, { storyId, renderer, sceneRenderer, bgIndex: groups.indexOf(grp) });
        if (built.ok) { pkg = built.pkg; used.add(cand.key); for (const c of pkg.story.cards) recentCards.add(String(c.id)); } else report.skipped.push({ group: grp.key, story: cand.key, reason: built.reason });
        if (!built.ok && /review budget/.test(built.reason)) break;
      }
      if (!pkg) { g.outcome = "no eligible story"; continue; }
      g.story = pkg.key;

      if (DRY) { g.outcome = `DRY - would reserve ${free.map(([p, t]) => `${p}@${brisbaneLabel(t)}`).join(", ")}`; continue; }
      if (!existing.length) {
        const w = await upsertStory(storyRow({
          story_id: storyId, series: ST.AUTOPILOT_SERIES[pkg.kind], pillar: pkg.kind === "guide" ? "EDUCATION" : "MARKET", lane: "PLANNED",
          subject_type: pkg.kind, subject_id: pkg.key, card_ids: pkg.story.cards.map((c) => c.id), captured_at: pkg.story.as_of ?? new Date(NOW).toISOString(),
          status: "QUEUED", content_goal: "TRUST", cta_intensity: "SOFT",
          facts_json: { headline_fact: pkg.story.headline, layout_family: `autopilot_${pkg.story.layout}`, card_set: pkg.story.cards[0]?.set ?? null },
        }, { now: NOW, sourceCommit: process.env.GITHUB_SHA ?? null }));
        if (w.error) { alert(`story upsert failed for ${storyId}: ${w.error}`); continue; }
      }
      for (const [platform, dueAt] of free) {
        // eslint-disable-next-line no-await-in-loop
        const r = await reserve({ platform, dueAt, storyId, pkg });
        if (r.ok) { booked.add(`${platform}|${Date.parse(dueAt)}`); report.scheduled.push({ story: pkg.key, platform, at: brisbaneLabel(dueAt), placement_id: r.placement_id, status: "AUTOPILOT_READY" }); }
      }
      g.outcome = "reserved";
    }
  } finally {
    await renderer.close?.();
    await sceneRenderer.close?.();
  }
}

async function buildPackage(cand, { storyId, renderer, sceneRenderer, bgIndex }) {
  const db = supabaseAdmin();
  let story;
  if (cand.kind === "guide") {
    story = { ...ST.GUIDE_STORIES.find((s) => s.key === cand.key), kind: "guide", as_of: new Date(NOW).toISOString() };
  } else {
    const cols = "tcgplayer_id,name,set,card_number,language,image_url,market_price,market_condition,market_printing";
    let q = db.from("card_catalog").select(cols).gte("market_price", 1);
    q = cand.kind === "species" ? q.ilike("name", `${cand.subject}%`).order("market_price", { ascending: false }).limit(400) : q.eq("set", cand.subject).limit(1500);
    const { data, error } = await q;
    if (error) return { ok: false, reason: `catalogue query: ${error.message}` };
    const rows = cand.kind === "species" ? (data ?? []).filter((r) => new RegExp(`^${cand.subject}\\b`, "i").test(r.name)) /* \b keeps "Mew" from matching "Mewtwo" */ : data ?? [];
    const b = ST.buildCatalogueStory(cand.kind, cand.subject, rows, { asOf: NOW, excludeIds: recentCards });
    if (!b.ok) return { ok: false, reason: b.reason };
    story = b.story;
  }

  // the page the post sends people to must be live
  const page = await fetch(`https://pokemondealfinder.com${story.href}`, { redirect: "manual", signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!page || page.status !== 200) return { ok: false, reason: `linked page ${story.href} returned ${page?.status ?? "no response"}` };

  // canonical card art (rights-gated resolver)
  const ids = story.cards.map((c) => c.id);
  const { data: catRows } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,image_url").in("tcgplayer_id", ids);
  const art = {};
  for (const c of story.cards) {
    const row = (catRows ?? []).find((r) => String(r.tcgplayer_id).trim() === c.id);
    if (!row) return { ok: false, reason: `card ${c.id} not in catalogue` };
    // eslint-disable-next-line no-await-in-loop
    const r = await resolveCardArtwork({ card_tcgplayer_id: c.id, card_name: row.name, card_set: row.set, card_number: row.card_number }, { rightsState: RIGHTS_STATE, catalogRow: row });
    if (r.status !== "ready") return { ok: false, reason: `canonical art unavailable for ${c.id} (${r.status})` };
    art[c.id] = pathToFileURL(path.resolve(r.localPath)).href;
  }

  // library background (downloaded once per run)
  const bgEntry = BG_LIB[bgIndex % BG_LIB.length];
  const bgPath = path.join(WORK, `bg_${bgEntry.sha256.slice(0, 12)}.png`);
  if (!existsSync(bgPath)) {
    const r = await fetch(bgEntry.url, { signal: AbortSignal.timeout(60000) });
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!r.ok || sha256(bytes) !== bgEntry.sha256) return { ok: false, reason: `library background ${bgEntry.sha256.slice(0, 12)} failed integrity check` };
    writeFileSync(bgPath, bytes);
  }
  const bg = pathToFileURL(bgPath).href;

  // deterministic content checks
  const text = JSON.stringify(story);
  if (/\bsells?\b|\bsold for\b/i.test(`${story.headline} ${story.sub} ${story.note}`)) return { ok: false, reason: "copy calls a market reference a sale" };
  if (/Pokémon/.test(text)) return { ok: false, reason: "accented Pokemon spelling" };

  const dir = path.join(WORK, cand.key.replace(/[^a-z0-9]+/gi, "_"));
  mkdirSync(dir, { recursive: true });
  const imgPath = path.join(dir, "image.png");
  await renderer.renderToPng(CR.renderStoryImageHtml(story, { art, bg }), imgPath);

  // Layer-5 visual review of the exact image (PASS only; never re-rolled)
  let review = { verdict: "SKIPPED" };
  if (!NO_REVIEW) {
    if (report.reviews_used >= MAX_REVIEWS) return { ok: false, reason: "review budget for this run used - remaining slots wait for the next run" };
    report.reviews_used += 1;
    review = await reviewRenderedCreative(imgPath, { platform: "instagram", family: `autopilot_${story.layout}`, series: ST.AUTOPILOT_SERIES[cand.kind], cardForward: true, editorial: true }, { noCache: true });
    if (review.verdict !== "PASS") {
      // fail() returns blockers: [] and puts the cause in notes, so `??` (which
      // only falls through on null/undefined) reported every non-PASS as an
      // empty string - the reason a whole run of skips said nothing at all.
      const why = (review.blockers?.length ? review.blockers : review.notes ?? []).slice(0, 2).join(" | ");
      // A reviewer that could not run is NOT a quality verdict. available:false
      // (no key, HTTP error, unparseable) silently skipped every slot and still
      // exited 0, so the workflow stayed green while output went to zero.
      // Raise it as an alert: the run then fails visibly and the owner alert path
      // sees it, instead of the queue draining unnoticed.
      if (review.available === false) alert(`visual review unavailable (${review.verdict}): ${why || "no detail"} - not a quality verdict`);
      return { ok: false, reason: `visual review ${review.verdict}: ${why || "(no detail returned)"}` };
    }
  }

  const scenes = CR.renderStoryScenesHtml(story, { art, bg });
  const pngs = [];
  for (const s of scenes) {
    const p = path.join(dir, `scene_${s.id}.png`);
    // eslint-disable-next-line no-await-in-loop
    await sceneRenderer.renderToPng(s.html, p);
    pngs.push({ png: p, secs: s.secs });
  }
  const mp4 = path.join(dir, "short.mp4");
  const v = await assembleShort(pngs, mp4, { workDir: dir });
  if (!v.ok) return { ok: false, reason: v.reason };

  const pkg = { key: cand.key, kind: cand.kind, story, review: { verdict: review.verdict, ai_spam: review.scores?.AI_SPAM_RISK ?? null }, background: bgEntry.sha256, captions: CR.storyCaptions(story, { storyId }), video_probe: { duration_s: v.probe.duration_s, w: v.probe.width, h: v.probe.height, audio: v.probe.has_audio } };
  if (DRY) { pkg.local = { image: imgPath, video: mp4 }; return { ok: true, pkg }; }

  const storage = getStorageProvider();
  for (const [kind, file, type] of [["image", imgPath, "image/png"], ["video", mp4, "video/mp4"]]) {
    const bytes = readFileSync(file);
    const h = sha256(bytes);
    // eslint-disable-next-line no-await-in-loop
    const up = await storage.upload({ storageKey: `by-hash/${h}${kind === "image" ? ".png" : ".mp4"}`, bytes, contentType: type });
    if (!up.ok) return { ok: false, reason: `host ${kind}: ${up.reason}` };
    // eslint-disable-next-line no-await-in-loop
    const hd = await storage.head(up.publicUrl);
    if (hd.status !== 200) return { ok: false, reason: `host ${kind} head ${hd.status}` };
    pkg[`${kind}_url`] = up.publicUrl;
    pkg[`${kind}_sha256`] = h;
  }
  return { ok: true, pkg };
}

async function reserve({ platform, dueAt, storyId, pkg }) {
  const placement_id = `plc_${createHash("sha256").update(`${storyId}::${platform}`).digest("hex").slice(0, 12)}`;
  const isVideo = platform === "tiktok" || platform === "youtube";
  const cap = pkg.captions[platform];
  const row = placementRows({ story_id: storyId }, [{
    placement_id, platform, placement_type: isVideo ? "video" : "post", content_id: storyId, status: "AUTOPILOT_READY", planned_for: dueAt,
    artifact_hash: isVideo ? pkg.video_sha256 : pkg.image_sha256, hosted_url: isVideo ? pkg.video_url : pkg.image_url,
    caption_style: {
      platform, layout_family: `autopilot_${pkg.story.layout}`, text: cap.text, hook: pkg.story.headline, link: `pokemondealfinder.com${pkg.story.href}`,
      site_link: cap.siteLink ?? null, tiktok_title: cap.tiktokTitle ?? null, youtube_title: cap.youtubeTitle ?? null, autopilot: pkg,
    },
  }], { now: NOW })[0];
  const w = await upsertPlacements([row]);
  if (w.error) { alert(`${platform} placement upsert failed: ${w.error}`); return { ok: false }; }
  await recordQaRun(qaRunRow({ storyId, placementId: placement_id, qaType: "VISUAL_REVIEW", result: pkg.review.verdict === "PASS" ? "PASS" : "WATCH", detail: { autopilot: true, artifact_sha256: row.artifact_hash, image_sha256: pkg.image_sha256, verdict: pkg.review.verdict, video_probe: pkg.video_probe } }));
  return { ok: true, placement_id };
}

let crashed = null;
try { await main(); } catch (e) { crashed = e; alert(`autopilot crashed: ${String(e?.stack ?? e).slice(0, 400)}`); }
if (!DRY) rmSync(WORK, { recursive: true, force: true });
// owner email for render problems comes from the Vercel health check (empty
// slots in the next 24 h), which holds the Resend key; this job fails visibly.
console.log(has("--json") ? JSON.stringify(report, (k, v) => (k === "autopilot" ? undefined : v), 2) : JSON.stringify({ ...report, groups: report.groups }, null, 2));
if (crashed || (report.alerts.length && !DRY)) process.exit(1);

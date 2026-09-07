#!/usr/bin/env node
// Phase SOCIAL-NEWSROOM-2C - `npm run social:backlog-render`
//
//   node scripts/socialBacklogRender.mjs [--proof-seed] [--render] [--json]
//
//   --proof-seed   persist a fixed, small, distinct-layout proof story set
//                  (idempotent via stableStoryId). No render.
//   --render       (default) for every persisted PLANNED placement whose
//                  series is renderable: build editorial HTML -> real PNG
//                  via lib/social/render -> host via lib/social/storage ->
//                  deterministic QA -> OpenAI Layer-5 review -> on full
//                  PASS: patch the placement to BUFFER_READY.
//   --render --queue-after   also runs the feed review over the final set.
//
// Reuses the EXISTING renderer, storage provider and hosted-assets
// registry. No new rendering/hosting system. NOTHING is published or
// scheduled here. No eBay call.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { createRenderer } from "../lib/social/render.mjs";
import { getStorageProvider } from "../lib/social/storage/index.mjs";
import { sha256, storageKeyFor, loadHostedAssets, saveHostedAssets, findByHash, buildHostedRecord, canHost } from "../lib/social/storage/hostedAssets.mjs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { execSync } from "node:child_process";

import {
  loadStories, loadPlacements, tablesReady, upsertStory, upsertPlacements, patchPlacement, recordQaRun,
} from "../lib/social/newsroom/db.mjs";
import {
  makeStory, storyRow, placementRows, qaRunRow, quantizedCapturedAtIso, stableStoryId,
  placementsForStory, organicScore, runQaStack, feedReview, logEvent,
} from "../lib/social/newsroom/index.mjs";
import { SERIES_RENDER, seriesRenderable, layoutFamilyFor, renderablePlatformsFor, buildEditorialAsset, newsroomRights } from "../lib/social/newsroom/renderRegistry.mjs";
import { EDITORIAL_TARGETS } from "../lib/social/newsroom/editorialTemplates.mjs";
import { platformCaptions } from "../lib/social/newsroom/captions.mjs";
import { reviewRenderedCreative, reviewAvailable } from "../lib/newsroom/visualReview.mjs";
import { resolveBacklogPosture, normaliseSchedule, brisbaneWallToUtc, feedReview as feedReviewFn, MAX_QUEUE_PER_PLATFORM_PER_RUN } from "../lib/social/newsroom/index.mjs";
import { scheduleOne, reconcileOne, queuedContentStale, resolveProviderMode } from "../lib/newsroom/bufferBacklog.mjs";
import { getSocialProvider } from "../lib/social/providers/index.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const JSON_OUT = has("--json");
const DO_SEED = has("--proof-seed");
const DO_QUEUE = has("--queue-proof");
const DO_RENDER = has("--render") || (!DO_SEED && !DO_QUEUE);
const NOW = Date.now();
const ROOT = process.cwd();
const RENDER_DIR = path.join(ROOT, ".social-preview", "editorial-newsroom", "renders");
const OUT = path.join(ROOT, ".social-preview", "editorial-newsroom");
const log = (...a) => { if (!JSON_OUT) console.log(...a); };
const gitHead = () => { try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { return null; } };

// The fixed proof set: 5 series, 5 distinct layout families, mixed CTA.
const PROOF_SERIES = ["PRICE_STORY", "BIGGEST_MOVERS", "MARKET_SNAPSHOT", "HOW_WE_FIND_DEALS", "METHODOLOGY"];

async function seedProof() {
  const sourceCommit = gitHead();
  let stories = 0, placements = 0;
  for (const series of PROOF_SERIES) {
    const subjectId = `${series.toLowerCase()}-proof`;
    const capturedAt = quantizedCapturedAtIso(series, { now: NOW });
    const facts = proofFacts(series);
    const story = makeStory({ series, subjectType: SERIES_RENDER[series] ? "editorial" : "concept", subjectId, capturedAt, facts, sourceCommit, now: NOW });
    story.story_id = stableStoryId({ series, subjectType: "editorial", subjectId, now: NOW });
    story.organic_score = organicScore(story);
    story.status = "PLANNED";
    const sr = await upsertStory(storyRow(story, { now: NOW, sourceCommit }));
    if (sr.error) throw new Error(`seed story ${series}: ${sr.error}`);
    stories += sr.wrote;
    // only renderable platforms
    const wanted = renderablePlatformsFor(series);
    const pls = placementsForStory(story).filter((p) => wanted.includes(p.platform)).map((p) => ({ ...p, content_id: story.story_id }));
    const pr = await upsertPlacements(placementRows(story, pls, { now: NOW }));
    if (pr.error) throw new Error(`seed placements ${series}: ${pr.error}`);
    placements += pr.wrote;
    logEvent("STORY_CREATED", { story_id: story.story_id, series, lane: story.lane, proof: true });
  }
  return { stories, placements };
}

// Deterministic proof facts. Aggregate/editorial only - no card artwork,
// no live deal claim. The MARKET_SNAPSHOT / BIGGEST_MOVERS numbers come
// from the data brief already recorded in memory (seo-gsc-authority) +
// the current catalogue; they are illustrative-but-real editorial
// context, clearly framed as observations.
function proofFacts(series) {
  switch (series) {
    case "PRICE_STORY":
      return {
        headline_fact: "The listing 38% under the highest ask still lost to a plainer one.",
        reveal: "Different set number, +$9 shipping, GBP not USD. Landed, the 'cheaper' card was $12 more.",
        layout_family: "story_reveal", numeric_structure: "compare",
      };
    case "BIGGEST_MOVERS":
      return {
        headline_fact: "Biggest 7-day market-reference moves",
        rows: [
          { name: "Umbreon VMAX (Evolving Skies)", deltaPct: 6.8 },
          { name: "Charizard ex (Obsidian Flames)", deltaPct: 4.1 },
          { name: "Mewtwo (Base Set, PSA 7)", deltaPct: -2.3 },
          { name: "Sylveon ex (Surging Sparks)", deltaPct: -3.9 },
          { name: "Lugia V Alt Art (Silver Tempest)", deltaPct: 5.2 },
        ],
        observation_note: "Move vs the prior 7-day median reference. Observations, not advice.",
        layout_family: "data_ranking", numeric_structure: "ranking",
      };
    case "MARKET_SNAPSHOT":
      return {
        headline_fact: "The Pokemon single-card market, in four numbers",
        stats: [
          { label: "Priced cards tracked", value: "21,775" },
          { label: "Median card value", value: "$1.61" },
          { label: "Under $25", value: "84.4%" },
          { label: "$100 or more", value: "5.2%" },
        ],
        source: "PokemonDealFinder catalogue snapshot; references via PokemonPriceTracker.",
        layout_family: "editorial_dashboard", numeric_structure: "distribution",
      };
    case "HOW_WE_FIND_DEALS":
      return { headline_fact: "How a listing actually becomes a deal", layout_family: "process_explainer" };
    case "METHODOLOGY":
      return { headline_fact: "What counts as a deal here", layout_family: "trust_editorial" };
    default:
      return { layout_family: layoutFamilyFor(series) };
  }
}

// map (layout, story) -> the EDITORIAL creative-QA meta (SS8). Reflects
// the real composition so the density/hierarchy checks are meaningful.
function editorialMetaFor(layout, target, hookText, story, ctaIntensity, bodyText) {
  const t = EDITORIAL_TARGETS[target] ?? EDITORIAL_TARGETS.ig_45;
  const f = story.facts_json ?? {};
  let statCallouts = [];
  if (layout === "editorial_dashboard") statCallouts = (f.stats ?? []).map((s) => s.value);
  else if (layout === "data_ranking") statCallouts = (f.rows ?? []).map((r) => `${Number(r.deltaPct) >= 0 ? "+" : ""}${Number(r.deltaPct).toFixed(1)}%`);
  const cta = ctaIntensity === "NONE" ? 0 : 1;
  return {
    editorial: true,
    layout_family: layout,
    target,
    safe: { top: t.safe.t, right: t.safe.r, bottom: t.safe.b, left: t.safe.l },
    hookText,
    hookPx: target === "short_916" ? 82 : 62,
    ctaCount: cta,
    wordmarkCount: 1,
    minInlineFontPx: 22,
    statCallouts,
    bodyChars: String(bodyText ?? "").length,
  };
}

async function renderPass() {
  if (!(await tablesReady())) return { error: "MIGRATION_REQUIRED" };
  if (!existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe") && !process.env.CHROME_BIN) {
    // still attempt; render.mjs may resolve Chrome differently
  }
  mkdirSync(RENDER_DIR, { recursive: true });

  const { rows: placementRowsAll } = await loadPlacements({});
  const { rows: storyRowsAll } = await loadStories({});
  const storyById = Object.fromEntries(storyRowsAll.map((s) => [s.story_id, s]));

  // Scope to the PROOF set only (subject_id ends in "-proof") so earlier
  // calendar-built stories of the same series don't collide. Dedup by
  // (story_id, platform).
  const seen = new Set();
  const targets = placementRowsAll.filter((p) => {
    const st = storyById[p.story_id];
    if (!st || !seriesRenderable(st.series)) return false;
    if (!String(st.subject_id ?? "").endsWith("-proof")) return false;
    if (!["PLANNED", "RENDERED", "QA_WATCH", "BUFFER_READY"].includes(p.status)) return false;
    const k = `${p.story_id}|${p.platform}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const storage = getStorageProvider();
  const hosted = loadHostedAssets();
  const renderer = await createRenderer();
  const results = [];
  const readySet = [];

  try {
    for (const p of targets) {
      const story = storyById[p.story_id];
      if (!story) continue;
      const asset = buildEditorialAsset(story, p.platform);
      if (!asset) { results.push({ placement_id: p.placement_id, platform: p.platform, skipped: "series not renderable for this platform" }); continue; }
      const caps = platformCaptions(story, { cta: asset.cta_intensity });
      const cap = caps[p.platform] ?? caps.x;

      // 1. render
      const localPath = path.join(RENDER_DIR, `${story.series.toLowerCase()}_${p.platform}_${p.placement_id.slice(-8)}.png`);
      await renderer.renderToPng(asset.html, localPath);
      let bytes = readFileSync(localPath);
      let sha = sha256(bytes);

      // 2. deterministic QA
      let qa = runQaStack(
        { ...story, facts_json: story.facts_json ?? {}, deal_ids: story.deal_ids ?? [] },
        {
          creativeMeta: editorialMetaFor(asset.layout_family, asset.target, cap.hook, story, asset.cta_intensity, cap.text),
          rights: { rightsCleared: true, artifactIsOwnRender: true },
          requireVisualReview: false,
          originalityContext: [],
          sequenceOk: true,
        }
      );

      // 3. OpenAI Layer-5 on the REAL png. Editorial context so the
      // card-centric rubric doesn't penalise a deliberately card-free
      // editorial/data composition (SS9/SS10).
      const reviewCtx = {
        platform: p.platform, family: asset.layout_family, series: story.series,
        hookText: cap.hook, editorial: true, ctaIntensity: asset.cta_intensity,
      };
      let review = await reviewRenderedCreative(localPath, reviewCtx, {});
      let reRendered = false;

      // 4. host (only if QA + review both PASS - fail-closed, SS8/SS20)
      const qaOk = qa.professional_result === "PASS";
      const reviewOk = review.verdict === "PASS";
      let hostedUrl = null, hostErr = null;
      if (qaOk && reviewOk) {
        const existing = findByHash(hosted, sha);
        if (existing?.public_url) {
          hostedUrl = existing.public_url;
        } else {
          const gate = canHost({
            localPath, bytes, mime: "image/png",
            qa: { ok: true, passed: qa.layers.length, total: qa.layers.length, failed: [] },
            rights: newsroomRights(), currentRights: RIGHTS_STATE,
          });
          if (!gate.ok) { hostErr = `canHost: ${gate.reason}`; }
          else {
            const key = storageKeyFor(sha, ".png");
            const up = await storage.upload({ storageKey: key, bytes, contentType: "image/png" });
            if (!up.ok) hostErr = `upload: ${up.reason} ${up.detail ?? ""}`.trim();
            else {
              hostedUrl = up.publicUrl;
              const rec = buildHostedRecord({
                content_id: story.story_id, creative_family: asset.layout_family,
                artifact_type: asset.target === "short_916" ? "image_916" : "image_45",
                platform_eligibility: [p.platform], localPath, bytes, mime: "image/png",
                width: EDITORIAL_TARGETS[asset.target].w, height: EDITORIAL_TARGETS[asset.target].h,
                qa: { ok: true, passed: qa.layers.length, total: qa.layers.length, failed: [] },
                rights: newsroomRights(), sourceCommit: gitHead(),
              });
              rec.storage_provider = "supabase";
              rec.public_url = up.publicUrl;
              rec.uploaded_at = new Date().toISOString();
              // verify public accessibility
              const hd = await storage.head(up.publicUrl);
              rec.verified = { at: new Date().toISOString(), status: hd.status, contentType: hd.contentType, contentLength: hd.contentLength, rangeOk: null };
              hosted.push(rec);
              saveHostedAssets(hosted);
              logEvent("ASSET_HOSTED", { story_id: story.story_id, platform: p.platform, sha: sha.slice(0, 12), status: hd.status });
            }
          }
        }
      }

      // 5. persist QA runs + patch placement
      await recordQaRun(qaRunRow({ storyId: story.story_id, placementId: p.placement_id, qaType: "STACK", result: qa.professional_result, score: organicScore(story), blockers: qa.blockers, detail: { layout: asset.layout_family } }));
      await recordQaRun(qaRunRow({ storyId: story.story_id, placementId: p.placement_id, qaType: "VISUAL_REVIEW", result: review.verdict, score: review.scores?.AI_SPAM_RISK ?? null, blockers: review.blockers ?? [], detail: { model: review.model ?? null, notes: (review.notes ?? []).slice(0, 3), cached: review.cached ?? false } }));
      logEvent(qa.professional_result === "PASS" ? "QA_PASS" : qa.professional_result === "WATCH" ? "QA_WATCH" : "QA_FAIL", { story_id: story.story_id, platform: p.platform });

      const ready = qaOk && reviewOk && Boolean(hostedUrl) && !hostErr;
      if (ready) {
        await patchPlacement(p.placement_id, {
          status: "BUFFER_READY",
          artifact_hash: sha,
          hosted_url: hostedUrl,
          caption_style: { platform: p.platform, cta_intensity: asset.cta_intensity, cta_zone: asset.cta_zone, hook: cap.hook, text: cap.text, hashtags: cap.hashtags, link: cap.link, layout_family: asset.layout_family },
        });
        readySet.push({ story, placement: p, layout: asset.layout_family, cta_zone: asset.cta_zone, platform: p.platform });
      }

      results.push({
        placement_id: p.placement_id, story_id: story.story_id, series: story.series, platform: p.platform,
        layout_family: asset.layout_family, target: asset.target,
        dimensions: `${EDITORIAL_TARGETS[asset.target].w}x${EDITORIAL_TARGETS[asset.target].h}`,
        local_path: path.relative(ROOT, localPath), artifact_sha256: sha, bytes: bytes.length,
        deterministic_qa: qa.professional_result, qa_blockers: qa.blockers,
        visual_review: { verdict: review.verdict, available: review.available, ai_spam_risk: review.scores?.AI_SPAM_RISK ?? null, blockers: review.blockers ?? [], notes: (review.notes ?? []).slice(0, 3), re_rendered: reRendered, cached: review.cached ?? false },
        hosted_url: hostedUrl, host_error: hostErr,
        caption_hook: cap.hook, cta_intensity: asset.cta_intensity,
        status: ready ? "BUFFER_READY" : "HELD",
      });
    }
  } finally {
    await renderer.close();
  }

  // feed review over the BUFFER_READY set - uses each layout's REAL
  // wordmark/CTA zone so "identical CTA placement" reflects the design.
  const feed = feedReview(readySet.map((r) => ({
    story: { ...r.story, facts_json: { ...(r.story.facts_json ?? {}), layout_family: r.layout, cta_zone: r.cta_zone, loud_brand: false } },
  })));
  logEvent("FEED_REVIEW", { verdict: feed.verdict, sample: feed.sample });

  return { results, feed, buffer_ready: readySet.length };
}

// ---- SS16-SS22: SMALL FUTURE BUFFER PROOF QUEUE (draft mode) --------
// Requires SOCIAL_BUFFER_BACKLOG_ENABLED=true in the env. Uses the
// EXISTING adapter via scheduleOne(). DRAFT mode: a Buffer draft with a
// future dueAt - a real provider write that NEVER auto-publishes (SS20/
// SS24). To make one a genuine auto-publishing scheduled post, re-run
// with SOCIAL_BUFFER_BACKLOG_MODE=scheduled.
async function queueProof() {
  if (!(await tablesReady())) return { error: "MIGRATION_REQUIRED" };
  const posture = resolveBacklogPosture(process.env, { requestQueue: true });
  const mode = resolveProviderMode(process.env); // "draft" (default) | "scheduled"
  if (!posture.canQueueProvider) return { blocked: posture.reason, posture, mode };

  const prov = getSocialProvider();
  const ch = await prov.listChannels();
  if (!ch.ok) return { blocked: `listChannels: ${ch.reason}`, posture, mode };
  const channelByService = {};
  for (const c of ch.channels ?? []) {
    const svc = c.service === "twitter" ? "x" : c.service;
    if (["instagram", "x", "tiktok", "youtube"].includes(svc) && !c.disconnected && !c.locked) channelByService[svc] = c.id;
  }

  const { rows: placements } = await loadPlacements({ statuses: ["BUFFER_READY"] });
  const { rows: stories } = await loadStories({});
  const byId = Object.fromEntries(stories.map((s) => [s.story_id, s]));
  // idempotent: never re-queue a placement that already has a provider ref
  const alreadyQueued = new Set(placements.filter((p) => p.buffer_provider_ref).map((p) => p.placement_id));

  // curate: strongest + most diverse, <= MAX per platform, prefer distinct
  // series + distinct layout families. IG + X only for the proof.
  // X is the proof surface: it accepts a text+image post via the Buffer
  // API cleanly. Instagram via Buffer returns InvalidInputError for our
  // editorial image posts (a known Buffer-IG integration constraint -
  // documented, not chased). SS18 explicitly allows not forcing every
  // platform. Set SOCIAL_BUFFER_PROOF_PLATFORMS to override.
  const proofPlatforms = String(process.env.SOCIAL_BUFFER_PROOF_PLATFORMS ?? "x").split(",").map((s) => s.trim()).filter(Boolean);
  const proof = placements
    .filter((p) => String(byId[p.story_id]?.subject_id ?? "").endsWith("-proof"))
    .filter((p) => !alreadyQueued.has(p.placement_id))
    .filter((p) => p.artifact_hash && p.hosted_url)
    .filter((p) => proofPlatforms.includes(p.platform) && channelByService[p.platform]);
  // strictly distinct series AND distinct layout family; <= 2 per
  // platform; cap 3 (SS18). Distinctness is what makes FEED_PASS reachable.
  const pickedSeries = new Set();
  const pickedLayout = new Set();
  const perPlatform = {};
  const chosen = [];
  for (const p of proof) {
    const st = byId[p.story_id];
    const lf = p.caption_style?.layout_family;
    if ((perPlatform[p.platform] ?? 0) >= MAX_QUEUE_PER_PLATFORM_PER_RUN) continue;
    if (pickedSeries.has(st.series) || pickedLayout.has(lf)) continue;
    chosen.push({ p, st, lf });
    pickedSeries.add(st.series);
    pickedLayout.add(lf);
    perPlatform[p.platform] = (perPlatform[p.platform] ?? 0) + 1;
    if (chosen.length >= 3) break;
  }

  // SS13 - feed gate over the curated proof subset. Never queue on
  // FEED_WATCH / FEED_FAIL.
  const feed = feedReviewFn(chosen.map((c) => ({
    story: { ...c.st, facts_json: { ...(c.st.facts_json ?? {}), layout_family: c.p.caption_style?.layout_family, cta_zone: c.p.caption_style?.cta_zone, loud_brand: false } },
  })));
  if (feed.verdict !== "FEED_PASS") {
    return { posture, mode, feed, blocked: `feed review ${feed.verdict}: ${(feed.warnings ?? []).join("; ")}`, chosen: chosen.length, queued: 0, results: [] };
  }

  // Brisbane future times: tomorrow + day after, 10:00 / 16:00 Brisbane.
  const bris = new Date(NOW + 10 * 3_600_000); // now in Brisbane wall time
  const slots = [
    brisbaneWallToUtc({ y: bris.getUTCFullYear(), m: bris.getUTCMonth() + 1, d: bris.getUTCDate() + 1, hh: 10 }),
    brisbaneWallToUtc({ y: bris.getUTCFullYear(), m: bris.getUTCMonth() + 1, d: bris.getUTCDate() + 1, hh: 16 }),
    brisbaneWallToUtc({ y: bris.getUTCFullYear(), m: bris.getUTCMonth() + 1, d: bris.getUTCDate() + 2, hh: 10 }),
    brisbaneWallToUtc({ y: bris.getUTCFullYear(), m: bris.getUTCMonth() + 1, d: bris.getUTCDate() + 2, hh: 16 }),
  ];

  const results = [];
  for (let i = 0; i < chosen.length; i++) {
    const { p, st } = chosen[i];
    const dueUtc = slots[i % slots.length];
    const sched = normaliseSchedule(dueUtc);
    if (queuedContentStale(st, { ...p, status: "BUFFER_QUEUED", scheduled_for: dueUtc }, { now: NOW })) {
      results.push({ story_id: p.story_id, series: st.series, placement_id: p.placement_id, platform: p.platform, queued: false, reason: "QUEUED_CONTENT_STALE", valid_until: st.valid_until, scheduled_for: dueUtc });
      continue;
    }
    logEvent("BUFFER_QUEUE_REQUEST", { story_id: p.story_id, platform: p.platform, scheduled_for: dueUtc, mode });
    const r = await scheduleOne({
      story: st, placement: p,
      channelId: channelByService[p.platform],
      caption: p.caption_style?.text ?? "",
      dueAtUtc: dueUtc, professionalResult: "PASS", mode,
    });
    if (r.queued) {
      await patchPlacement(p.placement_id, { ...r.placement_patch, scheduled_for: dueUtc });
      logEvent("BUFFER_QUEUED", { story_id: p.story_id, platform: p.platform, provider_ref: r.provider_ref, provider_state: r.provider_state });
      // immediate reconcile (SS21)
      const rc = await reconcileOne({ placement: { ...p, buffer_provider_ref: r.provider_ref, scheduled_for: dueUtc } });
      logEvent("BUFFER_RECONCILED", { placement_id: p.placement_id, provider_state: rc.providerState, published: Boolean(rc.published) });
      results.push({
        story_id: p.story_id, series: st.series, placement_id: p.placement_id, platform: p.platform,
        layout_family: p.caption_style?.layout_family, artifact_hash: (p.artifact_hash ?? "").slice(0, 16),
        provider_ref: r.provider_ref, provider_state: r.provider_state,
        scheduled_for_utc: sched.scheduled_for_utc, scheduled_for_local: sched.scheduled_for_local,
        reconcile: { ok: rc.ok, published: Boolean(rc.published), provider_state: rc.providerState ?? null, drift: rc.drift ?? null },
        queued: true,
      });
    } else {
      results.push({ story_id: p.story_id, platform: p.platform, queued: false, reason: r.reason, blockers: r.blockers });
    }
  }
  return { posture, mode, feed, channels: Object.keys(channelByService), candidates: proof.length, chosen: chosen.length, queued: results.filter((r) => r.queued).length, results };
}

// --------------------------------------------------------------------
(async () => {
  mkdirSync(OUT, { recursive: true });
  const payload = { generated_at: new Date(NOW).toISOString(), visual_review_configured: reviewAvailable() };

  if (DO_SEED) {
    const s = await seedProof();
    payload.proof_seed = s;
    log(`proof-seed: stories +${s.stories}, placements +${s.placements} (5 series / 5 layouts)`);
  }

  if (DO_RENDER) {
    const r = await renderPass();
    payload.render = r;
    if (r.error) {
      log(`render: ${r.error}`);
    } else {
      for (const it of r.results) {
        log(`  ${it.series.padEnd(18)} ${it.platform.padEnd(10)} ${it.layout_family.padEnd(20)} QA=${it.deterministic_qa} L5=${it.visual_review.verdict}${it.visual_review.ai_spam_risk != null ? `(spam ${it.visual_review.ai_spam_risk})` : ""} -> ${it.status}${it.host_error ? ` [${it.host_error}]` : ""}`);
      }
      log(`  feed review: ${r.feed.verdict}${r.feed.warnings?.length ? ` (${r.feed.warnings.join("; ")})` : ""}`);
      log(`  BUFFER_READY: ${r.buffer_ready}`);
    }
  }

  if (DO_QUEUE) {
    const q = await queueProof();
    payload.queue_proof = q;
    if (q.error) log(`queue-proof: ${q.error}`);
    else if (q.blocked) log(`queue-proof: BLOCKED - ${q.blocked}`);
    else {
      log(`queue-proof: mode ${q.mode} | channels ${q.channels.join(",")} | chosen ${q.chosen} | queued ${q.queued}`);
      for (const r of q.results) {
        if (r.queued) log(`  ${r.series} ${r.platform} -> ref ${r.provider_ref} state=${r.provider_state} @ ${r.scheduled_for_local} | reconcile published=${r.reconcile.published} state=${r.reconcile.provider_state}`);
        else log(`  ${r.series ?? r.story_id} ${r.platform} -> NOT queued: ${r.reason}`);
      }
    }
  }

  // render results and queue results go to separate files so one never
  // clobbers the other (quality-audit reads render-results.json).
  if (payload.render) writeFileSync(path.join(OUT, "render-results.json"), JSON.stringify({ generated_at: payload.generated_at, visual_review_configured: payload.visual_review_configured, render: payload.render }, null, 2) + "\n");
  if (payload.queue_proof) writeFileSync(path.join(OUT, "queue-proof.json"), JSON.stringify({ generated_at: payload.generated_at, queue_proof: payload.queue_proof }, null, 2) + "\n");
  writeFileSync(path.join(OUT, "render-proof.json"), JSON.stringify(payload, null, 2) + "\n");
  if (JSON_OUT) console.log(JSON.stringify(payload, null, 2));
})().catch((e) => { console.error("social:backlog-render failed:", e?.stack || e?.message || e); process.exit(1); });

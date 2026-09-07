// Phase 13E.5A - SOCIAL DISTRIBUTION INFRASTRUCTURE tests.
//
// These pin the safety properties of the publish layer: it is
// NON-PUBLISHING by default; a real send needs SEVERAL independent gates
// to line up; provider acceptance is never treated as "published";
// captions are frozen; scheduling is UTC; and the layer imports no
// provider unless one is explicitly configured. No network in any test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  STATUSES,
  jobId,
  approve,
  markReady,
  applyProviderAccept,
  applyProviderReject,
  applyProviderEvidence,
  duplicateOf,
} from "../../lib/social/distribution/ledger.mjs";
import { runAllGates, readinessGates } from "../../lib/social/distribution/gates.mjs";
import { placementEligibility, mediaCompatibility, familyForContentType, PLATFORM_CHANNEL_KEY } from "../../lib/social/distribution/artifactMap.mjs";
import { toUtcIso, readDistributionFlags } from "../../lib/social/distribution/config.mjs";
import { getSocialProvider, _providers } from "../../lib/social/providers/index.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// --- a fully-passing fixture (every gate green) so each test can knock
//     out exactly one thing ------------------------------------------------
const GREEN_FLAGS = { publishEnabled: true, dryRun: false, epnAiClassification: "NOT_APPLICABLE_CURRENT_PIPELINE", hasBufferToken: true };

const FRESH_SNAP = () => ({ market_price: 100, discount_pct: 0.5, source_is_live: true, source_captured_at: new Date().toISOString() });
function greenVariant(over = {}) {
  return {
    media: { kind: "video_916", files: ["/x/a.mp4"], width: 1080, height: 1920, durationS: 8, filesExist: true },
    caption_instagram: "Body copy.\n\nAd · disclosure here.",
    caption_tiktok: "Body copy.\n\nAd · disclosure here.",
    hashtags: ["#PokemonCards"],
    qa: { ok: true, passed: 39, total: 39, failed: [] },
    rights: { ...RIGHTS_STATE },
    snapshot: FRESH_SNAP(),
    ...over,
  };
}
function greenRow(over = {}) {
  return {
    job_id: "cid::instagram_reel::9x16-reel",
    content_id: "cid",
    creative_family: "deal_drop",
    creative_variant: "9x16-reel",
    platform: "instagram_reel",
    channel_key: "instagram_main",
    channel_id: "buf_ig_1",
    status: "APPROVED",
    caption: "Body copy.\n\nAd · disclosure here.",
    hashtags: ["#PokemonCards"],
    qa: { ok: true, passed: 39, total: 39, failed: [] },
    rights: { ...RIGHTS_STATE },
    snapshot: FRESH_SNAP(),
    media: { kind: "video_916", files: ["/x/a.mp4"], width: 1080, height: 1920, durationS: 8, filesExist: true },
    ...over,
  };
}
const gateOk = (id, res) => res.gates.find((g) => g.id === id)?.ok;

// NOTE: the fixture uses a green *env fixture*, but RIGHTS_STATE.publishing
// is "DISABLED" in the committed source, so publish_switch is ALWAYS a
// blocker in this phase. Every "would send" test therefore also asserts
// the phase-level guarantee that the switch is off.

test("13E.5A-0. the master rights flag keeps publishing DISABLED this phase", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  const res = runAllGates({ row: greenRow(), variant: greenVariant(), flags: GREEN_FLAGS, providerConfigured: true, ledger: [] });
  assert.equal(gateOk("publish_switch", res), false, "publish_switch must be blocked while rights.publishing != ALLOWED");
});

test("13E.5A-1. no publish without a QA pass", () => {
  const res = runAllGates({
    row: greenRow({ qa: { ok: false, passed: 10, total: 39, failed: ["mp4_probe"] } }),
    variant: greenVariant({ qa: { ok: false, passed: 10, total: 39, failed: ["mp4_probe"] } }),
    flags: GREEN_FLAGS,
    providerConfigured: true,
    ledger: [],
  });
  assert.equal(gateOk("qa_pass", res), false);
  assert.ok(res.blockers.some((b) => b.startsWith("qa_pass")));
});

test("13E.5A-2. no publish without rights clearance / with rights drift", () => {
  // artifact carries a rights_state that disagrees with the source of truth
  const drift = { ...RIGHTS_STATE, card_image: "NOT_CLEARED" };
  const res = runAllGates({
    row: greenRow({ rights: drift }),
    variant: greenVariant({ rights: drift }),
    flags: GREEN_FLAGS,
    providerConfigured: true,
    ledger: [],
  });
  assert.equal(gateOk("rights_cleared", res), false);
});

test("13E.5A-3. no publish without explicit owner approval (READY is not enough)", () => {
  const res = runAllGates({
    row: greenRow({ status: "READY" }),
    variant: greenVariant(),
    flags: GREEN_FLAGS,
    providerConfigured: true,
    ledger: [],
  });
  assert.equal(gateOk("owner_approval", res), false);
});

test("13E.5A-4. no publish without the EPN compliance prerequisite", () => {
  const res = runAllGates({
    row: greenRow(),
    variant: greenVariant(),
    flags: { ...GREEN_FLAGS, epnAiClassification: null },
    providerConfigured: true,
    ledger: [],
  });
  assert.equal(gateOk("epn_compliance", res), false);
});

test("13E.5A-5. no publish without provider auth", () => {
  const res = runAllGates({ row: greenRow(), variant: greenVariant(), flags: GREEN_FLAGS, providerConfigured: false, ledger: [] });
  assert.equal(gateOk("provider_auth", res), false);
});

test("13E.5A-5b. no publish without a resolved provider channel id", () => {
  const res = runAllGates({ row: greenRow({ channel_id: null }), variant: greenVariant(), flags: GREEN_FLAGS, providerConfigured: true, ledger: [] });
  assert.equal(gateOk("channel_resolved", res), false);
});

test("13E.5A-6. no publish while dry-run mode is on (the default)", () => {
  const res = runAllGates({ row: greenRow(), variant: greenVariant(), flags: { ...GREEN_FLAGS, dryRun: true }, providerConfigured: true, ledger: [] });
  assert.equal(gateOk("live_mode", res), false);
  // and the real default from an empty env is dry-run + disabled
  const def = readDistributionFlags({});
  assert.equal(def.publishEnabled, false);
  assert.equal(def.dryRun, true);
  assert.equal(def.epnAiClassification, null);
});

test("13E.5A-7. duplicate protection blocks a second in-flight row for the same placement", () => {
  const row = greenRow();
  const twin = { ...greenRow(), job_id: "other" };
  const ledger = [{ ...greenRow(), job_id: "first", status: "QUEUED" }];
  assert.ok(duplicateOf(twin, ledger), "duplicateOf finds the QUEUED twin");
  const res = runAllGates({ row: twin, variant: greenVariant(), flags: GREEN_FLAGS, providerConfigured: true, ledger });
  assert.equal(gateOk("not_duplicate", res), false);
  // ...unless the owner forces it
  const forced = runAllGates({ row: twin, variant: greenVariant(), flags: GREEN_FLAGS, providerConfigured: true, ledger, force: true });
  assert.equal(gateOk("not_duplicate", forced), true);
  // a FAILED/CANCELLED prior row does NOT block
  assert.equal(duplicateOf(twin, [{ ...greenRow(), job_id: "f", status: "FAILED" }]), null);
});

test("13E.5A-8. platform / media compatibility is enforced deterministically", () => {
  // a 4:5 still is an IG feed image, never a TikTok
  assert.equal(placementEligibility({ family: "deal_drop", mediaKind: "image_45", platform: "instagram_feed" }).ok, true);
  assert.equal(placementEligibility({ family: "deal_drop", mediaKind: "image_45", platform: "tiktok" }).ok, false);
  // a carousel is IG-carousel only
  assert.equal(placementEligibility({ family: "hook_carousel", mediaKind: "carousel_45", platform: "instagram_carousel" }).ok, true);
  assert.equal(placementEligibility({ family: "hook_carousel", mediaKind: "carousel_45", platform: "tiktok" }).ok, false);
  // a 9:16 video is a Reel AND a TikTok
  assert.equal(placementEligibility({ family: "deal_drop", mediaKind: "video_916", platform: "instagram_reel" }).ok, true);
  assert.equal(placementEligibility({ family: "deal_drop", mediaKind: "video_916", platform: "tiktok" }).ok, true);
  // media envelope: a 1:1 image is out of IG-feed range only if outside 3:4..1.91; 4:5 is fine
  assert.equal(mediaCompatibility({ platform: "instagram_feed", mediaMeta: { kind: "image_45", width: 1080, height: 1350 } }).ok, true);
  // a landscape video is not a valid reel
  assert.equal(mediaCompatibility({ platform: "instagram_reel", mediaMeta: { kind: "video_916", width: 1920, height: 1080, durationS: 8 } }).ok, false);
  // a >10-slide carousel is rejected
  assert.equal(mediaCompatibility({ platform: "instagram_carousel", mediaMeta: { kind: "carousel_45", width: 1080, height: 1350, itemCount: 11 } }).ok, false);
  // an over-long reel is rejected
  assert.equal(mediaCompatibility({ platform: "instagram_reel", mediaMeta: { kind: "video_916", width: 1080, height: 1920, durationS: 1200 } }).ok, false);
});

test("13E.5A-9. the caption is frozen before queue: gate fails if it drifts from the artifact", () => {
  const res = runAllGates({
    row: greenRow({ caption: "EDITED after prepare — no disclosure" }),
    variant: greenVariant(),
    flags: GREEN_FLAGS,
    providerConfigured: true,
    ledger: [],
  });
  assert.equal(gateOk("caption_frozen", res), false);
  // also fails when the disclosure marker is missing
  const noDisc = runAllGates({
    row: greenRow({ caption: "Body only, no ad label", }),
    variant: greenVariant({ caption_instagram: "Body only, no ad label", caption_tiktok: "Body only, no ad label" }),
    flags: GREEN_FLAGS, providerConfigured: true, ledger: [],
  });
  assert.equal(gateOk("caption_frozen", noDisc), false);
});

test("13E.5A-10. scheduling is UTC-only; ambiguous timestamps are rejected", () => {
  assert.equal(toUtcIso("now"), null);
  assert.equal(toUtcIso(""), null);
  assert.equal(toUtcIso("2026-09-10T14:00:00Z"), "2026-09-10T14:00:00.000Z");
  assert.equal(toUtcIso("2026-09-10T14:00:00+10:00"), "2026-09-10T04:00:00.000Z");
  assert.throws(() => toUtcIso("2026-09-10 14:00"), /no timezone/);
  assert.throws(() => toUtcIso("next tuesday"), /no timezone|unparseable/);
});

test("13E.5A-11. provider acceptance -> QUEUED, never PUBLISHED; published_at is never our clock", () => {
  const row = greenRow({ status: "APPROVED" });
  const r = applyProviderAccept(row, { provider: "buffer", providerRef: "post_1" });
  assert.equal(r.ok, true);
  assert.equal(row.status, "QUEUED");
  assert.equal(row.provider_ref, "post_1");
  assert.ok(row.queued_at);
  assert.equal(row.published_at ?? null, null, "acceptance must NOT set published_at");
});

test("13E.5A-12. QUEUED -> PUBLISHED only on real provider evidence with a provider timestamp", () => {
  const q = () => greenRow({ status: "QUEUED", provider_ref: "post_1", queued_at: "2026-09-07T00:00:00.000Z" });

  // no evidence -> stays QUEUED
  let row = q();
  let r = applyProviderEvidence(row, { ok: true, published: false, publishedAt: null });
  assert.equal(row.status, "QUEUED");
  assert.equal(r.changed, false);

  // published flag but NO timestamp -> still not PUBLISHED (evidence required)
  row = q();
  applyProviderEvidence(row, { ok: true, published: true, publishedAt: null });
  assert.equal(row.status, "QUEUED");

  // real evidence -> PUBLISHED with the PROVIDER's timestamp
  row = q();
  r = applyProviderEvidence(row, { ok: true, published: true, publishedAt: "2026-09-07T01:02:03.000Z" });
  assert.equal(row.status, "PUBLISHED");
  assert.equal(row.published_at, "2026-09-07T01:02:03.000Z");

  // provider reports failure -> FAILED, truthfully recorded
  row = q();
  r = applyProviderEvidence(row, { ok: true, failed: true, failReason: "media rejected" });
  assert.equal(row.status, "FAILED");
  assert.match(row.last_error.reason, /media rejected/);
  assert.equal(row.last_error.stage, "sync");
});

test("13E.5A-13. a provider REJECT at submit -> FAILED, no auto-retry, error is truthful", () => {
  const row = greenRow({ status: "APPROVED" });
  applyProviderReject(row, { provider: "buffer", reason: "buffer_rate_limited", detail: "retry-after=30" });
  assert.equal(row.status, "FAILED");
  assert.equal(row.retry_count, 1);
  assert.equal(row.last_error.stage, "submit");
  assert.match(row.last_error.reason, /rate_limited/);
});

test("13E.5A-14. the CLI dry-run path mutates NOTHING external and calls no provider method", () => {
  const cli = read("scripts/socialPublish.mjs");
  const dry = cli.slice(cli.indexOf("function cmdDryRun"), cli.indexOf("function cmdApprove"));
  assert.doesNotMatch(dry, /PROVIDER\.(createPost|listChannels|getPostStatus)\s*\(/, "dry-run must not call a provider method");
  assert.doesNotMatch(dry, /saveLedger\(ledger\)[\s\S]*applyProviderAccept/, "dry-run must not queue");
  // dry-run only appends a dry_runs entry, never changes status
  assert.match(dry, /row\.dry_runs\.push/);
  assert.doesNotMatch(dry, /row\.status\s*=/);
});

test("13E.5A-15. the renderer / daily / video scripts contain no social-provider call path", () => {
  for (const p of ["lib/social/render.mjs", "lib/social/templates.mjs", "scripts/socialDaily.mjs", "scripts/socialVideo.mjs", "lib/social/videoRender.mjs"]) {
    const src = read(p).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /graph\.buffer\.com|api\.buffer\.com|BUFFER_ACCESS_TOKEN/, `${p} references Buffer`);
    assert.doesNotMatch(src, /from ["'][^"']*providers\/(buffer|index)/, `${p} imports a social provider`);
    assert.doesNotMatch(src, /createPost\s*\(|listChannels\s*\(|getPostStatus\s*\(/, `${p} calls a provider method`);
  }
});

test("13E.5A-16. social:daily still makes zero OpenAI calls (unchanged guarantee)", () => {
  const daily = read("scripts/socialDaily.mjs").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(daily, /openai|OPENAI_API_KEY|api\.openai\.com|images\.generate|chat\.completions/i);
});

test("13E.5A-17. the distribution layer imports no provider unless one is configured (null provider default)", () => {
  // with an empty env, getSocialProvider() is the refusing null provider
  const p = getSocialProvider({});
  assert.equal(p.name, "none");
  assert.equal(p.isConfigured(), false);
  return p.createPost({}).then((r) => {
    assert.equal(r.accepted, false);
    assert.match(r.reason, /no_social_provider_configured/);
  });
});

test("13E.5A-18. the Buffer adapter never posts when unconfigured and hard-codes only the documented endpoint", () => {
  const src = read("lib/social/providers/buffer.mjs");
  assert.match(src, /https:\/\/api\.buffer\.com/); // 13E.5B: verified live GraphQL endpoint
  assert.doesNotMatch(src, /NEXT_PUBLIC_/);
  const buf = _providers.bufferProvider({});
  assert.equal(buf.isConfigured(), false);
  return Promise.all([
    buf.createPost({}).then((r) => assert.equal(r.accepted, false)),
    buf.listChannels().then((r) => assert.equal(r.ok, false)),
    buf.getPostStatus("x").then((r) => assert.equal(r.ok, false)),
  ]);
});

test("13E.5A-19. the ledger state machine has exactly the documented states + jobId is stable", () => {
  assert.deepEqual(STATUSES, ["DRAFT", "READY", "APPROVED", "QUEUED", "PUBLISHED", "FAILED", "CANCELLED"]);
  assert.equal(jobId({ content_id: "c", platform: "tiktok", creative_variant: "9x16-tiktok" }), "c::tiktok::9x16-tiktok");
  // approve requires READY
  const draft = greenRow({ status: "DRAFT" });
  assert.equal(approve(draft).ok, false);
  const ready = greenRow({ status: "READY" });
  assert.equal(approve(ready).ok, true);
  assert.equal(ready.status, "APPROVED");
  assert.ok(ready.approved_at);
});

test("13E.5A-20. readinessGates ignores the live switch + approval, so an artifact can reach READY pre-auth", () => {
  // everything structural is fine; only publish_switch/live_mode/approval
  // (and, pre-auth, provider_auth + channel) would block a real send.
  const rg = readinessGates({
    row: greenRow({ status: "DRAFT" }),
    variant: greenVariant(),
    flags: readDistributionFlags({}),
    providerConfigured: false,
    ledger: [],
  });
  // provider_auth + channel_resolved still appear (they are readiness
  // concerns) but publish_switch / live_mode / owner_approval do not.
  const ids = rg.gates.map((g) => g.id);
  assert.ok(!ids.includes("publish_switch"));
  assert.ok(!ids.includes("live_mode"));
  assert.ok(!ids.includes("owner_approval"));
  assert.ok(ids.includes("qa_pass") && ids.includes("rights_cleared") && ids.includes("media_compatible"));
});

test("13E.5A-21. familyForContentType + channel map are exhaustive for the shipped families", () => {
  for (const ct of ["deal_of_day", "just_found", "market_mover", "best_deals_found_today", "pokemon_spotlight", "set_spotlight", "brand_ad", "market_snapshot"]) {
    assert.ok(familyForContentType(ct), `no family for ${ct}`);
  }
  for (const pl of ["instagram_feed", "instagram_carousel", "instagram_reel", "tiktok"]) {
    assert.ok(PLATFORM_CHANNEL_KEY[pl], `no channel key for ${pl}`);
  }
});

test("13E.5A-22. existing static + video QA gates are untouched (still fail-closed, no provider)", () => {
  const vqa = read("lib/social/videoQa.mjs");
  assert.match(vqa, /Fails closed/i);
  assert.doesNotMatch(vqa, /buffer|createPost/i);
  // the committed 13E.4 manifest is still marked not-published
  const m = JSON.parse(read(".social-preview/13e4/manifest.json"));
  assert.equal(m.published, false);
});

test("13E.5A-23 / 13E.5B. the committed ledger starts empty; the channel map is resolved for all 4 platforms", () => {
  assert.deepEqual(JSON.parse(read("lib/social/distribution/ledger.json")), []);
  const ch = JSON.parse(read("lib/social/distribution/channels.json"));
  // 13E.5B: owner connected IG + TikTok + X + YouTube on the Essentials
  // plan; the aliases are now resolved to real Buffer channel ids.
  for (const alias of ["instagram_main", "tiktok_main", "x_main", "youtube_main"]) {
    assert.equal(typeof ch[alias], "string", `${alias} must be a resolved channel id`);
    assert.ok(ch[alias].length > 8, `${alias} looks like a real id`);
  }
});

// ============ 13E.5B - X + YouTube expansion ==========================

import { xPostText, youtubeShortsMeta, COPY_LIMITS } from "../../lib/social/distribution/platformCopy.mjs";
import { PLATFORM_SERVICE, PLATFORM_PLACEMENT, LIMITS } from "../../lib/social/distribution/artifactMap.mjs";

const DEAL_FACTS = { family: "deal_drop", contentGoal: "CONVERSION", cardName: "Sabrina's Haunter", listedUsd: 186.89, marketRefUsd: 700, discountPct: 0.733, ctaUrl: "https://pokemondealfinder.com/deals/33202" };
const MOVER_FACTS = { family: "market_mover", contentGoal: "ENGAGEMENT", cardName: "Ditto", movementPct: 0.37, movementDirection: "up", movementWindow: "90 days", ctaUrl: "https://pokemondealfinder.com/cards" };

test("13E.5B-1. X post text is deterministic, factual, and within the 280-char budget", () => {
  const d = xPostText(DEAL_FACTS);
  assert.equal(d.ok, true);
  assert.ok(d.chars <= COPY_LIMITS.X_MAX, `deal X post ${d.chars} <= 280`);
  assert.match(d.text, /186\.89/);
  assert.match(d.text, /700/);
  assert.match(d.text, /73% below reference/);
  assert.match(d.text, /pokemondealfinder\.com\/deals\/33202/);
  assert.match(d.text, /\bAd\b/); // affiliate marker present
  assert.doesNotMatch(d.text, /https?:\/\//); // URL shown bare, not as a link scheme
  // same call twice -> byte-identical (no randomness / regeneration)
  assert.equal(xPostText(DEAL_FACTS).text, d.text);

  const m = xPostText(MOVER_FACTS);
  assert.equal(m.ok, true);
  assert.ok(m.chars <= COPY_LIMITS.X_MAX);
  assert.match(m.text, /moved up 37% over 90 days/);
});

test("13E.5B-2. an over-long card name still yields an in-budget X post (drops the disclosure tail, never the facts)", () => {
  const long = { ...DEAL_FACTS, cardName: "Charizard VMAX Rainbow Secret Rare Alternate Art Full Prerelease Promo Stamped" };
  const r = xPostText(long);
  assert.equal(r.ok, true);
  assert.ok(r.chars <= COPY_LIMITS.X_MAX);
  assert.match(r.text, /73% below/); // the fact survives
});

test("13E.5B-3. YouTube Shorts metadata is frozen: title <=100, description <=5000, carries disclosure + CTA", () => {
  const d = youtubeShortsMeta(DEAL_FACTS);
  assert.equal(d.ok, true);
  assert.ok(d.title.length > 0 && d.title.length <= COPY_LIMITS.YT_TITLE_MAX);
  assert.ok(d.description.length <= COPY_LIMITS.YT_DESC_MAX);
  assert.match(d.title, /\$700 Pokemon Card Listed for \$187/);
  assert.match(d.description, /pokemondealfinder\.com\/deals\/33202/);
  assert.match(d.description, /Prices and availability can change/);
  assert.match(d.description, /eBay Partner Network affiliate/);
  assert.match(d.description, /#PokemonCards #PokemonTCG/);
  // deterministic
  assert.equal(youtubeShortsMeta(DEAL_FACTS).title, d.title);
  assert.equal(youtubeShortsMeta(DEAL_FACTS).description, d.description);

  const m = youtubeShortsMeta(MOVER_FACTS);
  assert.equal(m.ok, true);
  assert.match(m.title, /Ditto: Market Reference Up 37%/);
});

test("13E.5B-4. X and YouTube copy for one content piece preserve the SAME underlying facts", () => {
  const x = xPostText(DEAL_FACTS).text;
  const yt = youtubeShortsMeta(DEAL_FACTS);
  // both carry the same listed price, same reference, same discount
  for (const s of ["186.89", "700", "73%"]) {
    assert.ok(x.includes(s.replace("186.89", "186.89")) || x.includes("186.89"), `X missing ${s}`);
  }
  assert.match(x, /186\.89/);
  assert.match(yt.description, /186\.89/);
  assert.match(x, /73% below reference/);
  assert.match(yt.description, /73% below reference/);
  assert.match(yt.title, /\$700 .* \$187/); // title rounds per the §5 example style; body stays exact
});

test("13E.5B-5. YouTube Shorts media eligibility: 9:16 video OK, 4:5 still rejected, >3min rejected", () => {
  assert.equal(mediaCompatibility({ platform: "youtube_short", mediaMeta: { kind: "video_916", width: 1080, height: 1920, durationS: 12 } }).ok, true);
  assert.equal(mediaCompatibility({ platform: "youtube_short", mediaMeta: { kind: "image_45", width: 1080, height: 1350 } }).ok, false);
  assert.equal(mediaCompatibility({ platform: "youtube_short", mediaMeta: { kind: "video_916", width: 1080, height: 1920, durationS: 200 } }).ok, false);
  // placement eligibility: every family that has a 9:16 cut can be a Short
  for (const fam of ["deal_drop", "market_mover", "hook_carousel", "brand_ad"]) {
    assert.equal(placementEligibility({ family: fam, mediaKind: "video_916", platform: "youtube_short" }).ok, true, fam);
  }
});

test("13E.5B-6. X static + text eligibility; a carousel is never an X post", () => {
  assert.equal(placementEligibility({ family: "deal_drop", mediaKind: "image_45", platform: "x_post" }).ok, true);
  assert.equal(placementEligibility({ family: "market_mover", mediaKind: "text_only", platform: "x_post" }).ok, true);
  assert.equal(placementEligibility({ family: "brand_ad", mediaKind: "image_45", platform: "x_post" }).ok, true);
  assert.equal(placementEligibility({ family: "hook_carousel", mediaKind: "carousel_45", platform: "x_post" }).ok, false);
  // media compat: an X text post needs frozen text within budget
  assert.equal(mediaCompatibility({ platform: "x_post", mediaMeta: { kind: "text_only" }, text: "" }).ok, false);
  assert.equal(mediaCompatibility({ platform: "x_post", mediaMeta: { kind: "text_only" }, text: "x".repeat(281) }).ok, false);
  assert.equal(mediaCompatibility({ platform: "x_post", mediaMeta: { kind: "text_only" }, text: "Short and factual. Ad" }).ok, true);
});

test("13E.5B-7. one content_id -> four platform placements, each its own job_id", () => {
  const cid = "pdf-deal-drop-deal-of-day-x-20260907-A-abc1234";
  const ids = ["instagram_reel", "tiktok", "x_post", "youtube_short"].map((p) =>
    jobId({ content_id: cid, platform: p, creative_variant: "9x16-reel" })
  );
  assert.equal(new Set(ids).size, 4, "four distinct job ids");
  ids.forEach((id) => assert.ok(id.startsWith(cid + "::")));
});

test("13E.5B-8. same-platform duplicate is blocked; cross-platform is allowed", () => {
  const cid = "cid-x";
  const igRow = { job_id: jobId({ content_id: cid, platform: "instagram_reel", creative_variant: "v" }), content_id: cid, platform: "instagram_reel", creative_variant: "v", status: "DRAFT" };
  const ledger = [
    { ...igRow, job_id: "first", status: "QUEUED" },
  ];
  // a second IG reel for the same content_id/variant -> duplicate
  assert.ok(duplicateOf(igRow, ledger));
  // the SAME content on TikTok / X / YouTube -> NOT a duplicate
  for (const p of ["tiktok", "x_post", "youtube_short"]) {
    const row = { job_id: jobId({ content_id: cid, platform: p, creative_variant: "v" }), content_id: cid, platform: p, creative_variant: "v", status: "DRAFT" };
    assert.equal(duplicateOf(row, ledger), null, `${p} must not collide with the IG reel`);
  }
});

test("13E.5B-9. platform maps: service + placement + channel-key are total over all 6 platforms", () => {
  for (const p of ["instagram_feed", "instagram_carousel", "instagram_reel", "tiktok", "x_post", "youtube_short"]) {
    assert.ok(PLATFORM_SERVICE[p], `service for ${p}`);
    assert.ok(PLATFORM_PLACEMENT[p], `placement for ${p}`);
    assert.ok(PLATFORM_CHANNEL_KEY[p], `channel key for ${p}`);
  }
  assert.equal(PLATFORM_SERVICE.x_post, "twitter");
  assert.equal(PLATFORM_SERVICE.youtube_short, "youtube");
  assert.equal(PLATFORM_PLACEMENT.youtube_short, "short");
});

test("13E.5B-10. the Buffer adapter hits ONLY api.buffer.com and is inert unconfigured (X + YT included)", () => {
  const src = read("lib/social/providers/buffer.mjs");
  assert.match(src, /const BUFFER_GRAPHQL = "https:\/\/api\.buffer\.com"/);
  assert.doesNotMatch(src, /graph\.buffer\.com/);
  assert.match(src, /metadata\.youtube\s*=/); // YouTube metadata branch (title/privacy)
  assert.match(src, /metadata\.instagram\s*=/); // IG metadata branch (type/firstComment)
  assert.match(src, /PostActionSuccess/); // real union member from live introspection
  const buf = _providers.bufferProvider({});
  assert.equal(buf.isConfigured(), false);
  return Promise.all([
    buf.createPost({ platform: "youtube", assets: [] }).then((r) => assert.equal(r.accepted, false)),
    buf.createPost({ platform: "twitter", assets: [] }).then((r) => assert.equal(r.accepted, false)),
  ]);
});

test("13E.5B-11. provider acceptance is still QUEUED (never PUBLISHED) for every platform", () => {
  for (const platform of ["instagram_reel", "tiktok", "x_post", "youtube_short"]) {
    const row = { job_id: `j-${platform}`, platform, status: "APPROVED" };
    applyProviderAccept(row, { provider: "buffer", providerRef: `p-${platform}` });
    assert.equal(row.status, "QUEUED", platform);
    assert.equal(row.published_at ?? null, null, `${platform}: acceptance must not set published_at`);
  }
});

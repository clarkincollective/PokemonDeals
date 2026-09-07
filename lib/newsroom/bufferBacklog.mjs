// Phase SOCIAL-NEWSROOM-2 - FUTURE-SCHEDULED BUFFER BACKLOG PATH
// (§10, §11, §25, §26, §27, §28, §29, §42).
//
// Uses the EXISTING Buffer provider adapter
// (lib/social/providers/index.getSocialProvider) - NO second Buffer
// client. This module only:
//   * builds the provider `msg` from a newsroom placement (channel, text,
//     hosted asset, future dueAt, deterministic UTM);
//   * refuses anything that is not a safe future schedule (§25);
//   * maps a provider ACCEPT to placement status BUFFER_QUEUED - never
//     PUBLISHED (that needs getPostStatus() evidence);
//   * reads provider state back for reconciliation (§27) - never
//     resubmits automatically.
//
// SAFETY: default provider mode is `draft` - a Buffer draft NEVER
// auto-sends. `scheduled` mode (real future auto-send) is opt-in via
// SOCIAL_BUFFER_BACKLOG_MODE=scheduled and still requires a dueAt >= now +
// 60m. LIVE-lane stories are rejected here outright - Deal Drops use the
// existing live-publish gate stack, not this path.
//
// This module lives in lib/newsroom/ (NOT lib/social/) because it calls
// the social provider adapter - the same boundary lib/autonomous/
// socialPublish.mjs and lib/newsroom/visualReview.mjs observe.

import { getSocialProvider } from "../social/providers/index.mjs";
import { attributedCtaUrl } from "../social/distribution/attribution.mjs";
import { scheduleTimeAcceptable, SCHEDULE_SAFETY_MINUTES } from "../social/newsroom/backlogConfig.mjs";
import { normaliseSchedule } from "../social/newsroom/timezone.mjs";
import { storyPublishableAt } from "../social/newsroom/story.mjs";

export const PROVIDER_MODES = Object.freeze(["draft", "scheduled"]);

export function resolveProviderMode(env = process.env) {
  const m = String(env.SOCIAL_BUFFER_BACKLOG_MODE ?? "draft").toLowerCase();
  return PROVIDER_MODES.includes(m) ? m : "draft";
}

const POST_TYPE = Object.freeze({
  instagram: { carousel: "carousel", reel: "reel", post: "post" },
  tiktok: { video: "post" },
  x: { post: "post" },
  youtube: { short: "short" },
});

// Build the provider `msg` for one placement. `channelId` comes from the
// Buffer channel list (provider.listChannels). `caption` is the
// platform-native text the caption layer produced. `assetUrl` is the
// PUBLIC hosted URL of OUR rendered artifact.
export function buildProviderMessage({ story, placement, channelId, caption, assetUrl, assetType = "image", thumbnailUrl = null, dueAtUtc, mode = "draft", env = process.env }) {
  const platform = placement.platform;
  const siteLink = attributedCtaUrl({
    baseUrl: "https://pokemondealfinder.com",
    platform,
    contentGoal: story.content_goal,
    contentId: placement.content_id ?? story.story_id,
    contentFamily: story.pillar?.toLowerCase() ?? null,
  });
  const msg = {
    channelId,
    platform,
    text: caption,
    postType: POST_TYPE[platform]?.[placement.placement_type] ?? "post",
    assets: assetUrl ? [{ type: assetType, url: assetUrl, ...(thumbnailUrl ? { thumbnailUrl } : {}) }] : [],
    schedulingType: "automatic",
    // draft mode: never auto-sends. scheduled mode: real future dueAt.
    ...(mode === "scheduled" ? { dueAt: dueAtUtc } : { saveToDraft: true, dueAt: dueAtUtc }),
    siteLink,
  };
  if (platform === "youtube" && story.facts_json?.headline_fact) msg.youtubeTitle = String(story.facts_json.headline_fact).slice(0, 90);
  if (platform === "tiktok" && story.facts_json?.headline_fact) msg.tiktokTitle = String(story.facts_json.headline_fact).slice(0, 90);
  return msg;
}

// Pre-flight a single placement for scheduling. Returns { ok, blockers[] }.
// Does NOT call the provider.
//
// SS2/SS3 HARD INVARIANT: `artifactQa` MUST be the result of
// db.artifactQueueEligible({ placementId, artifactSha: placement.artifact_hash })
// - i.e. the LATEST STACK + LATEST LAYER-5 verdict FOR THE EXACT CURRENT
// artifact sha, both PASS. A story-level / layout-level / different-hash /
// stale PASS can never authorise scheduling. `professionalResult` (the
// in-memory stack result) is still checked but is NOT sufficient alone.
export function preflightPlacement({ story, placement, dueAtUtc, professionalResult, artifactQa = null, now = Date.now() }) {
  const blockers = [];
  if (story.lane === "FRESH" || story.shelf_life_class === "LIVE") {
    blockers.push("LIVE/FRESH-lane story - not eligible for the backlog scheduling path");
  }
  if (professionalResult !== "PASS") {
    blockers.push(`professional QA = ${professionalResult} (need PASS; WATCH holds, FAIL blocks)`);
  }
  // the artifact-scoped invariant - the queue path MUST supply it.
  if (!artifactQa || artifactQa.ok !== true) {
    blockers.push(`artifact-scoped QA invariant not satisfied: ${artifactQa?.reason ?? "no artifactQueueEligible() result supplied"}`);
  }
  const sched = scheduleTimeAcceptable(dueAtUtc, { now, safetyMinutes: SCHEDULE_SAFETY_MINUTES });
  if (!sched.ok) blockers.push(sched.reason);
  if (!storyPublishableAt(story, dueAtUtc)) {
    blockers.push(`story latest_safe_publish_at (${story.latest_safe_publish_at}) is before the scheduled time`);
  }
  if (!placement.hosted_url) blockers.push("no hosted asset URL for this placement");
  if (!placement.artifact_hash) blockers.push("no artifact_hash (asset not registered)");
  return { ok: blockers.length === 0, blockers };
}

// Schedule ONE placement. `channelId` + `caption` supplied by the caller.
// Returns a result the caller persists:
//   { queued, placement_patch, provider_ref, provider_state, reason, blockers }
// queued=true  => provider ACCEPTED into its queue (status BUFFER_QUEUED,
//                 NOT published).
export async function scheduleOne({ story, placement, channelId, caption, dueAtUtc, professionalResult, artifactQa = null, mode = "draft", env = process.env, now = Date.now(), provider = null }) {
  const pre = preflightPlacement({ story, placement, dueAtUtc, professionalResult, artifactQa, now });
  if (!pre.ok) return { queued: false, reason: "preflight_failed", blockers: pre.blockers };

  const prov = provider ?? getSocialProvider(env);
  if (!prov.isConfigured?.()) return { queued: false, reason: "provider_not_configured", blockers: ["BUFFER_ACCESS_TOKEN not set"] };

  const msg = buildProviderMessage({
    story, placement, channelId, caption,
    assetUrl: placement.hosted_url, assetType: placement.placement_type === "video" || placement.placement_type === "reel" || placement.placement_type === "short" ? "video" : "image",
    dueAtUtc, mode, env,
  });

  const res = await prov.createPost(msg);
  if (!res.accepted) {
    return { queued: false, reason: res.reason ?? "provider_rejected", blockers: [String(res.detail ?? res.reason ?? "provider rejected")] };
  }
  const sched = normaliseSchedule(dueAtUtc);
  return {
    queued: true,
    provider_ref: res.id,
    provider_state: res.statusRaw ?? (mode === "scheduled" ? "scheduled" : "draft"),
    reason: null,
    blockers: [],
    placement_patch: {
      status: "BUFFER_QUEUED", // provider accepted - NOT published
      buffer_provider_ref: res.id,
      scheduled_for: sched?.scheduled_for_utc ?? dueAtUtc,
      provider_state: res.statusRaw ?? (mode === "scheduled" ? "scheduled" : "draft"),
    },
  };
}

// Read one queued placement's provider state back for reconciliation
// (§27). Returns { ok, drift, published, providerState, detail }. NEVER
// resubmits.
export async function reconcileOne({ placement, env = process.env, provider = null }) {
  if (!placement.buffer_provider_ref) return { ok: false, drift: "MISSING_PROVIDER_REF", detail: "placement has no buffer_provider_ref" };
  const prov = provider ?? getSocialProvider(env);
  if (!prov.isConfigured?.()) return { ok: false, drift: "PROVIDER_NOT_CONFIGURED" };
  const st = await prov.getPostStatus(placement.buffer_provider_ref);
  if (!st.ok) {
    return { ok: false, drift: st.reason === "buffer_post_not_found" ? "MISSING_PROVIDER_POST" : "PROVIDER_ERROR", detail: st.reason };
  }
  if (st.published) {
    return { ok: true, drift: null, published: true, publishedAt: st.publishedAt, platformPostUrl: st.platformPostUrl, providerState: st.statusRaw };
  }
  if (st.failed) return { ok: true, drift: "FAILED", published: false, providerState: st.statusRaw, detail: st.failReason };
  // scheduled / draft / needs_approval / sending -> still queued, not published
  return { ok: true, drift: null, published: false, providerState: st.statusRaw };
}

// §29 - a queued placement whose story has since expired must be flagged
// QUEUED_CONTENT_STALE (not silently allowed to publish). Pure check.
export function queuedContentStale(story, placement, { now = Date.now() } = {}) {
  if (placement.status !== "BUFFER_QUEUED") return false;
  const vu = Date.parse(story?.valid_until ?? "");
  const sched = Date.parse(placement.scheduled_for ?? "");
  if (Number.isFinite(vu) && vu < now) return true; // story already invalid
  if (Number.isFinite(vu) && Number.isFinite(sched) && sched > vu) return true; // will fire after it goes stale
  return false;
}

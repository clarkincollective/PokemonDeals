// Phase 13E.5A / 13E.5B - BUFFER PROVIDER ADAPTER.
//
// Buffer is the single scheduling / autopost layer for Instagram, TikTok,
// X (Twitter), and YouTube. This adapter isolates every Buffer-specific
// detail behind one interface so the distribution layer never knows which
// provider is underneath (same pattern as lib/outreach/provider.js).
//
// SCHEMA VERIFIED LIVE 2026-09-07 by GraphQL introspection against the
// owner's Essentials-plan token (see docs/social-distribution.md):
//   endpoint   POST https://api.buffer.com        (GraphQL)
//   auth       Authorization: Bearer <BUFFER_ACCESS_TOKEN>   (personal API key)
//   account    query { account { email organizations { id name } } }
//   channels   query { channels(input:{ organizationId }) {
//                 id name displayName service serviceId type isLocked isDisconnected } }
//   createPost mutation { createPost(input: CreatePostInput!) { ...on PostActionSuccess { post { id status } } ...on <Error> { message } } }
//     CreatePostInput: channelId, text, assets:[AssetInput!]!, dueAt,
//       mode: ShareMode! (addToQueue|customScheduled|shareNext|shareNow),
//       schedulingType: SchedulingType! (automatic|notification),
//       saveToDraft, needsApproval: Boolean!, metadata: PostInputMetaData
//     AssetInput = { image:{url,thumbnailUrl?} } | { video:{url,thumbnailUrl?} }  (URLs MUST be public - no direct upload)
//     PostInputMetaData: instagram{ type: PostType!, shouldShareToFeed: Boolean!, firstComment, link },
//       tiktok{ title }, youtube{ title, privacy: YoutubePrivacy(private|public|unlisted), madeForKids, notifySubscribers },
//       twitter{ thread:[...] }
//     PostType enum: post | reel | carousel | short | story | thread | ...
//   post       query { post(input:{ id }) { id status sentAt dueAt externalLink error { ... } } }
//     PostStatus enum: draft | error | needs_approval | scheduled | sending | sent
//   metrics    query { post(input:{ id }) { metrics { name type unit value } metricsUpdatedAt } }
//     PostMetric: { name, type: PostMetricType, unit: PostMetricUnit(count|percentage), value: Float }
//     PostMetricType enum (verified live 2026-09-07): impressions reach views likes
//       comments shares saves clicks reposts quotes reactions engagementRate
//       averageTimeWatched totalTimeWatched viewers follows postCount
//     aggregatedPostMetrics(input:{ organizationId, channelIds, startDateTime, endDateTime, tags })
//       -> { metrics:[PostMetric!]!, metricsUpdatedAt }
//     NOTE: Buffer's post-metrics API is EARLY / EXPERIMENTAL + personal-use
//       (own API key only). Per-platform coverage is not guaranteed. Treat a
//       returned value as real, an ABSENT metric as null - never 0.
//   Rate limits: per API key, rolling (Essentials: 3 keys, 7500 req / 30 days;
//     100 / 15 min; 250-500 / 24 h). HTTP 429 + Retry-After.
//   NO post-status webhook -> confirm by polling post(id).
//
// SAFETY: with no BUFFER_ACCESS_TOKEN, getSocialProvider() returns the
// null provider and none of this runs. Even configured, createPost is
// only reached from scripts/socialPublish.mjs `send`, which hard-fails
// unless every gate in lib/social/distribution/gates.mjs passes.

const BUFFER_GRAPHQL = "https://api.buffer.com"; // verified 2026-09-07

async function bufferGraphQL(apiKey, query, variables) {
  const res = await fetch(BUFFER_GRAPHQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  const retryAfter = res.headers.get("retry-after");
  const rate = res.headers.get("ratelimit");
  if (res.status === 429) {
    return { ok: false, reason: "buffer_rate_limited", detail: `retry-after=${retryAfter ?? "?"} ${rate ?? ""}`.trim() };
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: `buffer_http_${res.status}`, detail: "non-JSON response" };
  }
  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    return { ok: false, reason: "buffer_error", detail: msg.slice(0, 400) };
  }
  return { ok: true, data: json.data, rate: { policy: rate, retryAfter } };
}

// Valid Buffer PostType values (live enum, verified 2026-09-07):
//   post | reel | carousel | short | story | thread | ...
const VALID_POST_TYPES = new Set(["post", "reel", "carousel", "short", "story", "thread"]);

export function bufferProvider(env = process.env) {
  const apiKey = String(env.BUFFER_ACCESS_TOKEN ?? "").trim() || null;

  async function orgId() {
    const r = await bufferGraphQL(apiKey, `query { account { organizations { id name } } }`, {});
    if (!r.ok) return { ok: false, ...r };
    const org = r.data?.account?.organizations?.[0];
    if (!org?.id) return { ok: false, reason: "buffer_no_organization" };
    return { ok: true, id: org.id, name: org.name };
  }

  return {
    name: "buffer",
    isConfigured: () => Boolean(apiKey),

    // List the connected channels so the owner can map the logical
    // aliases (instagram_main / tiktok_main / x_main / youtube_main) to
    // stable Buffer channel ids in channels.json.
    async listChannels() {
      if (!apiKey) return { ok: false, reason: "buffer_not_configured" };
      const org = await orgId();
      if (!org.ok) return org;
      const q = `query Channels($input: ChannelsInput!) {
        channels(input: $input) { id name displayName service serviceId type isLocked isDisconnected }
      }`;
      const r = await bufferGraphQL(apiKey, q, { input: { organizationId: org.id } });
      if (!r.ok) return r;
      const channels = (r.data?.channels ?? []).map((c) => ({
        id: c.id,
        name: c.displayName || c.name,
        service: c.service, // "instagram" | "tiktok" | "twitter" | "youtube" | ...
        serviceId: c.serviceId,
        type: c.type, // "business" | "account" | "profile" | "channel"
        locked: Boolean(c.isLocked),
        disconnected: Boolean(c.isDisconnected),
      }));
      return { ok: true, organizationId: org.id, channels };
    },

    // Create ONE post/update. msg:
    //   { channelId, platform, placement, text, assets:[{type:"image"|"video", url, thumbnailUrl?}],
    //     dueAt:string|null, saveToDraft:boolean, schedulingType,
    //     firstComment?, youtubeTitle?, tiktokTitle?, siteLink? }
    // Returns { accepted, id?, statusRaw?, reason?, detail? }. A created
    // post is ACCEPTED into Buffer's queue - NOT proof it published.
    async createPost(msg) {
      if (!apiKey) return { accepted: false, reason: "buffer_not_configured" };
      const postType = VALID_POST_TYPES.has(msg.postType) ? msg.postType : "post";
      const assets = (msg.assets ?? []).map((a) =>
        a.type === "video"
          ? { video: { url: a.url, ...(a.thumbnailUrl ? { thumbnailUrl: a.thumbnailUrl } : {}) } }
          : { image: { url: a.url, ...(a.thumbnailUrl ? { thumbnailUrl: a.thumbnailUrl } : {}) } }
      );
      const metadata = {};
      if (msg.platform === "instagram") {
        metadata.instagram = { type: postType, shouldShareToFeed: true, ...(msg.firstComment ? { firstComment: msg.firstComment } : {}), ...(msg.siteLink ? { link: msg.siteLink } : {}) };
      } else if (msg.platform === "tiktok" && msg.tiktokTitle) {
        metadata.tiktok = { title: msg.tiktokTitle };
      } else if (msg.platform === "youtube") {
        metadata.youtube = { ...(msg.youtubeTitle ? { title: msg.youtubeTitle } : {}), privacy: "public", madeForKids: false, notifySubscribers: false };
      }
      const input = {
        channelId: msg.channelId,
        text: msg.text,
        assets,
        schedulingType: msg.schedulingType ?? "automatic",
        needsApproval: false,
        saveToDraft: Boolean(msg.saveToDraft),
        ...(msg.dueAt ? { dueAt: msg.dueAt, mode: "customScheduled" } : { mode: "addToQueue" }),
        ...(Object.keys(metadata).length ? { metadata } : {}),
      };
      const mutation = `mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename
          ... on PostActionSuccess { post { id status } }
          ... on NotFoundError { message }
          ... on UnauthorizedError { message }
          ... on InvalidInputError { message }
          ... on LimitReachedError { message }
          ... on RestProxyError { message }
          ... on UnexpectedError { message }
        }
      }`;
      const r = await bufferGraphQL(apiKey, mutation, { input });
      if (!r.ok) return { accepted: false, reason: r.reason, detail: r.detail };
      const p = r.data?.createPost;
      if (p?.__typename === "PostActionSuccess" && p.post?.id) {
        return { accepted: true, id: p.post.id, statusRaw: p.post.status ?? null };
      }
      return { accepted: false, reason: `buffer_${p?.__typename ?? "unknown"}`, detail: String(p?.message ?? JSON.stringify(r.data)).slice(0, 300) };
    },

    // Poll one post and normalise "did it actually publish?".
    //   -> { ok, published, publishedAt, failed, failReason?, statusRaw }
    // PostStatus: draft|scheduled|needs_approval|sending -> not published;
    // sent (with sentAt) -> published; error -> failed.
    async getPostStatus(id) {
      if (!apiKey) return { ok: false, reason: "buffer_not_configured" };
      const q = `query Post($input: PostInput!) { post(input: $input) { id status sentAt dueAt externalLink error { __typename } } }`;
      const r = await bufferGraphQL(apiKey, q, { input: { id } });
      if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
      const p = r.data?.post;
      if (!p) return { ok: false, reason: "buffer_post_not_found" };
      const status = String(p.status ?? "").toLowerCase();
      const published = status === "sent" && Boolean(p.sentAt);
      const failed = status === "error";
      return {
        ok: true,
        published,
        publishedAt: published ? p.sentAt : null,
        // the live post URL, when the platform returned one - NOT scraped.
        platformPostUrl: p.externalLink ?? null,
        failed,
        failReason: failed ? String(p.error?.__typename ?? "buffer reported error") : undefined,
        statusRaw: p.status ?? null,
      };
    },

    // ---- 13E.7A: READ-ONLY performance metrics --------------------
    // One post's metrics. Returns { ok, metrics:[{name,type,unit,value}],
    // metricsUpdatedAt, statusRaw }. No mutation. An absent metric is simply
    // not in the list - the caller must NOT treat that as 0.
    async getPostMetrics(id) {
      if (!apiKey) return { ok: false, reason: "buffer_not_configured" };
      const q = `query PostMetrics($input: PostInput!) {
        post(input: $input) { id status metricsUpdatedAt metrics { name type unit value description } }
      }`;
      const r = await bufferGraphQL(apiKey, q, { input: { id } });
      if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
      const p = r.data?.post;
      if (!p) return { ok: false, reason: "buffer_post_not_found" };
      return {
        ok: true,
        metrics: Array.isArray(p.metrics) ? p.metrics : [],
        metricsUpdatedAt: p.metricsUpdatedAt ?? null,
        statusRaw: p.status ?? null,
      };
    },

    // Org / channel-level aggregation over a date window (for the standard
    // reporting windows). { ok, metrics:[...], metricsUpdatedAt }.
    async getAggregatedMetrics({ channelIds = null, startDateTime = null, endDateTime = null, tags = null } = {}) {
      if (!apiKey) return { ok: false, reason: "buffer_not_configured" };
      const org = await orgId();
      if (!org.ok) return org;
      const q = `query Agg($input: AggregatedPostMetricsInput!) {
        aggregatedPostMetrics(input: $input) { metricsUpdatedAt metrics { name type unit value description } }
      }`;
      const input = { organizationId: org.id };
      if (channelIds) input.channelIds = channelIds;
      if (startDateTime) input.startDateTime = startDateTime;
      if (endDateTime) input.endDateTime = endDateTime;
      if (tags) input.tags = tags;
      const r = await bufferGraphQL(apiKey, q, { input });
      if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
      const a = r.data?.aggregatedPostMetrics;
      return { ok: true, metrics: Array.isArray(a?.metrics) ? a.metrics : [], metricsUpdatedAt: a?.metricsUpdatedAt ?? null };
    },
  };
}

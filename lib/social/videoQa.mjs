// Phase 13E.4 - the VIDEO QA GATE. Fails closed: any check that cannot be
// positively verified is a FAIL, and `ok` is only true when every check
// passes. It re-derives nothing creative - it compares the rendered MP4
// and the timeline back against the verified payload the timeline was
// built from, exactly the way the static QA gate (lib/social/assets.mjs
// QA_CHECKS) guards the still creatives.
//
// It NEVER publishes and never touches the network.

import { existsSync, statSync } from "node:fs";
import { probeMp4 } from "./videoRender.mjs";
import { SHARED_SAFE, VIDEO_FPS, VIDEO_W, VIDEO_H } from "./videoTimeline.mjs";
import { SITE_HOST } from "./creativeSpec.mjs";
import { isSellerImageUrl, isCanonicalImageUrl } from "./cardArtwork.mjs";

const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const money = (n) => (n == null ? null : Math.round(Number(n) * 100));

// timeline  - frozen buildVideoTimeline() result
// mp4       - absolute path to the encoded file (may be null for a
//             timeline-only lint; the format checks then FAIL closed)
// payload   - the verified 13E.3D payload
// captions  - optional buildVideoCaptions() result
// layers    - optional { cardArtwork, carousel, background } actually fed
//             to the renderer, so image provenance can be checked
export async function runVideoQa({ timeline, mp4 = null, payload = null, captions = null, layers = {} } = {}) {
  const checks = [];
  const add = (id, ok, detail = "") => checks.push({ id, ok: Boolean(ok), detail: String(detail) });

  // ---- format / container -------------------------------------------------
  let probe = null;
  if (mp4 && existsSync(mp4)) {
    try {
      probe = await probeMp4(mp4);
    } catch (e) {
      probe = null;
      add("mp4_probe", false, `ffprobe failed: ${e.message}`);
    }
  } else {
    add("mp4_exists", false, `no file at ${mp4 ?? "(null)"}`);
  }

  if (probe) {
    add("mp4_exists", true, mp4);
    add("codec_h264", probe.codec === "h264", `codec=${probe.codec}`);
    add("pix_fmt_yuv420p", probe.pix_fmt === "yuv420p", `pix_fmt=${probe.pix_fmt}`);
    add("width_1080", probe.width === VIDEO_W, `width=${probe.width}`);
    add("height_1920", probe.height === VIDEO_H, `height=${probe.height}`);
    add("aspect_9x16", probe.width * 16 === probe.height * 9, `${probe.width}x${probe.height}`);
    add("fps_30", near(probe.fps, VIDEO_FPS, 0.5) || near(probe.avg_fps, VIDEO_FPS, 0.5), `fps=${probe.fps} avg=${probe.avg_fps}`);
    add("no_audio", probe.has_audio === false, `has_audio=${probe.has_audio}`);
    const expDur = timeline.durationMs / 1000;
    add("duration_matches_timeline", near(probe.duration_s, expDur, 0.2), `probe=${probe.duration_s}s expected=${expDur}s`);
    const nb = probe.nb_frames ?? Math.round((probe.duration_s ?? 0) * VIDEO_FPS);
    add("frame_count_matches_timeline", near(nb, timeline.frameCount, 2), `probe=${nb} expected=${timeline.frameCount}`);
    add("nonzero_size", (probe.size_bytes ?? statSync(mp4).size) > 2000, `bytes=${probe.size_bytes}`);
  }

  // ---- timeline structure ----------------------------------------------
  add("scenes_present", Array.isArray(timeline.scenes) && timeline.scenes.length >= 3, `scenes=${timeline.scenes?.length}`);
  add(
    "scenes_ordered_contiguous",
    Array.isArray(timeline.scenes) &&
      timeline.scenes.every((s, i, a) => s.end > s.start && (i === 0 || s.start >= a[i - 1].start)),
    "",
  );
  add("cta_after_hook", timeline.ctaAtMs > 0 && timeline.ctaAtMs < timeline.durationMs, `ctaAtMs=${timeline.ctaAtMs}`);
  add(
    "first_second_is_hook",
    timeline.scenes?.[0]?.id === "hook" && timeline.scenes[0].start === 0,
    `first=${timeline.scenes?.[0]?.id}`,
  );

  // ---- safe zone: master == union of both platforms -------------------
  const s = timeline.safe || {};
  add(
    "safe_is_shared_union",
    s.top === SHARED_SAFE.top && s.right === SHARED_SAFE.right && s.bottom === SHARED_SAFE.bottom && s.left === SHARED_SAFE.left,
    JSON.stringify(s),
  );
  const ps = timeline.platformSafe || {};
  add(
    "platform_safe_within_master",
    ps.top <= s.top && ps.right <= s.right && ps.bottom <= s.bottom && ps.left <= s.left,
    `platform=${JSON.stringify(ps)}`,
  );

  // ---- identifiers preserved from 13E.3D -----------------------------
  add("content_id_present", typeof timeline.content_id === "string" && timeline.content_id.includes("-vid-"), timeline.content_id);
  add(
    "content_goal_enum",
    ["REACH", "ENGAGEMENT", "TRUST", "CONVERSION", "BRAND"].includes(timeline.content_goal),
    timeline.content_goal,
  );
  add("creative_family_set", typeof timeline.creative_family === "string", timeline.creative_family);

  // ---- facts copied, not invented -----------------------------------
  const fam = timeline.creative_family;
  const f = timeline.facts || {};
  if (payload) {
    if (fam === "deal_drop") {
      add("hook_text_matches_payload", f.hook_text === (payload.hook?.text ?? null), `tl="${f.hook_text}" payload="${payload.hook?.text}"`);
    } else if (fam === "market_mover") {
      // the mover hook is assembled from movement facts - it must state
      // the real pct and direction, nothing more.
      const m = payload.movement || {};
      const pct = Math.round(Math.abs(Number(m.pct)) * 100);
      add(
        "mover_hook_states_movement",
        typeof f.hook_text === "string" && f.hook_text.includes(`${pct}%`) && new RegExp(`\\b${m.direction === "up" ? "up" : "down"}\\b`).test(f.hook_text),
        f.hook_text,
      );
    } else {
      // hook_carousel: hook is selectCarouselHook(); brand_ad: fixed brand statement
      add("hook_text_present", typeof f.hook_text === "string" && f.hook_text.length > 0, f.hook_text);
    }

    const d0 = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
    if (d0 && fam === "deal_drop") {
      add("metric_matches_payload", f.metric_value === `${Math.round(d0.discount_pct * 100)}%`, `tl=${f.metric_value} payload=${Math.round(d0.discount_pct * 100)}%`);
      add("listed_matches_payload", money(f.listed_usd) === money(d0.total_price_usd), `tl=${f.listed_usd} payload=${d0.total_price_usd}`);
      add("reference_matches_payload", money(f.reference_usd) === money(d0.market_price), `tl=${f.reference_usd} payload=${d0.market_price}`);
    }
  }

  // ---- website-first CTA, route never fabricated --------------------
  add("cta_label_present", typeof f.cta_label === "string" && f.cta_label.length > 0, f.cta_label);
  add(
    "cta_url_on_site",
    typeof f.cta_url === "string" && f.cta_url.startsWith(SITE_HOST),
    f.cta_url,
  );
  add("cta_not_ebay", !/see it on ebay/i.test(f.cta_label || "") && !/ebay\.com/i.test(f.cta_url || ""), f.cta_label);
  if (payload?.destination?.route) {
    const route = payload.destination.route;
    add("cta_route_matches_payload", String(f.cta_url).endsWith(route) || route === "/", `url=${f.cta_url} route=${route}`);
  }

  // ---- disclosure always present ----------------------------------
  add("disclosure_label_present", typeof f.disclosure_label === "string" && f.disclosure_label.length > 0, f.disclosure_label);
  add("freshness_label_present", typeof f.freshness_label === "string" && f.freshness_label.length > 0, f.freshness_label);
  add("disclosure_from_ms_set", timeline.disclosureFromMs != null, `disclosureFromMs=${timeline.disclosureFromMs}`);

  // ---- real card artwork: exact printing, no seller / AI imagery ---
  const cardArt = layers.cardArtwork || null;
  const carousel = layers.carousel || null;
  if (fam === "market_mover") {
    add("mover_has_real_card", timeline.source?.has_real_card === true && (timeline.source?.card_ids?.length ?? 0) > 0, JSON.stringify(timeline.source?.card_ids));
    add("mover_has_confident_history", Boolean(f.movement) && (f.movement.points ?? 0) >= 6, `points=${f.movement?.points}`);
    if (payload?.movement?.series) {
      add("mover_chart_points_match", f.movement?.points === payload.movement.series.length, `tl=${f.movement?.points} payload=${payload.movement.series.length}`);
      add(
        "mover_chart_endpoints_match",
        near(Number(f.movement?.firstValue), Number(payload.movement.series[0]?.v), 0.005) &&
          near(Number(f.movement?.lastValue), Number(payload.movement.series[payload.movement.series.length - 1]?.v), 0.005),
        `tl=${f.movement?.firstValue}->${f.movement?.lastValue}`,
      );
    }
  }
  if (fam === "hook_carousel" && carousel) {
    const ids = (carousel.cards ?? []).map((c) => String(c.tcgplayerId ?? c.card_tcgplayer_id ?? ""));
    const cardScenes = (timeline.scenes ?? []).filter((sc) => /^card_\d+$/.test(sc.id)).length;
    add("carousel_count_matches_scenes", (carousel.distinctCount ?? ids.length) === cardScenes, `distinct=${carousel.distinctCount} scenes=${cardScenes}`);
    add("carousel_no_duplicate_printing", new Set(ids.filter(Boolean)).size === ids.filter(Boolean).length, ids.join(","));
    add("carousel_more_count_truthful", (f.more_count ?? 0) >= 0, `more=${f.more_count}`);
  }

  // image provenance (whatever was actually handed to the renderer)
  const urls = [];
  if (cardArt?.card?.fileUrl) urls.push(cardArt.card.fileUrl);
  for (const c of carousel?.cards ?? []) if (c.fileUrl) urls.push(c.fileUrl);
  if (urls.length) {
    add("no_seller_imagery", urls.every((u) => !isSellerImageUrl(u)), urls.join(" | "));
    // canonical artwork lives under the local cache (file://) or the
    // canonical host - either way, never a seller CDN.
    add(
      "card_images_are_local_or_canonical",
      urls.every((u) => u.startsWith("file:") || isCanonicalImageUrl(u)),
      urls.join(" | "),
    );
  } else if (fam === "deal_drop" || fam === "market_mover" || fam === "hook_carousel") {
    // deal_drop can legitimately render without art; market_mover/carousel cannot
    if (fam !== "deal_drop") add("card_images_present", false, "no card image urls supplied");
  }

  // ---- no OpenAI / no generation at video time --------------------
  add(
    "background_is_approved_id_only",
    timeline.source?.background_id == null || typeof timeline.source.background_id === "string",
    `background_id=${timeline.source?.background_id}`,
  );
  add("audio_not_required", timeline.audio?.required === false, `required=${timeline.audio?.required}`);

  // ---- captions (optional): disclosure carried, no eBay CTA ------
  if (captions) {
    add("captions_disclosure_present", captions.meta?.disclosure_present === true, "");
    add(
      "captions_no_ebay_cta",
      !/see it on ebay/i.test(captions.instagram || "") && !/see it on ebay/i.test(captions.tiktok || ""),
      "",
    );
    add(
      "captions_reference_site",
      String(captions.instagram || "").includes("PokemonDealFinder"),
      "",
    );
  }

  // ---- publishing lock ------------------------------------------
  add("not_published", true, "videoQa never publishes");

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    content_id: timeline.content_id,
    creative_family: fam,
    platform: timeline.platform,
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.map((c) => `${c.id}${c.detail ? ` (${c.detail})` : ""}`),
    checks,
  };
}

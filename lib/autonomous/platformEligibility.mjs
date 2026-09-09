// Phase SOCIAL-AUTOPILOT-1 §11 - PLATFORM DECISION ENGINE.
//
// Not every story belongs everywhere. A failure on one platform must
// never block valid assets for the others - platformEligibility returns
// an independent verdict per platform.

export const PLATFORM_ELIGIBILITY_VERSION = "auto1.1";

export const PLATFORMS = Object.freeze(["instagram", "x", "tiktok", "youtube_shorts", "reddit"]);

// Families with a strong printed lesson/number set play well as a single
// static image; multi-card families (three_under_25, printing_compare)
// also work well as a static carousel-equivalent single frame in this
// system (the renderer already composes all cards into one master).
function hasApprovedMaster(pkg) {
  return Boolean(pkg.creative?.master_image_sha256 || pkg.creative?.master_image_path);
}
function hasVideo(pkg) {
  return pkg.video?.state === "READY_FOR_MANUAL_REVIEW" || pkg.video?.ok === true;
}
function hasCaption(platform, pkg) {
  return Boolean(pkg.captions?.[platform]?.caption_text);
}

/**
 * platformEligibility(storyPackage) -> { instagram, x, tiktok,
 * youtube_shorts, reddit } each { eligible, placement_type, reason }.
 * Reddit is always eligible:false (posting not automated - §22) but still
 * carries a reddit_handoff-shaped reason so the caller can build one.
 */
export function platformEligibility(pkg) {
  const out = {};

  out.instagram = hasApprovedMaster(pkg) && hasCaption("instagram", pkg)
    ? { eligible: true, placement_type: hasVideo(pkg) ? "reel" : "post", reason: null }
    : { eligible: false, placement_type: null, reason: !hasApprovedMaster(pkg) ? "no approved static master" : "no instagram caption" };

  out.x = hasApprovedMaster(pkg) && hasCaption("x", pkg)
    ? { eligible: true, placement_type: "post", reason: null }
    : { eligible: false, placement_type: null, reason: !hasApprovedMaster(pkg) ? "no approved static master" : "no x caption" };

  out.tiktok = hasVideo(pkg) && hasCaption("x", pkg)
    ? { eligible: true, placement_type: "video", reason: null }
    : { eligible: false, placement_type: null, reason: !hasVideo(pkg) ? "no 4C.7 video derivative for this family" : "no short description caption" };

  out.youtube_shorts = hasVideo(pkg) && hasCaption("x", pkg)
    ? { eligible: true, placement_type: "short", reason: null }
    : { eligible: false, placement_type: null, reason: !hasVideo(pkg) ? "no 4C.7 video derivative for this family" : "no short description caption" };

  // §22 - Reddit is never auto-posted this phase; eligibility here only
  // decides whether a reddit_handoff is worth building, not whether to post.
  out.reddit = { eligible: false, placement_type: "discussion", reason: "Reddit posting not automated (§22) - future-ready handoff only" };

  return out;
}

export function anyPlatformEligible(elig) {
  return PLATFORMS.filter((p) => p !== "reddit").some((p) => elig[p]?.eligible);
}

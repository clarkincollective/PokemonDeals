// Phase SOCIAL-AUTOPILOT-3 §10/§16 - STORAGE / COST ACCOUNTING.
//
// Deterministic reuse accounting from a set of hostMedia() results. Does
// NOT delete anything - retention/cleanup already exists
// (lib/social/storage/hostedAssets.cleanupCandidates) and stays untouched
// and unused-for-deletion this phase.

export const STORAGE_ESTIMATE_VERSION = "auto3.1";

export function summarizeHostingRun(results = []) {
  const uploadedBytes = results.reduce((s, r) => s + (r.cacheHit ? 0 : r.uploadedBytes ?? 0), 0);
  const reusedBytes = results.reduce((s, r) => s + (r.cacheHit ? r.record?.bytes ?? 0 : 0), 0);
  const uniqueShas = new Set(results.map((r) => r.record?.sha256).filter(Boolean));
  const images = results.filter((r) => r.record?.mime_type === "image/png" || r.record?.mime_type === "image/jpeg");
  const videos = results.filter((r) => r.record?.mime_type === "video/mp4");
  return {
    uploaded_bytes: uploadedBytes,
    reused_bytes: reusedBytes,
    unique_images: new Set(images.map((r) => r.record?.sha256)).size,
    unique_videos: new Set(videos.map((r) => r.record?.sha256)).size,
    duplicate_uploads_prevented: results.filter((r) => r.cacheHit).length,
    total_distinct_assets: uniqueShas.size,
  };
}

// Rough projections. Deliberately conservative and labelled as an
// ESTIMATE - never presented as a bill.
export function projectStorage({ postsPerDay = 1, avgImageBytes = 1_500_000, avgVideoBytes = 1_600_000, videoSharePct = 0.4, days = 30 } = {}) {
  const assetsPerPost = 1; // one master image OR one video per platform-family, content-addressed/reused across platforms
  const totalPosts = postsPerDay * days;
  const videoPosts = Math.round(totalPosts * videoSharePct);
  const imagePosts = totalPosts - videoPosts;
  const newBytes = imagePosts * avgImageBytes * assetsPerPost * 0.3 /* most days reuse a cached master */ + videoPosts * avgVideoBytes * assetsPerPost * 0.3;
  return {
    projected_new_storage_bytes_per_month: Math.round(newBytes),
    projected_new_storage_mb_per_month: Math.round((newBytes / 1_000_000) * 10) / 10,
    // Supabase Storage egress is billed on serves, not uploads - Buffer
    // fetches each asset ~once at schedule time; a rough per-post egress
    // estimate:
    projected_egress_bytes_per_month: Math.round((imagePosts * avgImageBytes + videoPosts * avgVideoBytes)),
    note: "rough estimate only - actual usage depends on real cache-hit rate and Buffer retry behaviour",
  };
}

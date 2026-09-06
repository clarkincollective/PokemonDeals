import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { IMAGE_VERDICT } from "@/lib/listingImage";
import { classifyListingImage } from "@/lib/listingImageClassify";
import { getListingSnapshot, getBrowseRateLimit } from "@/lib/ebay";

// OUT-OF-BAND deal-image screening worker. P0 deal-image-integrity.
//
// Two jobs, in one pipeline:
//
//  1. RECOVER a missing seller image. Some listings (non-US marketplaces,
//     graded slabs) come back from item_summary/search with NO `image`,
//     so the scanner stored image_url = NULL. The card-back remediation
//     then marked those rows NO_TRUSTED_IMAGE and the render path fell
//     back to canonical art with a "Reference image" badge - even though
//     eBay's single-item endpoint has the seller's photos (deal 31083:
//     5 real front photos, shown as canonical for days). For a row with a
//     genuinely missing image URL this worker makes ONE bounded,
//     quota-gated get_item_by_legacy_id call to recover them, then writes
//     image_url / image_urls back. Rows that already have an image URL
//     make NO eBay call.
//
//  2. CLASSIFY / SELECT. The deterministic card-back detector
//     (lib/listingImage - sharp colour/structure, no vision, no AI)
//     records the verdict the render path uses:
//       SELLER_FRONT  - the primary seller photo is a usable card face
//       SELLER_OTHER  - primary was a back; another photo is a usable face
//                       -> display_image_url points at it
//       CARD_BACK     - the only usable seller photo is a card back
//                       -> render uses the canonical art
//       NO_TRUSTED_IMAGE - no usable seller photo AND none recoverable
//                       -> canonical art, or a neutral no-image state
//
// TTL-queued (image_checked_at nulls-first). Bounded per run.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 40;
const RESCREEN_AFTER_DAYS = 14;
const SCAN_CAP = 12000;
const PAGE = 1000;
const MAX_ALTS = 4; // alternate seller photos to check when the primary is a back

// Image RECOVERY is the lowest-priority use of the eBay Browse budget:
// a hard per-run cap AND a high quota floor, so it never competes with
// discovery / verification / auction re-pricing.
const IMAGE_RECOVER_PER_RUN = 12;
const RECOVER_RESERVE = 900;

const COLS =
  "id, listing_id, marketplace, image_url, image_urls, card_tcgplayer_id, is_graded, image_verdict, image_checked_at";

const legacyOf = (listingId) => String(listingId ?? "").split("|")[1] || String(listingId ?? "") || null;

async function fetchImage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 8_000_000) throw new Error("img too large");
  return buf;
}

const isHttp = (u) => typeof u === "string" && /^https?:\/\//.test(u);
const hasStoredImages = (row) =>
  isHttp(row.image_url) || (Array.isArray(row.image_urls) && row.image_urls.some(isHttp));

// ONE get_item_by_legacy_id call to recover seller photos the search
// endpoint dropped. Returns exactly one of:
//   { recovered: { imageUrl, imageUrls } }  - use these
//   { noImages: true }                      - listing genuinely has none
//   { ended: true }                         - gone; leave the freshness sweep to retire it
//   { inconclusive: true }                  - transient; retry a later run
async function recoverListingImages(row) {
  const legacy = legacyOf(row.listing_id);
  if (!legacy) return { inconclusive: true };
  let snap;
  try {
    snap = await getListingSnapshot(legacy, row.marketplace);
  } catch {
    return { inconclusive: true };
  }
  if (snap.status === "ENDED") return { ended: true };
  if (snap.status === "UNKNOWN") return { inconclusive: true };
  // ACTIVE or SOLD - a real listing read.
  const urls = (Array.isArray(snap.imageUrls) ? snap.imageUrls : []).filter(isHttp);
  const primary = isHttp(snap.primaryImage) ? snap.primaryImage : urls[0] ?? null;
  if (!primary) return { noImages: true };
  return { recovered: { imageUrl: primary, imageUrls: urls.length ? urls : [primary] } };
}

// Classify one deal's images. Returns { image_verdict, display_image_url }
// or null when the primary can't be fetched/decoded right now.
async function screenRow(row) {
  const primary = row.image_url;
  if (!isHttp(primary)) {
    return { image_verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, display_image_url: null };
  }
  let primaryVerdict;
  try {
    primaryVerdict = (await classifyListingImage(await fetchImage(primary))).verdict;
  } catch {
    return null; // leave whatever verdict the row already had
  }
  if (primaryVerdict !== IMAGE_VERDICT.CARD_BACK) {
    return { image_verdict: IMAGE_VERDICT.SELLER_FRONT, display_image_url: null };
  }

  // Primary is a card back - try the seller's other photos for a real face.
  const alts = (Array.isArray(row.image_urls) ? row.image_urls : [])
    .filter((u) => isHttp(u) && u !== primary)
    .slice(0, MAX_ALTS);
  for (const alt of alts) {
    try {
      const v = (await classifyListingImage(await fetchImage(alt))).verdict;
      if (v !== IMAGE_VERDICT.CARD_BACK) {
        return { image_verdict: IMAGE_VERDICT.SELLER_OTHER, display_image_url: alt };
      }
    } catch {
      /* skip an un-fetchable alt */
    }
  }
  return { image_verdict: IMAGE_VERDICT.CARD_BACK, display_image_url: null };
}

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const staleCutoff = new Date(Date.now() - RESCREEN_AFTER_DAYS * 864e5).toISOString();

  const candidates = [];
  for (let from = 0; from < SCAN_CAP && candidates.length < BATCH; from += PAGE) {
    const { data, error } = await db
      .from("deals")
      .select(COLS)
      .eq("is_active", true)
      .order("image_checked_at", { ascending: true, nullsFirst: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return Response.json({ ok: false, stage: "select", error: error.message }, { status: 200 });
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (candidates.length >= BATCH) break;
      if (row.image_checked_at && row.image_checked_at > staleCutoff) continue;
      candidates.push(row);
    }
    if (data.length < PAGE) break;
  }

  // Pre-flight the Browse quota ONCE. Image recovery only runs when the
  // budget is comfortably above the reserve; otherwise every missing-image
  // row just keeps its canonical fallback this cycle (no state change).
  const rl = await getBrowseRateLimit();
  const recoverBudget =
    rl && rl.remaining != null && rl.remaining - IMAGE_RECOVER_PER_RUN >= RECOVER_RESERVE
      ? IMAGE_RECOVER_PER_RUN
      : 0;
  let recoverUsed = 0;
  let browseCalls = 0;

  const results = {
    SELLER_FRONT: 0,
    SELLER_OTHER: 0,
    CARD_BACK: 0,
    NO_TRUSTED_IMAGE: 0,
    recovered: 0,
    recoverDeferred: 0,
    recoverInconclusive: 0,
    ended: 0,
    skipped: 0,
    errors: 0,
  };
  const detail = [];

  for (const row of candidates) {
    let recoveredNow = false;

    // --- 1. recover a genuinely missing seller image -----------------
    if (!hasStoredImages(row)) {
      if (recoverUsed >= recoverBudget) {
        results.recoverDeferred++;
        continue; // keep the canonical fallback; don't stamp - retry next run
      }
      recoverUsed++;
      browseCalls++;
      let rec;
      try {
        rec = await recoverListingImages(row);
      } catch {
        rec = { inconclusive: true };
      }
      if (rec.ended) {
        results.ended++;
        continue; // sweep-stale-deals / verify-deals will retire it
      }
      if (rec.inconclusive) {
        results.recoverInconclusive++;
        continue; // transient - retry a later run, bounded by the per-run cap
      }
      if (rec.noImages) {
        results.NO_TRUSTED_IMAGE++;
        detail.push({ id: row.id, from: row.image_verdict ?? null, to: "NO_TRUSTED_IMAGE", note: "no_seller_images" });
        await db
          .from("deals")
          .update({
            image_verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE,
            display_image_url: null,
            image_checked_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        continue;
      }
      // recovered - hydrate the row so screenRow classifies the real photo
      row.image_url = rec.recovered.imageUrl;
      row.image_urls = rec.recovered.imageUrls;
      recoveredNow = true;
      results.recovered++;
    }

    // --- 2. classify / select --------------------------------------
    let verdict;
    try {
      verdict = await screenRow(row);
    } catch {
      results.errors++;
      verdict = null;
    }

    if (!verdict) {
      results.skipped++;
      const patch = { image_checked_at: new Date().toISOString() };
      // still persist a recovered URL so a later run can classify it
      if (recoveredNow) {
        patch.image_url = row.image_url;
        patch.image_urls = row.image_urls;
      }
      await db.from("deals").update(patch).eq("id", row.id);
      continue;
    }

    results[verdict.image_verdict] = (results[verdict.image_verdict] ?? 0) + 1;
    detail.push({
      id: row.id,
      from: row.image_verdict ?? null,
      to: verdict.image_verdict,
      ...(recoveredNow ? { note: "image_recovered" } : {}),
    });
    const patch = {
      image_verdict: verdict.image_verdict,
      display_image_url: verdict.display_image_url,
      image_checked_at: new Date().toISOString(),
    };
    if (recoveredNow) {
      patch.image_url = row.image_url;
      patch.image_urls = row.image_urls;
    }
    const { error } = await db.from("deals").update(patch).eq("id", row.id);
    if (error) results.errors++;
  }

  return Response.json({
    ok: true,
    screened: candidates.length,
    browseCalls,
    recoverBudget,
    rateLimitRemaining: rl?.remaining ?? null,
    results,
    detail,
  });
}

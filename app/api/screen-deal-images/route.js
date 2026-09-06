import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { IMAGE_VERDICT } from "@/lib/listingImage";
import { classifyListingImage } from "@/lib/listingImageClassify";

// OUT-OF-BAND deal-image screening worker. P0 deal-image-integrity.
//
// Some eBay listings carry ONLY a photo of the card BACK (blue swirl /
// Poke Ball / "Pokemon" wordmark). It loads fine, so the deal hero showed
// a back with no card face (deal 32672). This worker classifies each
// active deal's seller photo(s) with the DETERMINISTIC card-back detector
// (lib/listingImage - sharp colour/structure features, no vision, no AI)
// and records a verdict the render path uses to fall back to the trusted
// canonical exact-printing art:
//
//   SELLER_FRONT  - the primary seller photo is a usable card face
//   SELLER_OTHER  - primary was a back, another seller photo is a usable
//                   face -> display_image_url points at it
//   CARD_BACK     - the only usable seller photo is a card back -> the
//                   render path uses the canonical art (or a neutral
//                   no-image state when no exact canonical exists)
//
// NO eBay Browse calls (images are fetched from i.ebayimg.com / the
// TCGplayer CDN, not the rate-limited API). Cost per run: BATCH deals x a
// few small image fetches + sharp decodes. Bounded, cron-scheduled.
// Re-checks each row on a TTL since a listing's photos rarely change.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 40;
const RESCREEN_AFTER_DAYS = 14;
const SCAN_CAP = 12000;
const PAGE = 1000;
const MAX_ALTS = 4; // alternate seller photos to check when the primary is a back

const COLS = "id, image_url, image_urls, card_tcgplayer_id, is_graded, image_verdict, image_checked_at";

async function fetchImage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 8_000_000) throw new Error("img too large");
  return buf;
}

const isHttp = (u) => typeof u === "string" && /^https?:\/\//.test(u);

// Classify one deal's images. Returns { image_verdict, display_image_url }.
async function screenRow(row) {
  const primary = row.image_url;
  if (!isHttp(primary)) {
    return { image_verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, display_image_url: null };
  }
  let primaryVerdict;
  try {
    primaryVerdict = (await classifyListingImage(await fetchImage(primary))).verdict;
  } catch {
    // Can't fetch/decode the primary right now - stay unopinionated
    // (leave whatever verdict the row already had; don't assert a back).
    return null;
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

  const results = { SELLER_FRONT: 0, SELLER_OTHER: 0, CARD_BACK: 0, NO_TRUSTED_IMAGE: 0, skipped: 0, errors: 0 };
  const detail = [];
  for (const row of candidates) {
    let verdict;
    try {
      verdict = await screenRow(row);
    } catch (e) {
      results.errors++;
      verdict = null;
    }
    if (!verdict) {
      results.skipped++;
      // still stamp checked_at so a persistently-unfetchable image doesn't
      // wedge the queue - but don't change the verdict.
      await db.from("deals").update({ image_checked_at: new Date().toISOString() }).eq("id", row.id);
      continue;
    }
    results[verdict.image_verdict] = (results[verdict.image_verdict] ?? 0) + 1;
    detail.push({ id: row.id, from: row.image_verdict ?? null, to: verdict.image_verdict });
    const { error } = await db
      .from("deals")
      .update({
        image_verdict: verdict.image_verdict,
        display_image_url: verdict.display_image_url,
        image_checked_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) results.errors++;
  }

  return Response.json({ ok: true, screened: candidates.length, results, detail });
}

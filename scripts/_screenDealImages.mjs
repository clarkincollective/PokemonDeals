// P0 DEAL IMAGE INTEGRITY - one-off remediation.
//
//   node scripts/_screenDealImages.mjs                  # dry-run: classify all
//   node scripts/_screenDealImages.mjs --apply
//   node scripts/_screenDealImages.mjs --recover        # dry-run: recover missing seller images
//   node scripts/_screenDealImages.mjs --recover --apply
//
// Default: classify EVERY active deal's stored seller photo(s) with the
// deterministic card-back detector and write image_verdict /
// display_image_url / image_checked_at.
//
// --recover: for active rows whose seller image was NEVER captured
// (image_url NULL - the item_summary/search response for some
// marketplaces omits it), make ONE bounded get_item_by_legacy_id call
// each to recover the seller photos, write image_url / image_urls, then
// classify. Quota-guarded. Safe to re-run.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { IMAGE_VERDICT } from "../lib/listingImage.js";
import { classifyListingImage } from "../lib/listingImageClassify.js";
import { getListingSnapshot, getBrowseRateLimit } from "../lib/ebay.js";

const APPLY = process.argv.includes("--apply");
const RECOVER = process.argv.includes("--recover");
const RECOVER_RESERVE = 900;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const isHttp = (u) => typeof u === "string" && /^https?:\/\//.test(u);
const legacyOf = (id) => String(id ?? "").split("|")[1] || String(id ?? "") || null;
const MAX_ALTS = 4;

async function fetchBuf(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 8_000_000 ? null : b;
  } catch {
    return null;
  }
}

async function classifyFromUrls(imageUrl, imageUrls) {
  if (!isHttp(imageUrl)) return { image_verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, display_image_url: null };
  const buf = await fetchBuf(imageUrl);
  if (!buf) return null; // inconclusive
  if ((await classifyListingImage(buf)).verdict !== IMAGE_VERDICT.CARD_BACK) {
    return { image_verdict: IMAGE_VERDICT.SELLER_FRONT, display_image_url: null };
  }
  const alts = (Array.isArray(imageUrls) ? imageUrls : [])
    .filter((u) => isHttp(u) && u !== imageUrl)
    .slice(0, MAX_ALTS);
  for (const alt of alts) {
    const ab = await fetchBuf(alt);
    if (!ab) continue;
    if ((await classifyListingImage(ab)).verdict !== IMAGE_VERDICT.CARD_BACK) {
      return { image_verdict: IMAGE_VERDICT.SELLER_OTHER, display_image_url: alt };
    }
  }
  return { image_verdict: IMAGE_VERDICT.CARD_BACK, display_image_url: null };
}

async function pageAllActive(cols, filter = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(db.from("deals").select(cols).eq("is_active", true)).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// --- --recover: pull missing seller images from eBay -------------------
async function runRecover() {
  const rows = await pageAllActive(
    "id, card_name, card_set, card_tcgplayer_id, listing_id, marketplace, image_url, image_urls, image_verdict",
    (q) => q.is("image_url", null)
  );
  console.log(`rows with image_url NULL: ${rows.length}  (${APPLY ? "APPLY" : "DRY-RUN"})`);

  const rl = await getBrowseRateLimit();
  console.log("Browse quota:", rl);
  if (rl && rl.remaining != null && rl.remaining - rows.length < RECOVER_RESERVE) {
    console.error(
      `refusing: ${rows.length} calls would drop Browse quota (${rl.remaining}) below the ${RECOVER_RESERVE} reserve. Re-run after the daily reset.`
    );
    process.exit(1);
  }

  const tally = { recovered_front: 0, recovered_other: 0, recovered_back: 0, no_images: 0, ended: 0, inconclusive: 0 };
  const changes = [];
  let n = 0;
  for (const r of rows) {
    n++;
    let snap;
    try {
      snap = await getListingSnapshot(legacyOf(r.listing_id), r.marketplace);
    } catch {
      snap = { status: "UNKNOWN" };
    }
    if (snap.status === "ENDED") {
      tally.ended++;
      continue;
    }
    if (snap.status === "UNKNOWN") {
      tally.inconclusive++;
      continue;
    }
    const urls = (Array.isArray(snap.imageUrls) ? snap.imageUrls : []).filter(isHttp);
    const primary = isHttp(snap.primaryImage) ? snap.primaryImage : urls[0] ?? null;
    if (!primary) {
      tally.no_images++;
      if (APPLY) {
        await db
          .from("deals")
          .update({ image_verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, display_image_url: null, image_checked_at: new Date().toISOString() })
          .eq("id", r.id);
      }
      continue;
    }
    const imageUrls = urls.length ? urls : [primary];
    const v = await classifyFromUrls(primary, imageUrls);
    if (!v) {
      tally.inconclusive++;
      if (APPLY) {
        // persist the recovered URLs so a later classify run can use them
        await db.from("deals").update({ image_url: primary, image_urls: imageUrls }).eq("id", r.id);
      }
      continue;
    }
    tally[
      v.image_verdict === IMAGE_VERDICT.SELLER_FRONT
        ? "recovered_front"
        : v.image_verdict === IMAGE_VERDICT.SELLER_OTHER
          ? "recovered_other"
          : "recovered_back"
    ]++;
    changes.push({
      id: r.id,
      card: `${r.card_name} / ${r.card_set}`,
      verdict: v.image_verdict,
      images: imageUrls.length,
      primary,
    });
    if (APPLY) {
      const { error } = await db
        .from("deals")
        .update({
          image_url: primary,
          image_urls: imageUrls,
          image_verdict: v.image_verdict,
          display_image_url: v.display_image_url,
          image_checked_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (error) console.error(`update ${r.id}:`, error.message);
    }
    if (n % 20 === 0) console.error(`  ...${n}/${rows.length}`);
  }

  console.log("\n---- recovery tally ----");
  console.log(JSON.stringify(tally, null, 2));
  console.log(`\n---- changes (${changes.length}) ----`);
  console.log(JSON.stringify(changes, null, 2));
  const after = await getBrowseRateLimit();
  console.log("Browse quota after:", after);
  if (!APPLY) console.log("\nDRY-RUN. Re-run with --recover --apply to write.");
}

// --- default: classify every active row's stored images ---------------
async function runClassify() {
  const rows = await pageAllActive("id, card_name, card_set, card_tcgplayer_id, image_url, image_urls, image_verdict");
  console.log(`active deals: ${rows.length}  (${APPLY ? "APPLY" : "DRY-RUN"})`);

  const tally = { SELLER_FRONT: 0, SELLER_OTHER: 0, CARD_BACK: 0, NO_TRUSTED_IMAGE: 0, inconclusive: 0 };
  const flagged = [];
  let n = 0;
  for (const r of rows) {
    n++;
    const v = await classifyFromUrls(r.image_url, r.image_urls);
    if (!v) {
      tally.inconclusive++;
      continue;
    }
    tally[v.image_verdict] = (tally[v.image_verdict] ?? 0) + 1;
    if (v.image_verdict === IMAGE_VERDICT.CARD_BACK || v.image_verdict === IMAGE_VERDICT.SELLER_OTHER) {
      flagged.push({ id: r.id, card: `${r.card_name} / ${r.card_set}`, verdict: v.image_verdict, alt: v.display_image_url ?? null, image_url: r.image_url });
    }
    if (APPLY) {
      const { error } = await db
        .from("deals")
        .update({ image_verdict: v.image_verdict, display_image_url: v.display_image_url, image_checked_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) console.error(`update ${r.id}:`, error.message);
    }
    if (n % 200 === 0) console.error(`  ...${n}/${rows.length}`);
  }
  console.log("\n---- verdict tally ----");
  console.log(JSON.stringify(tally, null, 2));
  console.log(`\n---- flagged (${flagged.length}) ----`);
  console.log(JSON.stringify(flagged, null, 2));
  if (!APPLY) console.log("\nDRY-RUN. Re-run with --apply to write.");
}

(RECOVER ? runRecover() : runClassify()).catch((e) => {
  console.error(e);
  process.exit(1);
});

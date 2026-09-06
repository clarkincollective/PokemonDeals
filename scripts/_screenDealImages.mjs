// P0 DEAL IMAGE INTEGRITY - §12 one-off remediation. Classifies EVERY
// active deal's seller photo(s) with the deterministic card-back detector
// and writes image_verdict / display_image_url / image_checked_at, so the
// render path can fall back to the canonical exact-printing art for the
// rows that only have a card-back photo.
//
// READ-ONLY unless --apply. Prints counts. Safe to re-run. No eBay Browse
// calls (images come from i.ebayimg.com / the TCGplayer CDN).
//
//   node scripts/_screenDealImages.mjs           # dry run
//   node scripts/_screenDealImages.mjs --apply
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { IMAGE_VERDICT } from "../lib/listingImage.js";
import { classifyListingImage } from "../lib/listingImageClassify.js";

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const isHttp = (u) => typeof u === "string" && /^https?:\/\//.test(u);
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

async function screen(row) {
  if (!isHttp(row.image_url)) return { image_verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, display_image_url: null };
  const buf = await fetchBuf(row.image_url);
  if (!buf) return null; // inconclusive - leave the row's verdict alone
  const primary = (await classifyListingImage(buf)).verdict;
  if (primary !== IMAGE_VERDICT.CARD_BACK) return { image_verdict: IMAGE_VERDICT.SELLER_FRONT, display_image_url: null };

  const alts = (Array.isArray(row.image_urls) ? row.image_urls : [])
    .filter((u) => isHttp(u) && u !== row.image_url)
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

async function main() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("id, card_name, card_set, card_tcgplayer_id, image_url, image_urls, image_verdict")
      .eq("is_active", true)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`active deals: ${rows.length}  (${APPLY ? "APPLY" : "DRY-RUN"})`);

  const tally = { SELLER_FRONT: 0, SELLER_OTHER: 0, CARD_BACK: 0, NO_TRUSTED_IMAGE: 0, inconclusive: 0 };
  const canon = { back_with_canonical: 0, back_without_canonical: 0 };
  const flagged = [];
  let n = 0;
  for (const r of rows) {
    n++;
    const v = await screen(r);
    if (!v) {
      tally.inconclusive++;
      continue;
    }
    tally[v.image_verdict] = (tally[v.image_verdict] ?? 0) + 1;
    if (v.image_verdict === IMAGE_VERDICT.CARD_BACK) {
      r.card_tcgplayer_id != null ? canon.back_with_canonical++ : canon.back_without_canonical++;
      flagged.push({ id: r.id, card: `${r.card_name} / ${r.card_set}`, hasCanonical: r.card_tcgplayer_id != null, image_url: r.image_url });
    }
    if (v.image_verdict === IMAGE_VERDICT.SELLER_OTHER) {
      flagged.push({ id: r.id, card: `${r.card_name} / ${r.card_set}`, verdict: "SELLER_OTHER", alt: v.display_image_url, image_url: r.image_url });
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
  console.log("\n---- CARD_BACK canonical availability ----");
  console.log(JSON.stringify(canon, null, 2));
  console.log(`\n---- flagged (${flagged.length}) ----`);
  console.log(JSON.stringify(flagged, null, 2));
  if (!APPLY) console.log("\nDRY-RUN. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

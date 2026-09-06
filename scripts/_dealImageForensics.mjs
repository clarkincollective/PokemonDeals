// P0 DEAL IMAGE INTEGRITY - forensic trace + active-deal image audit.
// READ-ONLY. Pulls a deal (default 32672) from prod, asks eBay for ALL
// images on the listing, and (with --audit) scans active deals for
// card-back / broken / packaging-only primary images.
//
//   node scripts/_dealImageForensics.mjs [dealId]
//   node scripts/_dealImageForensics.mjs --audit [limit]
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { catalogImageUrl } from "../lib/cardImage.js";
import { classifyListingImage } from "../lib/listingImageClassify.js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1";
let _tok = null;
async function token() {
  if (_tok) return _tok;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  _tok = (await res.json()).access_token;
  return _tok;
}
const legacyOf = (id) => String(id ?? "").split("|")[1] || String(id ?? "") || null;

async function ebayItem(legacyId, marketplace) {
  const t = await token();
  const res = await fetch(
    `${EBAY_BROWSE_URL}/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(legacyId)}`,
    { headers: { Authorization: `Bearer ${t}`, "X-EBAY-C-MARKETPLACE-ID": marketplace } }
  );
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const b = await res.json();
  return {
    title: b.title,
    image: b.image?.imageUrl ?? null,
    thumbnailImages: (b.thumbnailImages ?? []).map((i) => i.imageUrl),
    additionalImages: (b.additionalImages ?? []).map((i) => i.imageUrl),
  };
}

async function fetchBuf(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    return { buf };
  } catch (e) {
    return { error: e.message };
  }
}

async function classifyUrl(url) {
  if (!url) return { url, verdict: "MISSING" };
  const { buf, error } = await fetchBuf(url);
  if (error) return { url, verdict: "BROKEN", error };
  const c = await classifyListingImage(buf);
  return { url, ...c };
}

async function trace(dealId) {
  const { data: d, error } = await db.from("deals").select("*").eq("id", dealId).single();
  if (error) return console.error("deal fetch:", error.message);
  const legacy = legacyOf(d.listing_id);
  const ebay = await ebayItem(legacy, d.marketplace);
  console.log("\n================ FORENSIC TRACE deal", dealId, "================");
  console.log(
    JSON.stringify(
      {
        deal_id: d.id,
        listing_id: d.listing_id,
        legacy,
        marketplace: d.marketplace,
        card: `${d.card_name} / ${d.card_set}`,
        card_tcgplayer_id: d.card_tcgplayer_id,
        is_active: d.is_active,
        stored_image_url: d.image_url,
        stored_image_count: d.image_count,
        visual_authenticity_status: d.visual_authenticity_status,
        visual_authenticity_reason: d.visual_authenticity_reason,
        canonical_url: catalogImageUrl(d.card_tcgplayer_id),
        ebay_live: ebay,
      },
      null,
      2
    )
  );

  const all = [];
  if (ebay.image) all.push(["primary(image)", ebay.image]);
  (ebay.additionalImages ?? []).forEach((u, i) => all.push([`additional[${i}]`, u]));
  console.log("\n---- per-image classification (eBay live) ----");
  for (const [label, url] of all) {
    console.log(label, JSON.stringify(await classifyUrl(url)));
  }
  console.log("\n---- stored image_url classification ----");
  console.log(JSON.stringify(await classifyUrl(d.image_url)));
  console.log("\n---- canonical classification ----");
  console.log(JSON.stringify(await classifyUrl(catalogImageUrl(d.card_tcgplayer_id))));
}

async function audit(limit) {
  const rows = [];
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await db
      .from("deals")
      .select("id, card_name, card_set, card_tcgplayer_id, image_url, image_count, is_graded, visual_authenticity_status, listing_type, marketplace")
      .eq("is_active", true)
      .order("last_seen_at", { ascending: false })
      .range(from, Math.min(from + 999, limit - 1));
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`\n================ ACTIVE-DEAL IMAGE AUDIT: ${rows.length} rows ================`);
  const tally = { SELLER_FRONT: 0, SELLER_OTHER: 0, CARD_BACK: 0, PACKAGING: 0, BROKEN: 0, MISSING: 0, UNKNOWN: 0 };
  const canonAvail = { withCanonical: 0, noCanonical: 0 };
  const flagged = [];
  let n = 0;
  for (const r of rows) {
    n++;
    const c = await classifyUrl(r.image_url);
    tally[c.verdict] = (tally[c.verdict] ?? 0) + 1;
    const hasCanon = r.card_tcgplayer_id != null;
    if (["CARD_BACK", "PACKAGING", "BROKEN", "MISSING"].includes(c.verdict)) {
      (hasCanon ? canonAvail.withCanonical++ : canonAvail.noCanonical++);
      flagged.push({
        id: r.id,
        card: `${r.card_name} / ${r.card_set}`,
        verdict: c.verdict,
        features: c.features ?? null,
        canonical: hasCanon ? catalogImageUrl(r.card_tcgplayer_id) : null,
        image_url: r.image_url,
        va_status: r.visual_authenticity_status,
      });
    }
    if (n % 200 === 0) console.error(`  ...${n}/${rows.length}`);
  }
  console.log("\n---- verdict tally ----");
  console.log(JSON.stringify(tally, null, 2));
  console.log("\n---- canonical availability for BAD primaries ----");
  console.log(JSON.stringify(canonAvail, null, 2));
  console.log(`\n---- FLAGGED (${flagged.length}) ----`);
  console.log(JSON.stringify(flagged, null, 2));
}

const args = process.argv.slice(2);
if (args[0] === "--audit") {
  audit(Number(args[1] || 4000)).catch((e) => (console.error(e), process.exit(1)));
} else {
  trace(args[0] || "32672").catch((e) => (console.error(e), process.exit(1)));
}

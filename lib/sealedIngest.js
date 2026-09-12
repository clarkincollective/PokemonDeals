// Phase 17C.9 - the sealed scanner's decide-and-write path, extracted so
// the REAL write behaviour can be tested (app/api/refresh-sealed-deals
// calls this; nothing is duplicated).
//
// Why this exists: `sealed_deals` is unique on (source, marketplace,
// listing_id), and PostgREST upsert REPLACES the conflicting row. That
// means the last writer wins, not the first - so a listing already bound
// to the wrong product is repaired the next time the correct product's
// scan sees it. The unique key alone does not prove that, which is what
// tests/scanner/sealed-ingest-17c9.test.mjs exercises.
//
// Reassignment must not carry the previous product's comparison: when the
// row moves to a different product, the old market reference, discount and
// reference provenance are recomputed or cleared here.

import { sealedListingDecision } from "./sealedProductMatch.js";
import { writeGuardedSighting, isAvailabilityRetired } from "./listingAvailability.js";

// The OLD product's comparison, and what actually clears it.
//
// VERIFIED against the live schema (read-only, 2026-09-12): sealed_deals
// has 26 columns, and the price comparison is carried by exactly two of
// them - `market_price` and `discount_pct`. Both are rewritten
// unconditionally by buildRow from the NEW product's reference price, so
// a reassigned row can never keep the old product's savings.
//
// There are no reference_condition / reference_printing / reference_grader
// / reference_grade / reference_captured_at columns - not on sealed_deals
// and not on `deals` either. Stored reference provenance is still the
// open 17C.7 follow-up ("capture exact reference provenance when
// calculating savings"), so on sealed rows there is no provenance to
// clear yet; when those columns land they must be added here.
export const RECOMPUTED_ON_REASSIGNMENT = Object.freeze(["market_price", "discount_pct"]);

// What must change on the stored row when it is reassigned to `productId`,
// BEYOND the columns buildRow already rewrites. Empty when the row is new
// or already belongs to this product.
//
// `disqualified_reason` arrives with supabase/sealed_availability_migration
// .sql, which is NOT applied yet - writing it today fails the whole upsert
// with 42703 (undefined_column). So it is written only when the caller has
// confirmed the column exists, the same degrade-gracefully probe
// verify-deals uses for exact_verified_at.
export function reassignmentReset(existing, productId, { supportsDisqualifiedReason = false } = {}) {
  if (!existing || existing.sealed_watchlist_id === productId) return {};
  if (!supportsDisqualifiedReason) return {};
  // An IDENTITY disqualification belonged to the old assignment and is
  // cleared. An AVAILABILITY retirement is a fact about the eBay listing,
  // not about which product we priced it against - clearing it here would
  // let a mere re-attribution resurrect a sold-out listing, which is
  // exactly what the guarded write exists to prevent. Only the verifier's
  // own recovery path may lift one.
  if (isAvailabilityRetired(existing)) return {};
  return { disqualified_reason: null };
}

// One product's listings -> writes. Every dependency is injected so this
// runs under `node --test` with no network and no Supabase.
//   db            .from(table).select(...).eq(...).maybeSingle() / .upsert(row, { onConflict })
//   isTrustworthy (listing) -> boolean          (lib/dealMatching)
//   matchesName   (listing, product) -> boolean (lib/dealMatching)
//   priceListing  (listing, marketPrice) -> { totalLocal, totalUsd, discountPct }
//   buildRow      ({ productId, listing, totalPrice, totalPriceUsd, marketPrice, discountPct }) -> row
export async function ingestSealedListings({
  db,
  product,
  listings,
  marketPrice,
  discountThreshold,
  floorUsd,
  isTrustworthy,
  matchesName,
  priceListing,
  buildRow,
  supportsDisqualifiedReason = false,
}) {
  const stats = { written: 0, repaired: 0, rejected: {} };
  const reject = (reason) => {
    stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
  };

  for (const listing of listings) {
    if (!isTrustworthy(listing)) {
      reject("untrustworthy");
      continue;
    }
    if (!matchesName(listing, product)) {
      reject("name_tokens");
      continue;
    }
    // The identity decision - edition, product kind, quantity. An
    // ambiguous title is rejected here, so it never reaches the upsert and
    // can never overwrite a valid assignment.
    const decision = sealedListingDecision(listing.title, {
      name: product.name,
      set: product.set,
      productType: product.product_type ?? null,
    });
    if (!decision.ok) {
      reject(decision.reason);
      continue;
    }

    const { totalLocal, totalUsd, discountPct } = priceListing(listing, marketPrice);
    if (discountPct < discountThreshold) {
      reject("below_threshold");
      continue;
    }
    if (floorUsd != null && totalUsd < floorUsd) {
      reject("below_sanity_floor");
      continue;
    }

    // Is this listing already stored, and against which product?
    const { data: existing } = await db
      .from("sealed_deals")
      .select("id, sealed_watchlist_id, market_price, discount_pct")
      .eq("source", "ebay")
      .eq("marketplace", listing.marketplace)
      .eq("listing_id", listing.listingId)
      .maybeSingle();

    const row = {
      ...buildRow({
        productId: product.id,
        listing,
        totalPrice: totalLocal,
        totalPriceUsd: totalUsd,
        marketPrice,
        discountPct,
      }),
      ...reassignmentReset(existing, product.id, { supportsDisqualifiedReason }),
    };

    // THE WRITE. Once the guard column exists this is the same guarded
    // sighting the card scanner uses: a conditional UPDATE that refuses to
    // touch a row carrying an availability retirement, an insert for a new
    // listing, one retry for the race, and - if the row really is retired -
    // only a seen-again MARKER, never is_active/last_seen_at. Without it a
    // plain upsert would re-activate a listing the verifier just retired as
    // sold, every daily scan. Before the migration lands the column does not
    // exist, so the pre-17C.9 upsert is kept rather than a half-guard.
    if (supportsDisqualifiedReason) {
      const res = await writeGuardedSighting(db, "sealed_deals", row);
      if (res.outcome === "error") {
        reject("write_error");
        continue;
      }
      if (res.outcome === "blocked") {
        // retired as sold / not-found: the sighting is recorded only as the
        // marker that makes it eligible for ONE bounded re-check.
        reject("availability_retired");
        continue;
      }
    } else {
      const { error } = await db.from("sealed_deals").upsert(row, { onConflict: "source,marketplace,listing_id" });
      if (error) {
        reject("write_error");
        continue;
      }
    }
    stats.written += 1;
    if (existing && existing.sealed_watchlist_id !== product.id) stats.repaired += 1;
  }

  return stats;
}

// The listing-disappearance study as CSV - the machine-readable
// `distribution` its Dataset schema advertises.
//
// Static by construction: rendered from the frozen aggregate, so this
// route runs no query, calls no provider and touches no per-listing or
// seller data. It contains only the study's own summary statistics and
// its exclusion ledger, so it cannot be used to enumerate anything.
import { disappearanceCsv } from "@/lib/studies/listingDisappearanceCsv";
import { LISTING_DISAPPEARANCE } from "@/lib/studies/listingDisappearance";

export const dynamic = "force-static";

export function GET() {
  return new Response(disappearanceCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `inline; filename="how-long-pokemon-deals-last-${LISTING_DISAPPEARANCE.version}.csv"`,
      "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "x-robots-tag": "all",
    },
  });
}

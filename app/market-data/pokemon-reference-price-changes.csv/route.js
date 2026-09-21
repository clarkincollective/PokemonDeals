// The 30-day reference-price study as CSV - the machine-readable
// `distribution` its Dataset schema advertises.
//
// Static by construction: the body is rendered from the frozen STUDY
// aggregate, so this route runs no query, calls no provider and touches
// no per-listing or seller data. It cannot be used to enumerate anything,
// which is what makes it safe to publish openly.
import { studyCsv } from "@/lib/studies/referencePriceChangeCsv";
import { STUDY } from "@/lib/studies/referencePriceChange30d";

export const dynamic = "force-static";

export function GET() {
  return new Response(studyCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      // Named so it is identifiable once downloaded and separated from
      // the page, and versioned so two copies can never be confused.
      "content-disposition": `inline; filename="pokemon-reference-price-changes-${STUDY.version}.csv"`,
      // A fixed, dated snapshot that is never refreshed - cache hard.
      "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "x-robots-tag": "all",
    },
  });
}

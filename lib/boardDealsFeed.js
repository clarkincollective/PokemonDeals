// The cached read of published board deals for the pages (2026-09-27).
// Tagged so the ingest run can expire it the moment a record is published or
// unpublished (lib/boardDeals.BOARD_DEALS_TAG); otherwise 15 minutes, the
// same order as the ingest cadence. Server-only (imports the admin client).
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchPublishedBoardDeals, BOARD_DEALS_TAG } from "@/lib/boardDeals";

export { BOARD_DEALS_TAG };

async function fetchBoardDealsUncached({ limit = 24 } = {}) {
  try {
    return await fetchPublishedBoardDeals(supabaseAdmin(), { limit });
  } catch {
    return [];
  }
}

export const fetchBoardDeals = unstable_cache(fetchBoardDealsUncached, ["board-deals-v1"], {
  revalidate: 900,
  tags: [BOARD_DEALS_TAG],
});

// The cached read of published board deals for the pages (2026-09-27).
// Tagged so the ingest run can expire it the moment a record is published or
// unpublished (lib/boardDeals.BOARD_DEALS_TAG); otherwise 15 minutes, the
// same order as the ingest cadence. Server-only (imports the admin client).
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchPublishedBoardDeals, filterBoardDeals, BOARD_DEALS_TAG } from "@/lib/boardDeals";

export { BOARD_DEALS_TAG, filterBoardDeals };

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

// The WHOLE publishable board store, newest first, for /more-deals and the
// homepage count (owner, 27 Sep: "count them in our listings and show the
// savings"). One cached read; filtering and paging happen in memory (a few
// thousand small rows).
async function fetchAllBoardDealsUncached() {
  try {
    return await fetchPublishedBoardDeals(supabaseAdmin(), { limit: 20000 });
  } catch {
    return [];
  }
}
export const fetchAllBoardDeals = unstable_cache(fetchAllBoardDealsUncached, ["board-deals-all-v1"], {
  revalidate: 900,
  tags: [BOARD_DEALS_TAG],
});

export const BOARD_PAGE_SIZE = 48;

// Filters (lib/boardDeals.filterBoardDeals): market (EBAY_*), kind
// (graded | sealed | raw), format (bin | auction). Page numbers clamp.
export async function fetchBoardDealsPage({ page = 1, pageSize = BOARD_PAGE_SIZE, market = null, kind = null, format = null } = {}) {
  const all = await fetchAllBoardDeals();
  const filtered = filterBoardDeals(all, { market, kind, format });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  return { rows: filtered.slice((current - 1) * pageSize, current * pageSize), total: filtered.length, totalAll: all.length, page: current, pages, pageSize };
}

export async function fetchBoardDealsCount() {
  return (await fetchAllBoardDeals()).length;
}

// The cached reads of published board deals for the pages (2026-09-27).
// Tagged so the ingest run can expire them the moment a record is published
// or unpublished (lib/boardDeals.BOARD_DEALS_TAG); otherwise 15 minutes, the
// same order as the ingest cadence. Server-only (imports the admin client).
//
// VERCEL-COST-2 (27 Sep, later the same day): the first version of the
// "all board deals" read cached the WHOLE store as one entry - 5,274 render
// shapes, 4.5 MB - and Next's data cache refuses items over 2 MB, so it was
// silently never cached: every homepage, /deals and /more-deals render
// re-read the entire store from Supabase (6 paginated requests) and rebuilt
// it. Now: a compact INDEX (id + the three filter fields, ~300 KB) is the
// cached whole-store read, the count is its length, and a /more-deals page
// loads only its 48 records by key. Each page result is cached too.
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchPublishedBoardDeals, filterBoardDeals, publishableBoardDeals, toRenderShape, BOARD_DEALS_TAG, BOARD_DEAL_KIND_PREFIX } from "@/lib/boardDeals";

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

// The publishable store as a compact, newest-first index: { id, marketplace,
// variant, format } per row - exactly the fields filterBoardDeals reads.
async function fetchBoardIndexUncached() {
  try {
    const rows = await fetchPublishedBoardDeals(supabaseAdmin(), { limit: 20000 });
    return rows.map((d) => ({ id: d.id, marketplace: d.marketplace, variant: d.variant ?? null, format: d.format ?? null }));
  } catch {
    return [];
  }
}
export const fetchBoardIndex = unstable_cache(fetchBoardIndexUncached, ["board-deals-index-v1"], {
  revalidate: 900,
  tags: [BOARD_DEALS_TAG],
});

export const BOARD_PAGE_SIZE = 48;

// One page's records, by key, in index order. Rows that stopped being
// publishable since the index was built simply drop out.
async function fetchBoardRowsByIds(ids) {
  if (!ids.length) return [];
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from("catalog_snapshot").select("kind, data").in("kind", ids.map((id) => `${BOARD_DEAL_KIND_PREFIX}${id}`));
    if (error || !data) return [];
    const byId = new Map();
    for (const r of publishableBoardDeals(data.map((r) => r.data), { now: Date.now() })) byId.set(`${r.marketplace}:${r.itemId}`, toRenderShape(r));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}

// Filters (lib/boardDeals.filterBoardDeals): market (EBAY_*), kind
// (graded | sealed | raw), format (bin | auction). Page numbers clamp.
async function fetchBoardDealsPageUncached({ page = 1, pageSize = BOARD_PAGE_SIZE, market = null, kind = null, format = null } = {}) {
  const index = await fetchBoardIndex();
  const filtered = filterBoardDeals(index, { market, kind, format });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const ids = filtered.slice((current - 1) * pageSize, current * pageSize).map((r) => r.id);
  const rows = await fetchBoardRowsByIds(ids);
  return { rows, total: filtered.length, totalAll: index.length, page: current, pages, pageSize };
}
export const fetchBoardDealsPage = unstable_cache(fetchBoardDealsPageUncached, ["board-deals-page-v1"], {
  revalidate: 900,
  tags: [BOARD_DEALS_TAG],
});

export async function fetchBoardDealsCount() {
  return (await fetchBoardIndex()).length;
}

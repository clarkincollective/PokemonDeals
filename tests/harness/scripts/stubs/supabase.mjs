// @supabase/supabase-js stub: an in-memory database seeded for the manual
// script harness. catalog_snapshot holds the budget ledger rows the
// clearance reads; deals holds one synthetic auction / listing row.
import { createMemoryDb } from "../../ingestion/memoryDb.mjs";

export function createClient() {
  const { reset, prevReset } = globalThis.__scriptHarness;
  const seed = process.env.SCRIPT_HARNESS_LEDGER ?? "none";
  const ledger =
    seed === "enforce"
      ? [{ kind: `browse_budget:${prevReset}`, data: { state: "pending" }, updated_at: prevReset }]
      : seed === "observe"
        ? [{ kind: `browse_budget_observe:${reset}`, data: {}, updated_at: prevReset }]
        : [];
  const deal = {
    id: 32672, listing_id: "v1|123456789012|0", marketplace: "EBAY_US", listing_type: "AUCTION", is_active: true,
    title: "harness", card_name: "harness", card_set: "harness", image_url: null, image_urls: [], price: 10, shipping: 0,
    total_price: 10, total_price_usd: 10, currency: "USD", market_price: 20, discount_pct: 0.5, bid_count: 0, auction_end_at: null,
  };
  return createMemoryDb({ catalog_snapshot: ledger, deals: [deal] });
}
export default { createClient };

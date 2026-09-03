import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES } from "@/lib/ebay";
import { searchCards, getRawPrice, getRawPriceHistory, pickMarketPrice } from "@/lib/pokemonPriceTracker";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { isDisplayableDeal } from "@/lib/dealQuality";
import { cardDisplayName } from "@/lib/cardName";
import { catalogCardSlug, catalogCardResolvable } from "@/lib/cardSlug";
import { rerankCatalogResults } from "@/lib/searchRanking";
import { parseSearchIntent } from "@/lib/searchIntent";
import { resolveSearchIntent, createSupabaseLookup } from "@/lib/searchResolve";

// Public, read-only, on-demand - not on the cron schedule, so no
// CRON_SECRET check. Deals come straight from our own database (never a
// fresh live eBay search per query); catalogue identity is resolved
// LOCALLY against card_catalog first (Phase 13B.2), and only queries that
// can't be resolved locally fall through to PokemonPriceTracker.
export const dynamic = "force-dynamic";

const CATALOG_PAGE_SIZE = 20;
const IS_DEV = process.env.NODE_ENV !== "production";

export async function GET(request) {
  const url = new URL(request.url);
  const tcgplayerId = url.searchParams.get("tcgplayerId");

  if (tcgplayerId) return cardDetail(url, tcgplayerId);
  return cardSearch(url);
}

// sort: "discount" (default, best deal first), "price_asc", "price_desc".
function sortDeals(query, sort) {
  if (sort === "price_asc") return query.order("total_price", { ascending: true });
  if (sort === "price_desc") return query.order("total_price", { ascending: false });
  return query.order("discount_pct", { ascending: false });
}

// ----------------------------------------------------------- 13B.2 search

const CONDITION_WORD = { NM: "near mint", LP: "lightly played", MP: "moderately played", HP: "heavily played", DMG: "damaged" };

function listingTypeToDb(lt) {
  if (lt === "BIN") return "FIXED_PRICE";
  if (lt === "AUCTION") return "AUCTION";
  return null;
}

// Which modifiers the parser actually recognised in this query.
function collectRecognizedModifiers(intent) {
  const out = [];
  if (intent.format !== "any") out.push("format");
  if (intent.grader) out.push("grader");
  if (intent.grade != null) out.push("grade");
  if (intent.condition) out.push("condition");
  if (intent.listing_type !== "any") out.push("listing_type");
  if (intent.price_max != null) out.push("price_max");
  if (intent.price_min != null) out.push("price_min");
  if (intent.minimum_discount != null) out.push("minimum_discount");
  if (intent.language) out.push("language");
  if (intent.era) out.push("era");
  return out;
}

// card_catalog tcgplayer_ids the resolved subject scopes to (for the deals
// filter). `resolvedIds` (from the resolver's candidate list) is reused
// when present so the species/name catalogue query isn't run twice.
async function subjectTcgIds(db, intent, resolvedIds) {
  const s = intent.subject;
  if (s.tcgplayer_id) return [s.tcgplayer_id];
  if (Array.isArray(resolvedIds) && resolvedIds.length) return resolvedIds.map(String);
  const lang = intent.language || "english";
  if (s.species) {
    const { data } = await db
      .from("card_catalog")
      .select("tcgplayer_id")
      .eq("language", lang)
      .eq("species", s.species)
      .limit(2000);
    return (data ?? []).map((r) => String(r.tcgplayer_id));
  }
  if (s.card_name) {
    const { data } = await db
      .from("card_catalog")
      .select("tcgplayer_id")
      .eq("language", lang)
      .ilike("name", `%${s.card_name}%`)
      .limit(500);
    return (data ?? []).map((r) => String(r.tcgplayer_id));
  }
  return [];
}

// Deals for the resolved subject with the PARSED MODIFIERS applied. Every
// filter here is a real, indexed deals column - grading/grade/listing/
// price are proven relational filters (the ?tcgplayerId= branch below has
// applied them for a single card since Phase 6). Returns which filters
// were actually applied so the response can be honest about it.
async function findScopedDeals(db, intent, { countryParam, sortParam, resolvedIds }) {
  const ids = await subjectTcgIds(db, intent, resolvedIds);
  let q = db
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id, language)")
    .eq("is_active", true);
  let scoped = false;

  if (ids.length) {
    q = q.in("card_tcgplayer_id", ids);
    scoped = true;
  } else {
    const name = intent.subject.card_name || intent.subject.species;
    if (name) {
      const { data: wl } = await db.from("watchlist").select("id").ilike("name", `%${name}%`).limit(500);
      if (wl && wl.length) {
        q = q.in(
          "watchlist_id",
          wl.map((r) => r.id)
        );
        scoped = true;
      }
    }
  }
  if (!scoped) return { deals: [], scoped: false, applied: [] };

  const applied = [];
  const country = countryParam && MARKETPLACES[countryParam] ? countryParam : intent.country;
  if (country && MARKETPLACES[country]) {
    q = q.eq("marketplace", country);
    applied.push("country");
  }
  if (intent.language === "japanese") {
    q = q.eq("card_language", "japanese");
    applied.push("language");
  } else if (intent.language === "english") {
    q = q.eq("card_language", "english");
  }
  if (intent.format === "graded") {
    q = q.eq("is_graded", true);
    applied.push("format");
  } else if (intent.format === "raw") {
    q = q.eq("is_graded", false);
    applied.push("format");
  }
  if (intent.grader) {
    q = q.eq("grader", intent.grader);
    applied.push("grader");
  }
  if (intent.grade != null) {
    q = q.eq("grade", String(intent.grade));
    applied.push("grade");
  }
  if (intent.condition && intent.format !== "graded") {
    q = q.ilike("condition", `%${CONDITION_WORD[intent.condition] ?? intent.condition}%`);
    applied.push("condition");
  }
  const ltDb = listingTypeToDb(intent.listing_type);
  if (ltDb) {
    q = q.eq("listing_type", ltDb);
    applied.push("listing_type");
  }
  if (intent.price_max != null) {
    q = q.lte("total_price_usd", intent.price_max);
    applied.push("price_max");
  }
  if (intent.price_min != null) {
    q = q.gte("total_price_usd", intent.price_min);
    applied.push("price_min");
  }
  if (intent.minimum_discount != null) {
    q = q.gte("discount_pct", intent.minimum_discount);
    applied.push("minimum_discount");
  }

  const endingSoon = intent.sort === "ending_soon" || sortParam === "ending";
  if (endingSoon) {
    q = q.order("auction_end_at", { ascending: true, nullsFirst: false });
  } else {
    q = sortDeals(q, sortParam || intent.sort || "discount");
  }

  const { data } = await q.limit(120);
  return { deals: (data ?? []).filter(isDisplayableDeal).slice(0, 60), scoped: true, applied };
}

// Catalogue surface from the LOCAL resolver candidates - no provider call.
function buildLocalCatalog(candidates, exact, page) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const slice = rows.slice(start, start + CATALOG_PAGE_SIZE);
  return {
    page,
    pageSize: CATALOG_PAGE_SIZE,
    total: rows.length,
    hasMore: start + CATALOG_PAGE_SIZE < rows.length,
    source: "local",
    results: slice.map((c) => ({
      tcgplayerId: c.tcgplayer_id,
      name: c.name,
      displayName: cardDisplayName({ name: c.name }),
      set: c.set,
      cardNumber: c.card_number ?? null,
      rarity: c.rarity ?? null,
      imageUrl: upgradeCatalogImage(c.image_url ?? null),
      marketPrice: c.market_price ?? null,
      cardHref: c.card_slug ? `/cards/${c.card_slug}` : `/cards/${catalogCardSlug(c.name, c.set)}`,
      deal: null,
      isExact: exact != null && String(c.tcgplayer_id) === String(exact.tcgplayer_id),
    })),
  };
}

// --- provider-fallback catalogue (the pre-13B.2 path, unchanged shape) ---

async function findDealsForCatalogPage(db, tcgPlayerIds, { country }) {
  const dealByTcgId = new Map();
  if (tcgPlayerIds.length === 0) return dealByTcgId;
  const { data: watchlistRows } = await db
    .from("watchlist")
    .select("id, justtcg_tcgplayer_id")
    .in("justtcg_tcgplayer_id", tcgPlayerIds);
  if (!watchlistRows || watchlistRows.length === 0) return dealByTcgId;
  const tcgIdByWatchlistId = new Map(watchlistRows.map((r) => [r.id, r.justtcg_tcgplayer_id]));
  let dealsQuery = db
    .from("deals")
    .select("*")
    .in(
      "watchlist_id",
      watchlistRows.map((r) => r.id)
    )
    .eq("is_active", true);
  if (country && MARKETPLACES[country]) dealsQuery = dealsQuery.eq("marketplace", country);
  const { data: dealRows } = await dealsQuery.order("discount_pct", { ascending: false });
  for (const deal of (dealRows ?? []).filter(isDisplayableDeal)) {
    const tcgId = tcgIdByWatchlistId.get(deal.watchlist_id);
    if (tcgId && !dealByTcgId.has(tcgId)) dealByTcgId.set(tcgId, deal);
  }
  return dealByTcgId;
}

async function resolveCatalogHrefs(db, tcgPlayerIds) {
  const out = new Map();
  if (tcgPlayerIds.length === 0) return out;
  const { data } = await db
    .from("card_catalog")
    .select("tcgplayer_id, name, set, card_number, rarity, image_url")
    .eq("language", "english")
    .in("tcgplayer_id", tcgPlayerIds);
  for (const r of data ?? []) {
    if (!catalogCardResolvable(r)) continue;
    out.set(String(r.tcgplayer_id), {
      href: `/cards/${catalogCardSlug(r.name, r.set)}`,
      name: r.name,
      set: r.set,
      cardNumber: r.card_number ?? null,
      rarity: r.rarity ?? null,
    });
  }
  return out;
}

async function providerCatalog(db, q, page, offset, country) {
  const catalogPage = await searchCards(q, { limit: CATALOG_PAGE_SIZE, offset });
  const tcgPlayerIds = catalogPage.results.map((c) => String(c.tcgPlayerId)).filter(Boolean);
  const [dealByTcgId, hrefByTcgId] = await Promise.all([
    findDealsForCatalogPage(db, tcgPlayerIds, { country }),
    resolveCatalogHrefs(db, tcgPlayerIds),
  ]);
  const enriched = catalogPage.results.map((c) => {
    const id = String(c.tcgPlayerId);
    const deal = dealByTcgId.get(id);
    const own = hrefByTcgId.get(id) ?? null;
    const name = own?.name ?? c.name;
    const set = own?.set ?? c.setName;
    return {
      tcgplayerId: c.tcgPlayerId,
      name,
      displayName: cardDisplayName({ name }),
      set,
      cardNumber: own?.cardNumber ?? c.number ?? c.cardNumber ?? c.card_number ?? null,
      rarity: own?.rarity ?? c.rarity ?? null,
      imageUrl: upgradeCatalogImage(c.imageCdnUrl200 ?? c.imageUrl ?? null),
      marketPrice: pickMarketPrice(c.prices),
      cardHref: own?.href ?? null,
      deal: deal
        ? {
            id: deal.id,
            totalPrice: deal.total_price,
            totalPriceUsd: deal.total_price_usd ?? null,
            marketplace: deal.marketplace,
            discountPct: deal.discount_pct,
            listingType: deal.listing_type,
            affiliateUrl: deal.affiliate_url,
          }
        : null,
    };
  });
  return {
    page,
    pageSize: CATALOG_PAGE_SIZE,
    total: catalogPage.total,
    hasMore: catalogPage.hasMore,
    source: "provider",
    results: rerankCatalogResults(enriched, q),
  };
}

// --- the search endpoint ---

async function cardSearch(url) {
  const tStart = performance.now();
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ error: "Search query too short" }, { status: 400 });

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  const country = url.searchParams.get("country");
  const sort = url.searchParams.get("sort");
  // Coarse per-segment latency, dev-only. In production the same signal is
  // available via PostHog (latency_band x search_resolution_mode).
  const debug = IS_DEV;
  const db = supabaseAdmin();

  const timing = {};
  try {
    // 1. parse (pure, deterministic)
    let m = performance.now();
    const intent = parseSearchIntent(q);
    timing.parse_ms = Math.round(performance.now() - m);

    // 2. local identity resolution (card_catalog first)
    m = performance.now();
    const { resolution, exact, candidates } = await resolveSearchIntent(intent, {
      lookup: createSupabaseLookup(db),
    });
    timing.local_resolution_ms = Math.round(performance.now() - m);

    // 3a. deals for the subject, with parsed modifiers applied. Reuse the
    // resolver's candidate ids for species/name so the catalogue isn't
    // queried twice.
    m = performance.now();
    // full subject scope: exact -> [id]; species/local_broad -> resolver's
    // complete id list; else the route re-queries in subjectTcgIds.
    const resolvedIds = Array.isArray(resolution.subject_ids) && resolution.subject_ids.length
      ? resolution.subject_ids
      : null;
    const scopedDeals = await findScopedDeals(db, intent, {
      countryParam: country,
      sortParam: sort,
      resolvedIds,
    });
    timing.supabase_deals_ms = Math.round(performance.now() - m);

    // 3b. catalogue: local when resolved, provider only on fallback
    let providerCalled = false;
    let catalog;
    timing.provider_ms = 0;
    if (resolution.mode === "provider_fallback") {
      m = performance.now();
      catalog = await providerCatalog(db, q, page, offset, country);
      timing.provider_ms = Math.round(performance.now() - m);
      providerCalled = true;
    } else {
      catalog = buildLocalCatalog(candidates, exact, page);
    }

    // 4. truth: recognised vs applied
    const recognized = collectRecognizedModifiers(intent);
    const notApplied = [];
    for (const mod of ["format", "grader", "grade", "condition", "listing_type"]) {
      if (recognized.includes(mod)) {
        notApplied.push({
          modifier: mod,
          surface: "catalogue",
          reason: "listing attribute - applied to live deals, not to the card reference list",
        });
      }
    }
    if (intent.language === "japanese") {
      notApplied.push({
        modifier: "language",
        surface: "catalogue",
        reason: "Japanese catalogue is not synced yet - see /japanese-cards",
      });
    }
    if (!scopedDeals.scoped && recognized.length) {
      notApplied.push({
        modifier: "all",
        surface: "deals",
        reason: "query could not be scoped to a card/species, so no deal filter was applied",
      });
    }

    timing.total_server_ms = Math.round(performance.now() - tStart);

    const body = {
      // backward compatible
      deals: scopedDeals.deals,
      catalog,
      // Phase 13B.2 additions
      interpreted: {
        subject_kind: intent.subject.kind,
        collector_number: intent.subject.collector_number,
        set: intent.subject.set,
        species: intent.subject.species,
        card_name: intent.subject.card_name,
        format: intent.format,
        grader: intent.grader,
        grade: intent.grade,
        condition: intent.condition,
        language: intent.language,
        era: intent.era,
        listing_type: intent.listing_type,
        price_min: intent.price_min,
        price_max: intent.price_max,
        sort: intent.sort,
      },
      resolution: {
        // exact_card | species | catalogue | local_broad | provider_fallback | subject_collector_mismatch
        mode: resolution.mode,
        rendered_mode: resolution.rendered_mode ?? resolution.mode,
        confidence: resolution.confidence,
        is_exact: intent.is_exact,
        resolved_via: resolution.resolved_via,
        provider_called: providerCalled,
        deals_scoped: scopedDeals.scoped,
        deals_filters_applied: scopedDeals.applied,
        deals_match_count: scopedDeals.deals.length,
        catalogue_is_reference_only: intent.result_mode === "deals",
        recognized_modifiers: recognized,
        recognized_not_applied: notApplied,
        // 13B.2.1 - the query named a subject AND a collector number, but
        // no card of that subject carries that number. The number's real
        // owner is offered as a suggestion, never as the resolved result.
        subject_collector_mismatch: resolution.subject_collector_mismatch ?? null,
        ambiguities: intent.ambiguities,
      },
      exact,
    };
    if (debug) body._timing = timing;
    return Response.json(body);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ------------------------------------------------------- card detail (unchanged)

async function cardDetail(url, tcgplayerId) {
  const condition = url.searchParams.get("condition") || "Near Mint";
  const country = url.searchParams.get("country");
  const graded = url.searchParams.get("graded");
  const listingType = url.searchParams.get("listingType");
  const minDiscount = url.searchParams.get("minDiscount");
  const maxPrice = url.searchParams.get("maxPrice");

  let marketPrice = null;
  let history = [];
  try {
    const [raw, hist] = await Promise.all([
      getRawPrice(tcgplayerId, condition),
      getRawPriceHistory(tcgplayerId, condition),
    ]);
    marketPrice = raw?.price ?? null;
    history = hist;
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  const db = supabaseAdmin();
  const { data: watchlistRows } = await db
    .from("watchlist")
    .select("id, name, set")
    .eq("justtcg_tcgplayer_id", String(tcgplayerId));

  let deals = [];
  if (watchlistRows && watchlistRows.length > 0) {
    let dealsQuery = db
      .from("deals")
      .select("*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id, language)")
      .in(
        "watchlist_id",
        watchlistRows.map((r) => r.id)
      )
      .eq("is_active", true);

    if (country && MARKETPLACES[country]) dealsQuery = dealsQuery.eq("marketplace", country);
    if (graded === "true") dealsQuery = dealsQuery.eq("is_graded", true);
    if (graded === "false") dealsQuery = dealsQuery.eq("is_graded", false);
    if (listingType === "FIXED_PRICE" || listingType === "AUCTION")
      dealsQuery = dealsQuery.eq("listing_type", listingType);
    if (minDiscount) dealsQuery = dealsQuery.gte("discount_pct", Number(minDiscount));
    if (maxPrice) dealsQuery = dealsQuery.lte("total_price", Number(maxPrice));

    const { data } = await dealsQuery.order("discount_pct", { ascending: false });
    deals = (data ?? []).filter(isDisplayableDeal);
  }

  return Response.json({
    marketPrice,
    history,
    tracked: (watchlistRows?.length ?? 0) > 0,
    deals,
  });
}

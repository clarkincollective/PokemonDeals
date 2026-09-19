import {
  fetchAllDealsPage,
  fetchDealsPage,
  fetchDealsPool,
  fetchHomepageLanes,
  fetchSpeciesDealsPage,
  fetchSetDealsPage,
  fetchCardDealsPage,
  fetchSets,
  resolveSetSlug,
  resolveSpeciesSlug,
  resolveCardSlug,
} from "@/lib/deals";
import { DEAL_CATEGORIES, categoryInventoryParams, isModernSet } from "@/lib/dealCategories";
import { marketplaceFilterValue } from "@/lib/marketplaceScope";
import { rotationBucket, rotateForBucket, selectDiverseLane, buildHomepageLanes } from "@/lib/homepageVariety";

export const dynamic = "force-dynamic";

// Powers client-side pagination + filtering on /sets/[slug] and
// /pokemon/[slug] so those pages can stay statically cacheable (their
// server render reads no searchParams). Page 1 with no filters is
// rendered server-side; anything else comes from here.
//   /api/deals-page?kind=set&slug=base-set&page=2&country=EBAY_GB&sort=price_asc
export async function GET(request) {
  const u = new URL(request.url);
  const kind = u.searchParams.get("kind");
  const slug = u.searchParams.get("slug");
  const num = (k) => {
    const n = Number(u.searchParams.get(k));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const filters = {
    // "all" = explicit All marketplaces -> no marketplace filter
    country: marketplaceFilterValue(u.searchParams.get("country")),
    cardType: u.searchParams.get("type") || null,
    listingType: u.searchParams.get("listing") || null,
    // 2026-09-19 - auction ending window (validated in lib/dealFilters)
    ending: u.searchParams.get("ending") || null,
    maxPrice: num("maxPrice"),
    minPrice: num("minPrice"),
    sort: u.searchParams.get("sort") || "newest",
    page: Math.max(1, Number(u.searchParams.get("page")) || 1),
    pageSize: 20,
  };
  // 13B.3 - graded scoping is a Pokemon-page (kind=species) concern only.
  // Raw values; planDealFilters (inside fetchSpeciesDealsPage) validates
  // and resolves any contradiction.
  const gradedFilters = {
    grader: u.searchParams.get("grader") || null,
    grade: u.searchParams.get("grade") || null,
  };

  try {
    // Homepage feed - mirrors app/page.js's own (pre-refactor) server
    // logic exactly, just reachable from the client so the host page
    // itself never reads searchParams and stays statically cacheable.
    // Page 1 with no filters (country included - deal-first review:
    // "a country filter alone is allowed to keep the curated feed") is
    // the curated flagship + diverse-grid promo view (lib/homepageVariety);
    // any other combination is the plain rotated/diversified pool preview
    // (no filters/page>1 -> stable fetchDealsPage list).
    if (kind === "home") {
      const previewSize = num("previewSize") ?? 9;
      const rawSort = u.searchParams.get("sort");
      const anyFilter = Boolean(filters.country || filters.cardType || filters.listingType || rawSort || filters.maxPrice || filters.minPrice);
      const showPromo = filters.page === 1 && !filters.cardType && !filters.listingType && !rawSort && !filters.maxPrice && !filters.minPrice;
      const useStableList = filters.page > 1 || Boolean(rawSort);
      const bucket = rotationBucket();

      let flagshipDeals = [];
      let deals = [];
      let totalPages = 1;
      let error = null;

      if (useStableList) {
        const r = await fetchDealsPage({
          table: "deals",
          language: "english",
          country: filters.country,
          cardType: filters.cardType,
          listingType: filters.listingType,
          maxPrice: filters.maxPrice,
          minPrice: filters.minPrice,
          sort: rawSort ?? "newest",
          page: filters.page,
        });
        deals = r?.deals ?? [];
        totalPages = r?.totalPages ?? 1;
        error = r?.error ?? null;
      } else if (showPromo) {
        const homeLanesResult = await fetchHomepageLanes({ country: filters.country });
        const lanes = buildHomepageLanes(homeLanesResult?.pools ?? {}, { bucket, lanes: ["flagship", "grid"] });
        flagshipDeals = lanes.flagship;
        deals = lanes.grid;
      } else {
        const { data: filteredPool, error: poolError } = await fetchDealsPool({
          language: "english",
          country: filters.country,
          cardType: filters.cardType,
          listingType: filters.listingType,
          maxPrice: filters.maxPrice,
          minPrice: filters.minPrice,
        });
        error = poolError;
        const ordered = rotateForBucket(filteredPool ?? [], { bucket, laneId: "grid_filtered", mode: "bucketPermute" });
        deals = selectDiverseLane(ordered, { limit: previewSize, speciesCap: 3 });
      }

      return Response.json({ flagshipDeals, deals, totalPages, promo: showPromo, anyFilter, error });
    }
    // /deals "All deals": every eligible listing, exact counts (see
    // lib/allDealsInventory). All marketplaces unless ?country is valid.
    if (kind === "all") {
      const r = await fetchAllDealsPage({
        country: filters.country,
        cardType: filters.cardType,
        grader: gradedFilters.grader,
        grade: gradedFilters.grade,
        listingType: filters.listingType,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        q: u.searchParams.get("q"),
        sort: u.searchParams.get("sort") || "newest",
        page: filters.page,
      });
      return Response.json(r);
    }
    if (kind === "set") {
      const resolved = await resolveSetSlug(slug);
      if (!resolved) return Response.json({ deals: [], totalPages: 1, error: "not found" }, { status: 404 });
      // 13B.4.3 - shared filter contract + canonical set card-identity scope
      // (pulls in feed-discovered deals); grader/grade like species/card.
      const r = await fetchSetDealsPage({
        setName: resolved.set,
        language: "english",
        ...filters,
        ...gradedFilters,
      });
      return Response.json(r);
    }
    if (kind === "species") {
      const resolved = await resolveSpeciesSlug(slug);
      if (!resolved) return Response.json({ deals: [], totalPages: 1, error: "not found" }, { status: 404 });
      const r = await fetchSpeciesDealsPage({
        speciesName: resolved.name,
        language: "english",
        ...filters,
        ...gradedFilters,
      });
      return Response.json(r);
    }
    // 13B.4.2 - the FILTERED live-listing view for one exact /cards/[slug].
    // Scoped to the canonical card identity; provider-free; same
    // graded/grader/grade/price/listing contract as species.
    if (kind === "card") {
      const resolved = await resolveCardSlug(slug);
      if (!resolved) return Response.json({ deals: [], error: "not found" }, { status: 404 });
      const r = await fetchCardDealsPage({
        watchlistId: resolved.id,
        tcgplayerId: resolved.tcgplayerId,
        country: filters.country,
        cardType: filters.cardType,
        listingType: filters.listingType,
        maxPrice: filters.maxPrice,
        minPrice: filters.minPrice,
        sort: u.searchParams.get("sort") || "price_asc",
        ...gradedFilters,
      });
      return Response.json(r);
    }
    if (kind === "category") {
      const cat = DEAL_CATEGORIES[slug];
      if (!cat || cat.redirect) {
        return Response.json({ deals: [], totalPages: 1, error: "not found" }, { status: 404 });
      }
      // graded-inventory-r1 - an inventory category (/deals/graded) counts and
      // paginates the All deals inventory with its own preset and options.
      if (cat.inventory) {
        const r = await fetchAllDealsPage(
          categoryInventoryParams(cat, {
            country: filters.country,
            grader: gradedFilters.grader,
            grade: gradedFilters.grade,
            listingType: filters.listingType,
            ending: filters.ending,
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            q: u.searchParams.get("q"),
            sort: u.searchParams.get("sort") ?? cat.defaultSort ?? "newest",
            page: filters.page,
          })
        );
        return Response.json(r);
      }
      // Preset filter for the category. Only overlay the user filters
      // that are actually set (an unset maxPrice arrives as null and
      // would otherwise wipe the category's own preset).
      const preset = { ...cat.filter };
      if (preset.modernEra) {
        delete preset.modernEra;
        const { sets: allSets } = await fetchSets({ language: "english" });
        preset.sets = (allSets ?? []).map((s) => s.set).filter(isModernSet);
      }
      const userOverlay = {};
      // 2026-09-19: `ending` rides along - /deals/auctions is a preset
      // category, and its ending-window pills reach the loader only here.
      for (const k of ["country", "cardType", "listingType", "ending", "maxPrice", "minPrice"]) {
        if (filters[k] != null) userOverlay[k] = filters[k];
      }
      // Grader/grade previously never reached fetchDealsPage for category
      // pages at all (only species/set/card kinds received gradedFilters),
      // so /deals/graded had no way to narrow by grader or grade even
      // though the UI contract (lib/dealFilters) already supported it
      // everywhere else. A category whose own preset does not fix
      // cardType=graded (e.g. /deals/vintage) is unaffected unless the
      // visitor explicitly asks for a grader/grade, in which case
      // planDealFilters correctly implies graded there too - the same
      // "never silently drop a modifier" contract as species/set pages.
      if (gradedFilters.grader != null) userOverlay.grader = gradedFilters.grader;
      if (gradedFilters.grade != null) userOverlay.grade = gradedFilters.grade;
      const q = u.searchParams.get("q");
      if (q != null) userOverlay.q = q;
      // A tighter user maxPrice inside a price-band category wins; a
      // looser one is clamped to the category ceiling.
      if (userOverlay.maxPrice != null && preset.maxPrice != null) {
        userOverlay.maxPrice = Math.min(userOverlay.maxPrice, preset.maxPrice);
      }
      // An explicit sort - "newest" included - is always honoured; only
      // an ABSENT sort param falls back to the category's own default.
      // (Previously an explicit `sort=newest` was silently overridden by
      // the category default, e.g. forcing /deals/auctions back to
      // "ending" even when the visitor asked for Newest.)
      const userSort = u.searchParams.get("sort");
      const r = await fetchDealsPage({
        table: "deals",
        language: "english",
        ...preset,
        ...userOverlay,
        sort: userSort ?? cat.defaultSort ?? "newest",
        page: filters.page,
        pageSize: 24,
      });
      return Response.json(r);
    }
    return Response.json({ deals: [], totalPages: 1, error: "bad kind" }, { status: 400 });
  } catch (err) {
    return Response.json({ deals: [], totalPages: 1, error: err.message }, { status: 500 });
  }
}

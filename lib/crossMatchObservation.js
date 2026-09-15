// crossmatch-shadow-r1 - COUNT-ONLY observation of allocated per-card search
// responses. A tier=allocated scan searches "<card name> <set>" and keeps only
// listings for that one card; everything else in the (up to 200) results is
// discarded. This observer asks, without changing anything: how many of those
// results identify ANOTHER watched card, and are they already stored?
//
// It never makes a provider request, never writes a deal and never alters the
// scan. The route calls observe() synchronously after a card's normal
// processing has finished, over the listings array that scan already
// received, and finalize() after the worker loop. Every step is bounded and
// wrapped: an error or an exhausted limit only disables or truncates the
// observation, and the record is then labelled partial.
//
// Identity reuses the sweep's watched-card token index (candidate rows per
// listing, never every row) and the sweep's own checks in the sweep's order:
//   listing gates  qualifiesAsTradingCard, admitsProxyOrCounterfeit(null),
//                  isTrustworthyListing
//   per candidate  admitsProxyOrCounterfeit({name,set}), listingMatchesCard
//   graded         gradedLookupWorthwhile (grading itself is NOT looked up)
//   raw            titleClaimsSlabGrade refusal, languageCompatible
// An identity is a catalogue printing: justtcg_tcgplayer_id + language (the
// sweep's pricing key). Nothing here prices anything.
//
// "Stored" means a row in `deals` (any source) for that exact listing id.
// `deals` only holds listings that were once written as deal candidates, so
// "not in deals" is NOT evidence that eBay item is new to us or to eBay.

const {
  coreTokens,
  qualifiesAsTradingCard,
  admitsProxyOrCounterfeit,
  isTrustworthyListing,
  listingMatchesCard,
  titleClaimsSlabGrade,
  gradedLookupWorthwhile,
} = require("./dealMatching");
const { classifyListingLanguage, languageCompatible } = require("./dealQuality");
const { isAvailabilityRetired } = require("./listingAvailability");

const OBSERVATION_KIND_PREFIX = "crossmatch_observation:";
const DEFAULT_LIMITS = Object.freeze({
  maxListings: 40000, // distinct item/marketplace keys examined per invocation
  maxCandidateRowsPerListing: 2000, // above this a listing is left unclassified, never truncated
  maxMatchChecks: 1200000, // full identity checks per invocation (measured ~20 per examined listing)
  maxObserveMsPerSearch: 75, // one observe() call; bounds event-loop time taken from in-flight scans
  maxObserveMs: 10000, // cumulative observe() time per invocation
  stopAfterJobMs: 540000, // no further observation once the job has run 9 min (maxDuration 800 s)
  maxPendingSearches: 40, // searches held while the index is still being built
  maxStoredLookupKeys: 12000, // candidate listing ids classified against deals (unique first)
  // crossmatch-price-pilot-r1: retained raw single-identity listings (pilot only)
  retainRawCandidates: false,
  maxRetainedListings: 600,
  storedLookupChunk: 300, // ids per bulk read (at most 40 reads)
  maxFinalizeMs: 20000,
  retentionDays: 21,
});

const identityOf = (row) => (row?.justtcg_tcgplayer_id == null ? null : `${row.justtcg_tcgplayer_id}|${row.language ?? ""}`);

function createCrossMatchObserver({ marketplace, jobStartedAt = Date.now(), limits = {}, now = () => Date.now() } = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const state = {
    enabled: true,
    error: null,
    candidateRowsFor: null, // set by setIndex once the index is built
    pending: [], // [listings, scannedRow] received before the index was ready
    truncatedBy: new Set(),
    observeMs: 0,
    maxSearchMs: 0,
    searchesReceived: 0,
    searchesObserved: 0,
    resultsSeen: 0,
    duplicateResults: 0,
    listingsExamined: 0,
    rejectedBeforeIdentity: 0,
    matchChecks: 0,
    candidateRows: 0,
    candidateCapHits: 0,
    scannedIdentities: new Set(), // printings this run searched
    retained: 0, // crossmatch-price-pilot-r1 retained raw candidate listings
    byKey: new Map(), // `${marketplace}|${listingId}` -> { listingId, graded, identities:Set }
  };

  const tokenCache = new Map();
  const nameTokensOf = (row) => {
    let t = tokenCache.get(row);
    if (!t) tokenCache.set(row, (t = coreTokens(String(row.name ?? ""))));
    return t;
  };

  function fail(e) {
    state.enabled = false;
    state.pending = [];
    state.error = String(e?.message ?? e).slice(0, 200);
  }

  function examine(listings, scannedRow) {
    const started = now();
    try {
      if (started - jobStartedAt > L.stopAfterJobMs) {
        state.truncatedBy.add("job_deadline");
        return;
      }
      if (state.observeMs >= L.maxObserveMs) {
        state.truncatedBy.add("observe_time");
        return;
      }
      state.searchesObserved++;
      const candidateRowsFor = state.candidateRowsFor;
      for (const listing of listings ?? []) {
        const spent = now() - started;
        if (spent > L.maxObserveMsPerSearch) {
          state.truncatedBy.add("search_time");
          break;
        }
        if (state.observeMs + spent > L.maxObserveMs) {
          state.truncatedBy.add("observe_time");
          break;
        }
        if (!listing?.listingId || typeof listing.title !== "string") continue;
        state.resultsSeen++;
        const key = `${marketplace}|${listing.listingId}`;
        if (state.byKey.has(key)) {
          state.duplicateResults++;
          continue;
        }
        if (state.listingsExamined >= L.maxListings) {
          state.truncatedBy.add("listings");
          break;
        }
        if (state.matchChecks >= L.maxMatchChecks) {
          state.truncatedBy.add("match_checks");
          break;
        }
        state.listingsExamined++;
        const entry = { listingId: listing.listingId, graded: Boolean(listing.isGraded), identities: new Set() };
        state.byKey.set(key, entry);
        if (
          !qualifiesAsTradingCard(listing) ||
          admitsProxyOrCounterfeit(listing, null) ||
          !isTrustworthyListing(listing) ||
          (listing.isGraded ? !gradedLookupWorthwhile(listing) : titleClaimsSlabGrade(listing.title))
        ) {
          entry.rejected = true;
          state.rejectedBeforeIdentity++;
          continue;
        }
        const candidates = candidateRowsFor(listing);
        state.candidateRows += candidates.length;
        if (candidates.length > L.maxCandidateRowsPerListing) {
          // never classify from a truncated candidate list
          entry.unclassified = true;
          state.candidateCapHits++;
          state.truncatedBy.add("candidates_per_listing");
          continue;
        }
        const lowerTitle = listing.title.toLowerCase();
        const listingLang = listing.isGraded ? null : classifyListingLanguage({ title: listing.title });
        for (const row of candidates) {
          const id = identityOf(row);
          if (id == null || entry.identities.has(id)) continue;
          // Conservative skip only: listingMatchesCard requires every name
          // token as a whole title word or a fused-code prefix of one, both of
          // which are substrings of the lower-cased title. A row failing this
          // can never match; a row passing it still gets the full check.
          if (!nameTokensOf(row).every((t) => lowerTitle.includes(t))) continue;
          if (state.matchChecks >= L.maxMatchChecks) {
            entry.unclassified = true; // incomplete for this listing
            entry.identities.clear();
            state.truncatedBy.add("match_checks");
            break;
          }
          state.matchChecks++;
          if (admitsProxyOrCounterfeit(listing, { name: row.name, set: row.set })) continue;
          if (!listingMatchesCard(listing, row)) continue;
          if (!listing.isGraded && !languageCompatible(listingLang, row.language)) continue;
          entry.identities.add(id);
          entry.matchedRow = row;
        }
        if (entry.unclassified) break;
        // crossmatch-price-pilot-r1: keep THIS invocation's raw listing object for
        // a single-identity match, bounded (never used unless the pilot is on)
        if (L.retainRawCandidates && !listing.isGraded && entry.identities.size === 1 && state.retained < L.maxRetainedListings) {
          entry.listing = listing;
          state.retained++;
        } else if (entry.identities.size !== 1 || listing.isGraded) {
          delete entry.matchedRow;
        }
      }
    } catch (e) {
      fail(e);
    } finally {
      const spent = now() - started;
      state.observeMs += spent;
      if (spent > state.maxSearchMs) state.maxSearchMs = spent;
    }
  }

  // Synchronous, CPU only. Called after the card's normal processing.
  function observe(listings, scannedRow) {
    if (!state.enabled) return;
    try {
      state.searchesReceived++;
      const id = identityOf(scannedRow);
      if (id != null) state.scannedIdentities.add(id);
      if (!state.candidateRowsFor) {
        if (state.pending.length < L.maxPendingSearches) state.pending.push([listings, scannedRow]);
        else state.truncatedBy.add("index_not_ready");
        return;
      }
      examine(listings, scannedRow);
    } catch (e) {
      fail(e);
    }
  }

  function drainPending() {
    const pending = state.pending;
    state.pending = [];
    for (const [listings, row] of pending) {
      if (!state.enabled) break;
      examine(listings, row);
    }
  }

  function setIndex(candidateRowsFor) {
    if (!state.enabled) return;
    if (typeof candidateRowsFor !== "function") return fail(new Error("index unavailable"));
    state.candidateRowsFor = candidateRowsFor;
    drainPending();
  }

  // Bulk classification against stored deals (chunked .in reads, never one
  // query per candidate). Returns the observation record. Never throws.
  async function finalize(db) {
    const startedAt = now();
    if (state.enabled && !state.candidateRowsFor && (state.pending.length || state.searchesReceived)) {
      state.truncatedBy.add("index_not_ready");
    }
    const out = {
      v: 1,
      marketplace,
      partial: false,
      truncatedBy: [],
      error: state.error,
      observeMs: 0,
      maxSearchMs: 0,
      finalizeMs: 0,
      searchesReceived: state.searchesReceived,
      searchesObserved: state.searchesObserved,
      resultsSeen: state.resultsSeen, // listing results examined, repeats included
      duplicateResults: state.duplicateResults, // same item/marketplace key seen again this invocation
      listingsExamined: state.listingsExamined, // distinct item (incl. variation) + marketplace keys
      rejectedBeforeIdentity: state.rejectedBeforeIdentity,
      candidateRows: state.candidateRows, // index candidates before the conservative name-token skip
      matchChecks: state.matchChecks, // full identity checks run
      candidateCapHits: state.candidateCapHits,
      unclassified: 0, // examined but not classified (candidate cap / match-check limit)
      noWatchedIdentity: 0,
      coveredByScannedCard: 0, // sole identity is a printing this run searched itself
      uniqueAdditional: { total: 0, raw: 0, graded: 0 }, // exactly one identity, not searched this run
      ambiguous: { total: 0, raw: 0, graded: 0, includesScannedCard: 0 }, // two or more identities
      // Stored state for uniqueAdditional listings on THIS marketplace. `deals`
      // holds listings once written as deal candidates, not every listing seen.
      uniqueStored: {
        activeListed: 0,
        inactive: 0,
        availabilityRetired: 0,
        quarantinedOrHeld: 0, // non-availability disqualified_reason (identity:/review:/quality)
        storedUnderOtherIdentity: 0, // subset of the above four: stored row is for a different printing
        neverStoredOnMarketplace: 0,
        notInDealsOnAnyMarketplace: 0, // subset of neverStoredOnMarketplace; not proof eBay-new
        storageUnknown: 0, // lookup truncated or failed
      },
      ambiguousStored: { stored: 0, notStored: 0, storageUnknown: 0 },
      globallyNew: null, // not established by stored data (see uniqueStored note)
      pricing: {
        // unique candidates never stored on this marketplace, or stored inactive
        // with no disqualification; quarantined/held/retired rows are excluded
        candidatesNeedingPricing: 0,
        distinctCardsNeedingPricing: 0,
        raw: 0,
        graded: 0, // would each need a grading detail lookup first
      },
    };
    try {
      const candidates = [];
      for (const e of state.byKey.values()) {
        if (e.rejected) continue;
        if (e.unclassified) {
          out.unclassified++;
          continue;
        }
        if (e.identities.size === 0) {
          out.noWatchedIdentity++;
          continue;
        }
        const ids = [...e.identities];
        const scanned = ids.filter((id) => state.scannedIdentities.has(id));
        if (ids.length === 1 && scanned.length === 1) {
          out.coveredByScannedCard++;
          continue;
        }
        const kind = ids.length === 1 ? "unique" : "ambiguous";
        const bucket = kind === "unique" ? out.uniqueAdditional : out.ambiguous;
        bucket.total++;
        bucket[e.graded ? "graded" : "raw"]++;
        if (kind === "ambiguous" && scanned.length > 0) out.ambiguous.includesScannedCard++;
        candidates.push({ ...e, kind, identity: kind === "unique" ? ids[0] : null });
      }

      candidates.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "unique" ? -1 : 1));
      const ids = [...new Set(candidates.map((c) => c.listingId))];
      const lookupIds = ids.slice(0, L.maxStoredLookupKeys);
      if (ids.length > lookupIds.length) out.truncatedBy.push("stored_lookup_keys");
      const rowsById = new Map();
      const looked = new Set();
      if (db) {
        for (let i = 0; i < lookupIds.length; i += L.storedLookupChunk) {
          if (now() - startedAt > L.maxFinalizeMs) {
            out.truncatedBy.push("finalize_time");
            break;
          }
          const chunk = lookupIds.slice(i, i + L.storedLookupChunk);
          const { data, error } = await db
            .from("deals")
            .select("listing_id, marketplace, is_active, disqualified_reason, card_tcgplayer_id")
            .in("listing_id", chunk);
          if (error) {
            out.error = out.error ?? `stored lookup: ${String(error.message).slice(0, 160)}`;
            break;
          }
          for (const id of chunk) looked.add(id);
          for (const r of data ?? []) {
            if (!rowsById.has(r.listing_id)) rowsById.set(r.listing_id, []);
            rowsById.get(r.listing_id).push(r);
          }
        }
      }

      const pricingCards = new Set();
      for (const c of candidates) {
        const rows = rowsById.get(c.listingId) ?? [];
        const here = rows.find((r) => r.marketplace === marketplace);
        if (c.kind === "ambiguous") {
          if (!looked.has(c.listingId)) out.ambiguousStored.storageUnknown++;
          else out.ambiguousStored[here ? "stored" : "notStored"]++;
          continue;
        }
        const s = out.uniqueStored;
        if (!looked.has(c.listingId)) {
          s.storageUnknown++;
          continue;
        }
        let needsPricing = false;
        if (!here) {
          s.neverStoredOnMarketplace++;
          if (rows.length === 0) s.notInDealsOnAnyMarketplace++;
          needsPricing = true;
        } else {
          if (here.disqualified_reason != null && isAvailabilityRetired(here)) s.availabilityRetired++;
          else if (here.disqualified_reason != null) s.quarantinedOrHeld++;
          else if (here.is_active) s.activeListed++;
          else {
            s.inactive++;
            needsPricing = true;
          }
          const storedCard = here.card_tcgplayer_id == null ? null : String(here.card_tcgplayer_id);
          if (storedCard != null && storedCard !== c.identity.split("|")[0]) s.storedUnderOtherIdentity++;
        }
        if (needsPricing) {
          out.pricing.candidatesNeedingPricing++;
          pricingCards.add(c.identity);
          out.pricing[c.graded ? "graded" : "raw"]++;
        }
      }
      out.pricing.distinctCardsNeedingPricing = pricingCards.size;
    } catch (e) {
      out.error = out.error ?? String(e?.message ?? e).slice(0, 200);
    }
    out.truncatedBy = [...new Set([...state.truncatedBy, ...out.truncatedBy])];
    out.partial = out.truncatedBy.length > 0 || out.error != null || !state.enabled;
    out.observeMs = Math.round(state.observeMs);
    out.maxSearchMs = Math.round(state.maxSearchMs);
    out.finalizeMs = Math.round(now() - startedAt);
    return out;
  }

  // crossmatch-price-pilot-r1 - the retained candidates, grouped by card: raw,
  // exactly one catalogue identity, not an identity in `excludeIdentities`
  // (this run's whole normal target set), complete (not unclassified).
  // Stored state is NOT checked here - the caller reads `deals` in bulk.
  function rawCandidateCards({ excludeIdentities = new Set() } = {}) {
    const byIdentity = new Map();
    const skipped = { graded: 0, ambiguous: 0, targetIdentity: 0, notRetained: 0 };
    for (const e of state.byKey.values()) {
      if (e.rejected || e.unclassified || e.identities.size === 0) continue;
      if (e.graded) { skipped.graded++; continue; }
      if (e.identities.size > 1) { skipped.ambiguous++; continue; }
      const [id] = e.identities;
      if (excludeIdentities.has(id)) { skipped.targetIdentity++; continue; }
      if (!e.listing || !e.matchedRow) { skipped.notRetained++; continue; }
      const card = byIdentity.get(id) ?? { identity: id, row: e.matchedRow, listings: [] };
      card.listings.push(e.listing);
      byIdentity.set(id, card);
    }
    return { cards: [...byIdentity.values()], skipped };
  }

  return { observe, setIndex, fail, finalize, state, rawCandidateCards };
}

// One insert-only row per run, plus pruning of old observation rows.
// Never throws.
async function recordCrossMatchObservation(db, record, { at = new Date().toISOString(), retentionDays = DEFAULT_LIMITS.retentionDays } = {}) {
  if (!db || !record) return { ok: false };
  try {
    const kind = `${OBSERVATION_KIND_PREFIX}${at.slice(0, 10)}:${at}:${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await db.from("catalog_snapshot").insert({ kind, data: record, updated_at: at });
    if (error) return { ok: false, error: String(error.message).slice(0, 200) };
    const cutoff = new Date(Date.parse(at) - retentionDays * 86400000).toISOString();
    await db.from("catalog_snapshot").delete().like("kind", `${OBSERVATION_KIND_PREFIX}%`).lt("updated_at", cutoff);
    return { ok: true, kind };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

module.exports = { OBSERVATION_KIND_PREFIX, DEFAULT_LIMITS, createCrossMatchObserver, recordCrossMatchObservation };

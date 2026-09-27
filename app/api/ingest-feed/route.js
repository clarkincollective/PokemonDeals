import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  MARKETPLACES,
  getItemsByLegacyIds,
  getBrowseRateLimit,
  cardConditionDescriptorContent,
  languageAspect,
} from "@/lib/ebay";
import { fetchFeed } from "@/lib/pokeFeed";
// 2026-09-27 BOARD DEALS - the board's own published listings + discount
// figure, shown on a separate surface only after THIS route's eBay lookup
// confirms the listing is live at the captured price (lib/boardDeals).
import {
  BOARD_DEALS_TAG,
  boardDealKind,
  capturedFromFeedItem,
  classifyVerification,
  buildBoardDealRecord,
  touchBoardDealRecord,
  pendingBoardDealRecord,
  unverifiedBoardDealRecord,
  isFreshCapture,
  expireAbsentRecords,
  loadBoardDealRecords,
  saveBoardDealRecords,
  acquireRunLock,
  releaseRunLock,
  recordBoardRun,
  boardListingTrusted,
  BOARD_ABSENCE_HOURS,
} from "@/lib/boardDeals";
import { getUsdRates, toUsd } from "@/lib/fx";
import { logDiscoveryEvent, legacyIdFromListingId, discoveryListingKey } from "@/lib/discoveryLog";
// 17C.10 - this writer changes a comparison but has no provider-dated
// reference of its own, so it CLEARS provenance in the same write.
import { CARD_REFERENCE_COLUMNS, clearedReference } from "@/lib/referenceProvenance";
import { probeReferenceColumns, writesReferenceColumns } from "@/lib/referenceProvenanceDb";
import { candidateKey, partitionCandidates, allocateVerifyBudget } from "@/lib/ingestFeedQueue";
import {
  SANITY_FLOOR_PCT,
  coreTokens,
  qualifiesAsTradingCard,
  admitsProxyOrCounterfeit,
  listingMatchesCard,
  isTrustworthyListing,
  titleClaimsSlabGrade,
} from "@/lib/dealMatching";
import {
  classifyListingCondition,
  conditionAllowsPromotion,
  classifyListingLanguage,
  languageCompatible,
} from "@/lib/dealQuality";
import { beginJobRun, finishJobRun, setQuotaSnapshot, markSkipped, markError, setBrowseAttemptGuard } from "@/lib/ebayTelemetry";
import { CONSUMER_CAPS, browseBudgetMode } from "@/lib/browseBudget";
import { attachBrowseLease } from "@/lib/ebayTelemetry";
import { acquireBrowseLease } from "@/lib/browseBudget";
import {
  AVAILABILITY_RETIREMENT,
  isAvailabilityRetired,
  writeDiscoverySighting,
  retireForAvailability,
  retirementInvalidationPlan,
  surfaceInvalidationPlan,
  expireTags,
} from "@/lib/listingAvailability";

// External discovery ingestion.
//
// PokeDealFinder's public board (lib/pokeFeed.js) is a DISCOVERY HINT ONLY.
// Each item it names is independently re-fetched through our own eBay
// Browse API, re-validated through the identical trust + match + score
// pipeline the scanner uses, matched against our own card_catalog, and
// wrapped with our own affiliate links. Nothing from the board is trusted
// or shown. This pipeline is ADDITIVE to app/api/refresh-deals - it never
// disables or replaces it.
//
// COST: verification is one Browse call per genuinely-new item (eBay's
// batch getItems endpoint 403s on this keyset). So this runs HOURLY, only
// when the Browse quota has real headroom (floor 800 - it is a supplement
// for spare capacity, not a substitute when our own quota is spent), and
// caps how many new items it verifies per cycle. Feed-only deals expire on
// absence from the board (2-day grace). See docs/scanning-architecture.md
// and IMPLEMENTATION_STATUS.md "External discovery ingestion".
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DISCOUNT_THRESHOLD = 0.1; // same value as refresh-deals / refresh-sealed-deals
const RATE_LIMIT_FLOOR = 800; // only supplement when we genuinely have room
const MAX_NEW_PER_CYCLE = 40; // hard ceiling on Browse spend per run

// --- ingest-hard-bound-2026-09-24 -------------------------------------
// A REAL daily ceiling on external Browse ATTEMPTS, not a nominal ledger
// cap. Measured 19-24 Sep: this job spent 305-423 calls/day against the 40
// it is funded for, for a documented ~4.5 first-time eligible pairs/day -
// roughly 70-85 calls per useful outcome, the worst ratio of any consumer.
//
// It over-spent because the grant was ADVISORY: the route narrowed its
// queue only `if (budget.effective === "enforce")`, and production runs in
// observe, so `verifyBudget` stayed at MAX_NEW_PER_CYCLE every run whatever
// the ledger said.
//
// Two independent bounds now apply, and neither depends on the global
// budget mode:
//   1. the QUEUE is sized from the ledger's own remaining allowance
//      (decision.capLeft, computed under compare-and-set, so repeated or
//      concurrent invocations cannot collectively overspend);
//   2. a HARD ATTEMPT GUARD (lib/ebayTelemetry.setBrowseAttemptGuard) is
//      armed around the verification work. It is checked on every Browse
//      attempt - retries included - in EVERY budget mode, before and
//      independently of any lease, so no request can bypass it.
// When the allowance is gone the run returns before any Browse call rather
// than falling through unleased.
const INGEST_DAILY_ATTEMPT_LIMIT = CONSUMER_CAPS.ingest; // 40, the cap it is already budgeted for
// A run may take up to the whole REMAINING daily allowance and no more.
// There is deliberately no smaller per-run slice: allocateVerifyBudget
// drains `neverSeen` (first-time candidates, the only tier that can produce
// a NEW pair) before `dueRecheck`, so a run that takes what is left spends
// it on the highest-value work available. Rationing it into equal hourly
// slices would spread the day's allowance across re-checks instead, which
// is the "spending the 40 attempts randomly" outcome we are avoiding.
const INGEST_MAX_ATTEMPTS_PER_RUN = INGEST_DAILY_ATTEMPT_LIMIT;
const RECENT_VERIFY_HOURS = 20; // skip re-verifying an item seen this recently
const FEED_ONLY_GRACE_DAYS = 2; // expire a feed-only deal absent from the board this long
const CATALOG_PAGE = 1000;

// The scanner stores listing_id as eBay's RESTful id; for a single-variation
// listing that's exactly `v1|<legacy>|0` (verified). Constructing it lets us
// skip the Browse call for an item we already saw recently (or know is
// retired). A variation-item mismatch just means one wasted lookup - the
// sighting write still dedups correctly.
//
// Sold-item freshness (2026-09-11): the board is a DISCOVERY HINT, never
// availability evidence. A board sighting alone no longer touches
// last_seen_at (it used to bump every still-active row it named, which
// kept third-party-listed rows looking freshly seen on eBay and outside
// the stale sweep). last_seen_at moves only on a real eBay item lookup
// below; everything else ages normally and is re-verified or expired.
const restId = (legacy) => `v1|${legacy}|0`;

export async function GET(request) {
  // 17C.10 - reference provenance is written IN THE SAME statement as the
  // comparison it certifies, never as a follow-up update: a separate write
  // that fails or races would leave the OLD evidence attached to the NEW
  // market_price, and stale evidence can pass every value check when the
  // new reference happens to carry the same amount. So the columns are
  // probed once per run and, when present, merged into the row itself.
  const supportsReferenceColumns = writesReferenceColumns(await probeReferenceColumns(supabaseAdmin(), "deals"));
  const startedAt = Date.now();
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // EBAY-14R - job context begins before the pre-flight quota check, same
  // reasoning as verify-deals: a floor skip is itself an observed
  // invocation. This is a SEPARATE, uniform record (ebay_job_runs) laid
  // alongside this route's existing, richer recordIngestRun/
  // catalog_snapshot history below - not a replacement for it.
  const db = supabaseAdmin();
  const ctx = beginJobRun({ job: "ingest-feed" });
  let budgetLease = null;
  // ingest-hard-bound-2026-09-24 telemetry, reported on every run.
  let dailyAttemptsLeft = null;
  let attemptCeiling = null;
  let attemptGuard = null;

  // 2026-09-27 board deals: ONE run at a time. The cron is every 30 minutes
  // and a run may take up to maxDuration, so a second invocation that finds
  // the lock held stops here having made no eBay call. A lock past its
  // `until` (a crashed run) is taken over.
  // (acquired inside the try below, released by its inner finally)
  // Board-deal bookkeeping for this run: discoveries, imports (published),
  // duplicates (a record already exists: touched, no lookup), queued
  // (pending, awaiting quota), failures and the quota it ran under.
  const board = { discovered: 0, withDiscount: 0, duplicatesSkipped: 0, queuedPending: 0, unverifiedShown: 0, lookedUp: 0, published: 0, priceChanged: 0, ended: 0, rejected: 0, lookupFailed: 0, expired: 0, saved: 0, saveErrors: [] };
  const runNow = new Date().toISOString();
  let boardRecords = null; // Map<kind, record>, loaded once on first use
  const boardChanged = new Map(); // kind -> record to save this run
  const loadBoard = async () => (boardRecords ??= await loadBoardDealRecords(db));
  // Record OUR lookup's verdict for one board row. `listing` is the
  // mapItemSummary result, or null when the lookup returned nothing.
  const recordBoardVerdict = async (feedItem, listing) => {
    if (!feedItem) return;
    const kind = boardDealKind(feedItem.marketplace, feedItem.ebayItemId);
    const prev = (await loadBoard()).get(kind) ?? null;
    const captured = capturedFromFeedItem(feedItem, runNow) ?? prev?.captured ?? null;
    board.lookedUp++;
    if (!captured) return; // the row carries no published figure: nothing for this surface
    const verdict = classifyVerification({ captured, listing, trusted: listing ? boardListingTrusted(listing) : true });
    boardChanged.set(kind, buildBoardDealRecord({ feedItem, listing, captured, verdict, prev, now: runNow }));
    if (verdict.status === "published") board.published++;
    else if (verdict.status === "price_changed") board.priceChanged++;
    else if (verdict.status === "ended") board.ended++;
    else board.rejected++;
  };
  // Every board row with a captured discount that this run did NOT look up:
  // a record already exists -> duplicate (touched: the board still lists it,
  // no lookup, no re-import); none -> queued as pending, captured data kept,
  // for a run that has quota.
  const queueBoardDiscoveries = async (items) => {
    const records = await loadBoard();
    // a skip path reaches here before the main path counted the board
    if (board.discovered === 0 && (items ?? []).length) {
      board.discovered = items.length;
      board.withDiscount = items.filter((it) => it?.capturedDiscountPct != null).length;
    }
    for (const it of items ?? []) {
      if (it?.capturedDiscountPct == null) continue;
      const kind = boardDealKind(it.marketplace, it.ebayItemId);
      if (boardChanged.has(kind)) continue;
      const prev = records.get(kind);
      const captured = capturedFromFeedItem(it, runNow);
      if (prev && prev.status !== "pending") {
        boardChanged.set(kind, touchBoardDealRecord(prev, { now: runNow }));
        board.duplicatesSkipped++;
      } else if (isFreshCapture(captured)) {
        // 2026-09-27 (owner): a fresh row is shown at once, verified later
        boardChanged.set(kind, unverifiedBoardDealRecord({ feedItem: it, captured, prev, now: runNow }));
        board.unverifiedShown++;
      } else if (prev) {
        boardChanged.set(kind, touchBoardDealRecord(prev, { now: runNow }));
        board.duplicatesSkipped++;
      } else {
        boardChanged.set(kind, pendingBoardDealRecord({ feedItem: it, captured, now: runNow }));
        board.queuedPending++;
      }
    }
  };
  // Pending records the board no longer lists still deserve their lookup
  // (the queue outlives the board's own recency window), as feed-shaped items.
  const pendingOffBoard = async (onBoardKeys) => {
    const records = await loadBoard();
    const cutoff = Date.now() - BOARD_ABSENCE_HOURS * 3600_000;
    const out = [];
    for (const [kind, r] of records) {
      if ((r.status !== "pending" && r.status !== "unverified") || onBoardKeys.has(kind) || !(Date.parse(r.lastSeenOnBoardAt ?? "") > cutoff)) continue;
      out.push({ marketplace: r.marketplace, ebayItemId: r.itemId, feedTitle: r.title, feedPrice: r.captured?.price ?? null, feedMarket: r.captured?.market ?? null, capturedDiscountPct: r.captured?.discountPct ?? null, capturedDiscountText: r.captured?.discountText ?? null, boardFoundAt: r.captured?.foundAt ?? null, boardId: r.captured?.boardId ?? null, boardName: r.name, boardSet: r.set, boardVariant: r.variant, boardFormat: r.format, boardImage: r.image, plainEbayUrl: r.listingUrl, sourceUrl: r.captured?.sourceUrl ?? null, _queued: true });
    }
    return out;
  };
  // Expire records absent from the board, save every changed record, expire
  // the page cache when what is published changed, and write the run summary.
  const flushBoard = async ({ browseCalls = 0, quota = null, skipped = null } = {}) => {
    const records = await loadBoard();
    const untouched = [...records.entries()].filter(([kind]) => !boardChanged.has(kind)).map(([, r]) => r);
    const { records: aged, expired } = expireAbsentRecords(untouched, { now: Date.now() });
    for (const r of aged) if (r.status === "expired" && records.get(boardDealKind(r.marketplace, r.itemId))?.status !== "expired") boardChanged.set(boardDealKind(r.marketplace, r.itemId), r);
    board.expired = expired;
    const toSave = [...boardChanged.values()];
    if (toSave.length) {
      const { written, errors } = await saveBoardDealRecords(db, toSave);
      board.saved = written;
      board.saveErrors = errors;
    }
    const publicationChanged = toSave.some((r) => r.status === "published" || r.status === "unverified" || r.unpublishedAt || r.status === "expired" || r.status === "price_changed" || r.status === "ended");
    if (publicationChanged) {
      try {
        revalidateTag(BOARD_DEALS_TAG, { expire: 0 });
      } catch {
        /* the 15-minute revalidate still applies */
      }
    }
    await recordBoardRun(db, { at: runNow, skipped, browseCalls, quota, ...board });
    return { ...board };
  };
  try {
  const runLock = await acquireRunLock(db, { ttlMs: (maxDuration + 60) * 1000, owner: ctx?.runId ?? null });
  if (!runLock.acquired) {
    markSkipped("overlapping_run");
    await recordBoardRun(db, { at: new Date().toISOString(), skipped: "overlapping_run", heldUntil: runLock.heldUntil ?? null, error: runLock.error ?? null });
    return Response.json({ skipped: "overlapping_run", heldUntil: runLock.heldUntil ?? null });
  }
  try { // released by the inner finally on EVERY exit below (indentation kept flat: the body is unchanged)
  // Pre-flight quota guard. A high floor on purpose: this is spare-capacity
  // supplementation - it backs off FIRST so the primary scanner
  // (app/api/refresh-deals, which has no floor) always keeps quota. A
  // failed meta-call (null) -> proceed. A floor skip does ZERO Browse
  // item lookups and touches ZERO timestamps.
  const rl = await getBrowseRateLimit();
  setQuotaSnapshot({ remainingStart: rl?.remaining ?? null, limit: rl?.limit ?? null, reserveFloor: RATE_LIMIT_FLOOR });
  if (rl && rl.remaining != null && rl.remaining < RATE_LIMIT_FLOOR) {
    markSkipped("ebay_rate_limited");
    // 2026-09-27 board deals: the board is still read (no eBay call) so its
    // rows are queued as pending records for a run that has quota.
    let boardQueued = null;
    try {
      const { listings: boardRows } = await fetchFeed();
      await queueBoardDiscoveries(boardRows);
      boardQueued = await flushBoard({ browseCalls: 0, quota: { remaining: rl.remaining, floor: RATE_LIMIT_FLOOR }, skipped: "ebay_rate_limited" });
    } catch {
      /* queueing is best-effort */
    }
    await recordIngestRun(db, {
      at: new Date().toISOString(),
      quotaFloorSkipped: true,
      browseVerifyAttempts: 0,
      floor: RATE_LIMIT_FLOOR,
      rateLimitRemaining: rl.remaining,
      tookMs: Date.now() - startedAt,
    });
    return Response.json({
      skipped: "ebay_rate_limited",
      floor: RATE_LIMIT_FLOOR,
      remaining: rl.remaining,
      reset: rl.reset,
      boardDeals: boardQueued,
    });
  }

  // 1. Pull the board.
  const { listings: feedItems, error: feedError } = await fetchFeed();
  if (feedError) {
    await recordIngestRun(db, { at: new Date().toISOString(), feedUnavailable: true, error: feedError, browseVerifyAttempts: 0, tookMs: Date.now() - startedAt });
    return Response.json({ skipped: "feed_unavailable", error: feedError });
  }
  if (feedItems.length === 0) {
    await recordIngestRun(db, { at: new Date().toISOString(), candidatesDiscovered: 0, browseVerifyAttempts: 0, note: "board parsed to zero items", tookMs: Date.now() - startedAt });
    return Response.json({ feedItems: 0, note: "board parsed to zero items" });
  }

  // 2. CHEAP FILTERING - before any Browse call.
  //
  // Keep only supported marketplaces; canonical-dedupe is handled by
  // partitionCandidates on discoveryListingKey.
  const boardItems = feedItems.filter((it) => MARKETPLACES[it.marketplace]);
  // 2026-09-27 board deals: what the board published this run, plus the
  // pending records it no longer lists (the queue outlives the board).
  board.discovered = boardItems.length;
  board.withDiscount = boardItems.filter((it) => it.capturedDiscountPct != null).length;
  const onBoardKeys = new Set(boardItems.map((it) => boardDealKind(it.marketplace, it.ebayItemId)));
  const supportedItems = [...boardItems, ...(await pendingOffBoard(onBoardKeys))];
  const candidateKeys = [...new Set(supportedItems.map(candidateKey).filter(Boolean))];
  const recentCutoffMs = Date.now() - RECENT_VERIFY_HOURS * 3600 * 1000;
  const recentCutoff = new Date(recentCutoffMs).toISOString();

  // 2a. Existing check: a candidate we already have a `deals` row for.
  //     Fresh row (last_seen inside the window) -> skip the Browse call.
  //     Row the verifier retired as sold / not found in that marketplace
  //     -> skip too: no sighting may reactivate it, so a lookup would only
  //     spend quota. Board presence is NOT written anywhere (see restId).
  const freshDealKeys = new Set();
  let skippedAvailabilityRetired = 0;
  {
    const restIds = candidateKeys.map((k) => restId(k.split(":").slice(1).join(":")));
    for (let i = 0; i < restIds.length; i += 200) {
      const chunk = restIds.slice(i, i + 200);
      const { data: rows } = await db
        .from("deals")
        .select("listing_id, marketplace, last_seen_at, is_active, disqualified_reason")
        .eq("source", "ebay")
        .in("listing_id", chunk);
      for (const r of rows ?? []) {
        const key = discoveryListingKey(r.marketplace, r.listing_id);
        if (isAvailabilityRetired(r)) {
          if (!freshDealKeys.has(key)) skippedAvailabilityRetired++;
          freshDealKeys.add(key);
        } else if (r.last_seen_at > recentCutoff) freshDealKeys.add(key);
      }
    }
  }

  // 2b. THE P0.3.2 FIX: consult discovery_events (source='external'),
  //     which logs EVERY verified candidate whatever the outcome. A
  //     candidate any external verification touched inside
  //     RECENT_VERIFY_HOURS is skipped BEFORE the Browse call - accepted,
  //     rejected, failed-match, failed-quality-gate, every marketplace.
  //     After the window it is eligible again (no blacklist).
  // P0.4.2 §9 - per key: latest verification time + how many times it has
  // been verified + whether it ever became a deal. partitionCandidates
  // uses this for the ADAPTIVE cooldown (a stable twice-failed reject
  // backs off ~84h instead of the flat 20h).
  const externalHistory = new Map(); // listingKey -> { lastMs, count, becameDeal }
  for (let i = 0; i < candidateKeys.length; i += 200) {
    const chunk = candidateKeys.slice(i, i + 200);
    const { data: rows } = await db
      .from("discovery_events")
      .select("listing_key, occurred_at, became_deal")
      .eq("source", "external")
      .in("listing_key", chunk);
    for (const r of rows ?? []) {
      const ms = Date.parse(r.occurred_at);
      if (!Number.isFinite(ms)) continue;
      const prev = externalHistory.get(r.listing_key) ?? { lastMs: 0, count: 0, becameDeal: false };
      externalHistory.set(r.listing_key, {
        lastMs: Math.max(prev.lastMs, ms),
        count: prev.count + 1,
        becameDeal: prev.becameDeal || Boolean(r.became_deal),
      });
    }
  }

  // 3. Partition + order + cap.
  const part = partitionCandidates({
    feedItems: supportedItems,
    externalHistory,
    freshDealKeys,
    recentCutoffMs,
    now: Date.now(),
  });
  // browse-budget-r1 - reserve this run's verification calls (competitor
  // board hints; 150/day cap, never more than MAX_NEW_PER_CYCLE per run)
  // before any Browse call, and size the queue to the grant.
  let verifyBudget = MAX_NEW_PER_CYCLE;
  const verifyDemand = Math.min(MAX_NEW_PER_CYCLE, part.neverSeen.length + part.dueRecheck.length);
  if (verifyDemand > 0) {
    const budget = await acquireBrowseLease(db, {
      key: "ingest",
      requested: verifyDemand + (verifyDemand >= 10 ? 2 : 0),
      minGrant: Math.min(5, verifyDemand),
      observation: rl,
      ttlMs: (maxDuration + 60) * 1000,
      // The ledger path must run even when the global mode is `off`, or
      // there is no durable record of what this job has already spent
      // today and the daily bound could not be honoured. This forces
      // ingest's OWN accounting only; no other consumer's mode changes.
      ...(browseBudgetMode() === "off" ? { mode: "observe" } : {}),
    });
    if (budget.granted <= 0) {
      markSkipped(`budget_${budget.decision?.denied ?? "denied"}`);
      await recordIngestRun(db, { at: new Date().toISOString(), browseBudgetSkipped: budget.decision?.denied ?? true, browseVerifyAttempts: 0, tookMs: Date.now() - startedAt });
      // 2026-09-27 board deals: no quota this run - queue, do not look up
      await queueBoardDiscoveries(supportedItems);
      const boardQueued = await flushBoard({ browseCalls: 0, quota: { remaining: rl?.remaining ?? null, decision: budget.decision ?? null }, skipped: "browse_budget" });
      return Response.json({ skipped: "browse_budget", budget: { mode: budget.mode, ...budget.decision }, boardDeals: boardQueued });
    }
    budgetLease = budget.lease;
    attachBrowseLease(budgetLease);

    // THE DAILY BOUND. capLeft is cap - used - open for this key, computed
    // from the durable ledger under compare-and-set, so two invocations
    // racing cannot both see the same last unit.
    //
    // UNKNOWN IS NOT EXHAUSTED. An unreadable ledger (the documented
    // "ledger_error" path) returns no capLeft. Treating that as zero would
    // turn a transient ledger blip into a silent outage of this job, and it
    // would also contradict this file's own contract that a ledger failure
    // "never blocks work outside enforce". So an unknown allowance falls
    // back to the PER-RUN ceiling - still a hard bound on real attempts,
    // just without the daily guarantee, and the run says so in its
    // telemetry (ingestDailyAllowanceKnown) so a degraded day is visible
    // rather than assumed. Only a KNOWN zero stops the run.
    const capLeft = Number(budget.decision?.capLeft);
    dailyAttemptsLeft = Number.isFinite(capLeft) ? Math.max(0, Math.floor(capLeft)) : null;
    if (dailyAttemptsLeft === 0) {
      markSkipped("ingest_daily_attempt_limit");
      await recordIngestRun(db, {
        at: new Date().toISOString(),
        browseBudgetSkipped: "ingest_daily_attempt_limit",
        browseVerifyAttempts: 0,
        ingestDailyAttemptLimit: INGEST_DAILY_ATTEMPT_LIMIT,
        ingestDailyAttemptsLeft: 0,
        ingestDailyAllowanceKnown: true, // a KNOWN zero is the only thing that skips
        ingestExternalAttempts: 0,
        ingestRetries: 0,
        tookMs: Date.now() - startedAt,
      });
      // 2026-09-27 board deals: the day's lookups are spent - queue, do not look up
      await queueBoardDiscoveries(supportedItems);
      const boardQueued = await flushBoard({ browseCalls: 0, quota: { remaining: rl?.remaining ?? null, dailyAttemptsLeft: 0 }, skipped: "ingest_daily_attempt_limit" });
      return Response.json({ skipped: "ingest_daily_attempt_limit", limit: INGEST_DAILY_ATTEMPT_LIMIT, remaining: 0, boardDeals: boardQueued });
    }
    attemptCeiling = Math.min(dailyAttemptsLeft ?? INGEST_MAX_ATTEMPTS_PER_RUN, INGEST_MAX_ATTEMPTS_PER_RUN);
    // Hard ceiling on real attempts for the rest of this invocation.
    // Retries included, every budget mode, ahead of any lease check.
    attemptGuard = setBrowseAttemptGuard(attemptCeiling);
    // One lookup is one Browse call (getItemsByLegacyIds issues one request
    // per legacy id), so the queue is sized to the attempt ceiling and the
    // guard stops the run at it even if retries make a lookup cost two.
    // This no longer depends on `effective === "enforce"` - that condition
    // is exactly why the job over-spent.
    verifyBudget = Math.min(MAX_NEW_PER_CYCLE, attemptCeiling);
  }
  const toVerify = allocateVerifyBudget({
    neverSeen: part.neverSeen,
    dueRecheck: part.dueRecheck,
    budget: verifyBudget,
  });
  const newCount = part.neverSeen.length + part.dueRecheck.length;
  const queuedForVerify = [...toVerify.values()].reduce((s, a) => s + a.length, 0);
  // legacy field name kept in the response for anything watching it
  const seenListingIds = freshDealKeys;

  // 4. Load the card_catalog match index + the watched-card id set, once.
  const rates = await getUsdRates();
  const catalogRows = [];
  for (let from = 0; ; from += CATALOG_PAGE) {
    const { data, error } = await db
      .from("card_catalog")
      .select('tcgplayer_id, name, "set", language, market_price, card_number')
      .range(from, from + CATALOG_PAGE - 1);
    if (error) return Response.json({ error: `card_catalog read: ${error.message}` }, { status: 500 });
    if (!data || data.length === 0) break;
    catalogRows.push(...data);
    if (data.length < CATALOG_PAGE) break;
  }
  const catalogIndex = new Map(); // token -> rows[]
  for (const row of catalogRows) {
    for (const token of coreTokens(row.name)) {
      if (!catalogIndex.has(token)) catalogIndex.set(token, []);
      catalogIndex.get(token).push(row);
    }
  }
  const { data: watchRows } = await db
    .from("watchlist")
    .select("id, justtcg_tcgplayer_id")
    .eq("active", true);
  const watchedId = new Map((watchRows ?? []).map((w) => [String(w.justtcg_tcgplayer_id), w.id]));

  // 5. Verify + run the pipeline.
  let browseCalls = 0;
  let verified = 0;
  const counts = { untrusted: 0, graded: 0, noMatch: 0, noPrice: 0, notDeal: 0, upserted: 0 };
  const retiredRows = []; // rows retired here on a sold-out item lookup

  for (const [marketplace, items] of toVerify) {
    const feedByLegacy = new Map(items.map((it) => [String(it.ebayItemId), it]));
    const { listings, calls } = await getItemsByLegacyIds(
      items.map((it) => it.ebayItemId),
      marketplace
    );
    browseCalls += calls;
    verified += listings.length;

    // 2026-09-27 board deals: a row we looked up that came back with nothing
    // (ended / removed / not found) is a failed lookup for this surface.
    {
      const returned = new Set(listings.map((l) => String(legacyIdFromListingId(l.listingId))));
      for (const it of items) {
        if (returned.has(String(it.ebayItemId))) continue;
        board.lookupFailed++;
        await recordBoardVerdict(it, null);
      }
    }

    for (const listing of listings) {
      const feedItem = feedByLegacy.get(String(legacyIdFromListingId(listing.listingId)));
      // 2026-09-27 board deals: OUR lookup's verdict on this board row is
      // recorded BEFORE the discovery pipeline's own gates below, which
      // decide something different (whether it becomes one of OUR deals).
      await recordBoardVerdict(feedItem, listing);
      // One discovery-analytics event per VERIFIED listing (Phase 2, Step 9
      // acceptance-rate denominator). Best-effort - never blocks ingestion.
      const logFeed = (becameDeal, extra = {}) =>
        logDiscoveryEvent(db, {
          marketplace: listing.marketplace,
          listingId: listing.listingId,
          source: "external",
          searchType: "external",
          becameDeal,
          externalSourceUrl: feedItem?.sourceUrl ?? null,
          ...extra,
        });

      // The item lookup itself says sold out (OUT_OF_STOCK / 0 remaining -
      // item-level quantity). Never re-publish it; and if THIS marketplace's
      // row is still live, retire exactly that row with the same reason the
      // verifier uses. Other marketplaces' rows are left to their own
      // verification (no cross-market propagation).
      if (listing.soldOut === true) {
        counts.soldOnLookup = (counts.soldOnLookup ?? 0) + 1;
        // Integrity follow-up r2: never replaces an identity quarantine /
        // review hold / quality reason (see lib/listingAvailability).
        const { retired, error: retireError } = await retireForAvailability(db, {
          key: { source: "ebay", marketplace: listing.marketplace, listing_id: listing.listingId },
          reason: AVAILABILITY_RETIREMENT.SOLD,
          patch: { exact_verified_at: new Date().toISOString() },
          onlyActive: true,
        });
        if (!retireError) retiredRows.push(...(retired ?? []));
        logFeed(false);
        continue;
      }
      if (!qualifiesAsTradingCard(listing) || admitsProxyOrCounterfeit(listing, null)) {
        counts.untrusted++;
        logFeed(false);
        continue;
      }
      if (!isTrustworthyListing(listing)) {
        counts.untrusted++;
        logFeed(false);
        continue;
      }
      // Graded needs a grader-specific reference price (extra PPT + Browse
      // calls). The scanner already covers graded for watched cards; here we
      // skip it in v1 rather than price a graded card against a raw number.
      if (listing.isGraded) {
        counts.graded++;
        logFeed(false);
        continue;
      }
      // integrity-r1: an eBay-"ungraded" item whose title credibly claims a
      // slab grade is not priced against a raw reference either.
      if (titleClaimsSlabGrade(listing.title)) {
        counts.slabTitleOnRaw = (counts.slabTitleOnRaw ?? 0) + 1;
        logFeed(false);
        continue;
      }

      const match = matchCatalog(listing, catalogIndex);
      if (!match) {
        counts.noMatch++;
        logFeed(false);
        continue;
      }

      // QUALITY GATE - same rules as the scanner. The legacy-id fetch
      // already returned the structured "Card Condition" descriptor and
      // the "Language" item-specific, so this costs no extra API call.
      // "Cheap != good deal": a Heavily-Played / Damaged card or a
      // wrong-language print must not become a deal against a normal
      // market reference.
      const condition = classifyListingCondition({
        title: listing.title,
        ebayCondition: listing.condition,
        descriptorContent: cardConditionDescriptorContent(listing.conditionDescriptors),
      });
      if (!conditionAllowsPromotion(condition, { requireExactRef: true })) {
        counts.badCondition = (counts.badCondition ?? 0) + 1;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id });
        continue;
      }
      const listingLang = classifyListingLanguage({
        title: listing.title,
        itemSpecificLanguage: languageAspect(listing.localizedAspects),
      });
      if (!languageCompatible(listingLang, match.language)) {
        counts.langMismatch = (counts.langMismatch ?? 0) + 1;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id });
        continue;
      }

      const marketPrice = Number(match.market_price);
      if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
        counts.noPrice++;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id });
        continue;
      }

      const totalLocal = listing.price + listing.shipping;
      const totalUsd = toUsd(totalLocal, listing.currency, rates);
      const discountPct = (marketPrice - totalUsd) / marketPrice;
      if (discountPct < DISCOUNT_THRESHOLD || totalUsd < marketPrice * SANITY_FLOOR_PCT) {
        counts.notDeal++;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id, discountPct });
        continue;
      }

      const watchlistId = watchedId.get(String(match.tcgplayer_id)) ?? null;
      // Guarded sighting write (lib/listingAvailability): never reactivates
      // a row retired as sold / not found in this marketplace.
      const { outcome, error } = await writeDiscoverySighting(
        db,
        {
          watchlist_id: watchlistId,
          card_catalog_id: match.tcgplayer_id,
          discovery_source: "external",
          source: "ebay",
          marketplace: listing.marketplace,
          listing_id: listing.listingId,
          title: listing.title,
          image_url: listing.imageUrl,
          listing_url: listing.listingUrl,
          affiliate_url: listing.affiliateUrl,
          listing_type: listing.listingType,
          bid_count: listing.bidCount,
          auction_end_at: listing.auctionEndAt,
          price: listing.price,
          shipping: listing.shipping,
          total_price: totalLocal,
          total_price_usd: totalUsd,
          currency: listing.currency ?? "USD",
          item_location_country: listing.itemLocationCountry ?? null,
          is_local:
            Boolean(listing.itemLocationCountry) &&
            listing.itemLocationCountry === listing.marketplace.replace("EBAY_", ""),
          market_price: marketPrice,
          discount_pct: discountPct,
          // This writer rewrote the comparison from card_catalog.market_price,
          // and card_catalog carries NO provider observation time - only our
          // own synced_at, which can never evidence when the figure was true.
          // It therefore supplies no evidence and CLEARS any a previous
          // writer left, atomically with the comparison itself. Feed-sourced
          // tracked-release rows stay plain listings.
          ...(supportsReferenceColumns ? clearedReference(CARD_REFERENCE_COLUMNS) : {}),
          // The classified physical tier ("Near Mint" here - worse tiers
          // AND Unknown were rejected by conditionAllowsPromotion above),
          // never eBay's bare "Ungraded" grading-status string.
          condition,
          is_graded: false,
          seller_username: listing.sellerUsername,
          seller_feedback_pct: listing.sellerFeedbackPct,
          is_active: true,
          last_seen_at: new Date().toISOString(),
        }
      );
      if (error) counts.upsertError = (counts.upsertError ?? 0) + 1;
      else if (outcome === "blocked") {
        counts.blockedRetired = (counts.blockedRetired ?? 0) + 1;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id, discountPct });
      } else {
        counts.upserted++;
        logFeed(true, { cardTcgplayerId: match.tcgplayer_id, discountPct });
      }
    }
  }

  // 5b. Expire the caches of any card whose live row was just retired
  //     above (deduplicated by card; no provider call here).
  const retirePlan = retirementInvalidationPlan(retiredRows);
  // cache-retire-r1 - plus the list / set / species surfaces those rows appear on
  const surfaces = surfaceInvalidationPlan(retiredRows);
  const invalidation = { cards: retirePlan.cards, deals: retirePlan.deals, sets: surfaces.sets, species: surfaces.species, ...expireTags(revalidateTag, [...retirePlan.tags, ...surfaces.tags]) };

  // 6. Expire feed-ONLY deals that have been off the board past the grace
  //    window. Deals also seen by the scanner (discovery_source
  //    'scan+external') or linked to a watchlist row are reconciled by the
  //    scanner's own per-card expiry - leave those alone.
  const graceCutoff = new Date(Date.now() - FEED_ONLY_GRACE_DAYS * 86400 * 1000).toISOString();
  const { data: expired } = await db
    .from("deals")
    .update({ is_active: false })
    .eq("discovery_source", "external")
    .is("watchlist_id", null)
    .eq("is_active", true)
    .lt("last_seen_at", graceCutoff)
    .select("id");

  // 2026-09-27 board deals: rows not looked up this run are duplicates
  // (record exists, touched) or queued pending; absent records expire; the
  // page cache is refreshed when publication changed; the run is recorded.
  await queueBoardDiscoveries(supportedItems);
  const boardSummary = await flushBoard({ browseCalls, quota: { remaining: rl?.remaining ?? null, dailyAttemptsLeft, attemptCeiling } });

  const rejectionBreakdown = {
    untrusted: counts.untrusted,
    graded: counts.graded,
    slabTitleOnRaw: counts.slabTitleOnRaw ?? 0,
    noMatch: counts.noMatch,
    badCondition: counts.badCondition ?? 0,
    langMismatch: counts.langMismatch ?? 0,
    noPrice: counts.noPrice,
    notDeal: counts.notDeal,
    upsertError: counts.upsertError ?? 0,
  };
  const rejected = Object.values(rejectionBreakdown).reduce((s, n) => s + n, 0);
  const capHit = queuedForVerify >= MAX_NEW_PER_CYCLE;

  // OBSERVABILITY (P0.3.2 SS6) - one durable per-cycle record so a future
  // audit can prove whether this fix works, without a new table.
  await recordIngestRun(db, {
    at: new Date().toISOString(),
    marketplaces: [...toVerify.keys()],
    candidatesDiscovered: candidateKeys.length,
    dedupedInBatch: part.dedupedInBatch,
    skippedAlreadyFreshDeal: part.skippedFreshDeal,
    skippedRecentlyVerified: part.skippedRecentlyVerified,
    skippedStableReject: part.skippedStableReject,
    skippedPrefilter: part.skippedPrefilter,
    skippedAvailabilityRetired,
    neverSeenQueued: part.neverSeen.length,
    dueRecheckQueued: part.dueRecheck.length,
    queuedForVerify,
    capHit,
    quotaFloorSkipped: false,
    browseVerifyAttempts: browseCalls,
    // ingest-hard-bound-2026-09-24. `browseCalls` counts LOGICAL lookups
    // (one per legacy id); `attemptGuard.attempts` counts REAL external
    // attempts, retries included, which is what eBay meters. The gap
    // between them is the retry amplification that made the nominal cap
    // meaningless.
    ingestDailyAttemptLimit: INGEST_DAILY_ATTEMPT_LIMIT,
    ingestDailyAttemptsLeft: dailyAttemptsLeft,
    // false means the ledger could not be read this run, so the daily
    // guarantee is degraded to the per-run ceiling - visible, not assumed
    ingestDailyAllowanceKnown: dailyAttemptsLeft !== null,
    ingestAttemptCeiling: attemptCeiling,
    ingestLogicalLookupsRequested: verifyDemand,
    ingestLogicalLookupsQueued: queuedForVerify,
    ingestExternalAttempts: attemptGuard?.attempts ?? browseCalls,
    ingestRetries: Math.max(0, (attemptGuard?.attempts ?? browseCalls) - browseCalls),
    ingestSkippedForAllowance: (attemptGuard?.refused ?? 0) + Math.max(0, verifyDemand - queuedForVerify),
    ingestFirstTimeEligiblePairs: counts.upserted,
    ingestCallsPerUsefulOutcome: counts.upserted > 0 ? Number((((attemptGuard?.attempts ?? browseCalls) / counts.upserted)).toFixed(2)) : null,
    verified,
    accepted: counts.upserted,
    rejected,
    rejectionBreakdown,
    soldOnLookup: counts.soldOnLookup ?? 0,
    blockedRetired: counts.blockedRetired ?? 0,
    retiredOnLookup: retiredRows.length,
    expiredFeedOnly: expired?.length ?? 0,
    rateLimitRemaining: rl?.remaining ?? null,
    tookMs: Date.now() - startedAt,
  });

  return Response.json({
    feedItems: feedItems.length,
    candidatesDiscovered: candidateKeys.length,
    dedupedInBatch: part.dedupedInBatch,
    skippedAlreadyFreshDeal: part.skippedFreshDeal,
    skippedRecentlyVerified: part.skippedRecentlyVerified,
    skippedStableReject: part.skippedStableReject,
    skippedPrefilter: part.skippedPrefilter,
    skippedAvailabilityRetired,
    alreadyFresh: seenListingIds.size, // legacy field name
    newDiscovered: newCount,
    neverSeenQueued: part.neverSeen.length,
    dueRecheckQueued: part.dueRecheck.length,
    queuedForVerify,
    verifyBudget,
    capHit,
    ingestBound: {
      dailyLimit: INGEST_DAILY_ATTEMPT_LIMIT,
      dailyLeft: dailyAttemptsLeft,
      dailyAllowanceKnown: dailyAttemptsLeft !== null,
      attemptCeiling,
      externalAttempts: attemptGuard?.attempts ?? browseCalls,
      retries: Math.max(0, (attemptGuard?.attempts ?? browseCalls) - browseCalls),
      refusedByGuard: attemptGuard?.refused ?? 0,
    },
    verified,
    browseCalls,
    ...counts,
    rejected,
    retiredOnLookup: retiredRows.length,
    invalidation,
    expiredFeedOnly: expired?.length ?? 0,
    rateLimitRemaining: rl?.remaining ?? null,
    boardDeals: boardSummary,
    tookMs: Date.now() - startedAt,
  });
  } finally {
    await releaseRunLock(db); // 2026-09-27 board deals: one run at a time
  }
  } catch (err) {
    markError(err);
    throw err;
  } finally {
    await finishJobRun(db, ctx);
  }
}

// P0.3.2 SS6 - persist the last N ingest-feed cycle summaries to the
// existing catalog_snapshot(kind) blob table (same mechanism send-digest
// uses for "digest_state"). Best-effort: observability must never break
// a discovery cycle.
const INGEST_RUN_HISTORY = 72; // ~3 days of hourly cycles

async function recordIngestRun(db, entry) {
  try {
    const { data } = await db
      .from("catalog_snapshot")
      .select("data")
      .eq("kind", "ingest_feed_runs")
      .maybeSingle();
    const prev = Array.isArray(data?.data) ? data.data : [];
    const next = [...prev.slice(-(INGEST_RUN_HISTORY - 1)), entry];
    await db.from("catalog_snapshot").upsert(
      { kind: "ingest_feed_runs", data: next, updated_at: new Date().toISOString() },
      { onConflict: "kind" }
    );
  } catch {
    /* observability must never break discovery */
  }
}

// Same whole-word candidate-index approach the scanner's sweep uses, but
// over card_catalog instead of watchlist. First trustworthy whole-word
// name+set match wins.
function matchCatalog(listing, index) {
  const words = (listing.title.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 40);
  const candidates = new Map();
  for (const w of words) {
    for (const row of index.get(w) ?? []) {
      if (!candidates.has(row.tcgplayer_id)) candidates.set(row.tcgplayer_id, row);
    }
  }
  for (const row of candidates.values()) {
    if (admitsProxyOrCounterfeit(listing, { name: row.name, set: row.set })) continue;
    if (
      listingMatchesCard(listing, {
        name: row.name,
        set: row.set,
        language: row.language,
        card_number: row.card_number,
      })
    ) {
      return row;
    }
  }
  return null;
}

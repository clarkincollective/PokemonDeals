// crossmatch-price-pilot-r1 - US raw cross-matching PRICING PILOT (off by
// default: CROSSMATCH_PRICE_PILOT=on, EBAY_US allocated runs only).
//
// WHAT IT DOES. The count-only observer (lib/crossMatchObservation) already
// examines every result an allocated run's searches return. With the pilot on
// it also keeps, bounded, the raw listings that matched exactly ONE watched
// card outside this run's normal targets. After the normal targets are
// scanned, up to PILOT_MAX_CARDS of those cards are priced through the SAME
// raw path the scan uses (scanCardInMarketplace in candidate mode: same gates,
// condition check, reference, write guard), each one REPLACING one of the
// lowest-scoring exploit targets, which is then not searched this run.
//
// SUBSTITUTION, precisely:
//   - Only exploit-lane targets are displaceable (never due producers or the
//     least-recently-searched lane), lowest score first, at most 10.
//   - Those tail targets are held back until the rest of the run is done.
//   - A tail target is displaced only at the moment a pilot card is about to
//     be priced - never in advance. Tail targets not displaced (too few
//     usable cards, pilot stopped, pilot failure) are scanned normally
//     afterwards, so no target is dropped without a replacement being
//     attempted and no target spends its allowance twice.
//   - A candidate card is attempted only if existing stored data suggests it
//     can be worth the substitution: it has a catalogue price
//     (watchlist.last_known_price) and at least one candidate listing whose
//     USD total sits below that price by the run's discount threshold and
//     above the sanity floor. This spends nothing; the live reference still
//     decides.
//
// REQUEST ACCOUNTING (per substitution). These are MAXIMUM ALLOWANCES of the
// existing code paths, not measured calls; comparing them does not show that
// actual calls are neutral.
//   displaced target (scanOneCard -> scanCardInMarketplace):
//     PPT     getConditionPrices 1 (fetchPPT: single attempt, no retry)
//             + getGradedPrice <=1 (single attempt)                   max 2 attempts
//     Browse  search 1 + raw condition getItem <=3 + graded detail <=1,
//             each <=2 attempts (fetchWithRetry: one retry on 5xx/network) max 10 attempts
//   pilot card (candidate mode, raw only, no search, no graded branch):
//     PPT     getConditionPrices 1                                     max 1 attempt
//     Browse  raw condition getItem <=3, each <=2 attempts            max 6 attempts
//   DEFINITELY avoided by displacing a target: its getConditionPrices
//     attempt (the first thing every target scan does) - 1 PPT attempt, in
//     observe/off mode where the loop always reaches the target.
//   Only HYPOTHETICALLY avoided: its search (made only if that price lookup
//     succeeds and is trusted), its raw condition getItem calls (only for
//     would-be deals), its graded detail + graded price (only if a graded
//     candidate exists), and every retry. None of these is counted as saved.
//   So per substitution the pilot card's maximum is within the displaced
//   target's maximum (PPT 1 <= 2, Browse 6 <= 10), the PPT attempt it makes
//   is matched by one definitely avoided PPT attempt, and its Browse attempts
//   (0-6) are ACTUAL spend against an avoidance that is only hypothetical.
//   The run's actual attempts are recorded; neutrality is not claimed.
//   No cap, allowance or schedule is raised: the raw condition budget per card
//   is the existing RAW_CONDITION_LOOKUP_PER_CARD, the whole run stays inside
//   the same allocated lease (a pilot card is not attempted once
//   browseLeaseExhausted() says the lease is spent), and in enforce mode
//   (not enabled) attempts beyond the lease are refused as for any target.

const PILOT_MAX_CARDS = 10;
// no pilot work once the invocation has run this long (maxDuration 800 s);
// the held-back tail is then scanned normally, as it would have been
const PILOT_START_DEADLINE_MS = 480_000;
const PILOT_STOP_DEADLINE_MS = 600_000;
const STORED_LOOKUP_CHUNK = 300;

const BROWSE_MAX_ATTEMPTS_PER_REQUEST = 2;
const PPT_MAX_ATTEMPTS_PER_REQUEST = 1;

function allowances(rawConditionLookupsPerCard) {
  const targetBrowseRequests = 1 + rawConditionLookupsPerCard + 1;
  const pilotBrowseRequests = rawConditionLookupsPerCard;
  return {
    displacedTargetMax: { pptAttempts: 2 * PPT_MAX_ATTEMPTS_PER_REQUEST, browseAttempts: targetBrowseRequests * BROWSE_MAX_ATTEMPTS_PER_REQUEST },
    pilotCardMax: { pptAttempts: 1 * PPT_MAX_ATTEMPTS_PER_REQUEST, browseAttempts: pilotBrowseRequests * BROWSE_MAX_ATTEMPTS_PER_REQUEST },
    definitelyAvoidedPerDisplaced: { pptAttempts: 1, browseAttempts: 0 },
    hypotheticallyAvoidedPerDisplacedMax: { pptAttempts: 1 * PPT_MAX_ATTEMPTS_PER_REQUEST, browseAttempts: targetBrowseRequests * BROWSE_MAX_ATTEMPTS_PER_REQUEST },
  };
}

// The displaceable tail: exploit-lane selections only, lowest score first.
function pilotTail(selected, max = PILOT_MAX_CARDS) {
  return (selected ?? [])
    .filter((s) => s?.reason?.lane === "exploit" && s._row)
    .sort((a, b) => (a.reason.score ?? 0) - (b.reason.score ?? 0) || String(a.card_tcgplayer_id).localeCompare(String(b.card_tcgplayer_id)))
    .slice(0, Math.max(0, max));
}

// Candidate cards worth a substitution, from existing data only.
//   usdTotal(listing) -> the listing's USD total (same conversion as pricing)
function rankPilotCards(cards, { usdTotal, discountThreshold, sanityFloorPct }) {
  const ranked = [];
  const notWorth = { noCatalogPrice: 0, noListingBelowCatalogPrice: 0 };
  for (const card of cards ?? []) {
    const catalog = Number(card.row?.last_known_price);
    if (!(catalog > 0)) {
      notWorth.noCatalogPrice++;
      continue;
    }
    const promising = card.listings.filter((l) => {
      const usd = usdTotal(l);
      return Number.isFinite(usd) && usd > 0 && usd <= catalog * (1 - discountThreshold) && usd >= catalog * sanityFloorPct;
    });
    if (promising.length === 0) {
      notWorth.noListingBelowCatalogPrice++;
      continue;
    }
    ranked.push({ ...card, promising: promising.length });
  }
  ranked.sort((a, b) => b.promising - a.promising || b.listings.length - a.listings.length || String(a.identity).localeCompare(String(b.identity)));
  return { ranked, notWorth };
}

// Drop every listing that has a stored row on ANY marketplace (bulk, chunked).
// A failed read drops everything: nothing is priced on unknown stored state.
async function withoutStoredListings(db, cards) {
  const ids = [...new Set(cards.flatMap((c) => c.listings.map((l) => l.listingId)))];
  const stored = new Set();
  for (let i = 0; i < ids.length; i += STORED_LOOKUP_CHUNK) {
    const { data, error } = await db.from("deals").select("listing_id").in("listing_id", ids.slice(i, i + STORED_LOOKUP_CHUNK));
    if (error) return { cards: [], storedListings: null, error: error.message };
    for (const r of data ?? []) stored.add(r.listing_id);
  }
  const kept = [];
  for (const c of cards) {
    const listings = c.listings.filter((l) => !stored.has(l.listingId));
    if (listings.length) kept.push({ ...c, listings });
  }
  return { cards: kept, storedListings: ids.filter((id) => stored.has(id)).length, error: null };
}

module.exports = {
  PILOT_MAX_CARDS,
  PILOT_START_DEADLINE_MS,
  PILOT_STOP_DEADLINE_MS,
  BROWSE_MAX_ATTEMPTS_PER_REQUEST,
  PPT_MAX_ATTEMPTS_PER_REQUEST,
  allowances,
  pilotTail,
  rankPilotCards,
  withoutStoredListings,
};

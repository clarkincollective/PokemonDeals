# eBay Browse API quota increase — request package (draft, unsubmitted)

Prepared 2026-09-10 (Phase 14S). **Preparation only — nothing in this
document has been sent to eBay.** Every number is sourced from
`docs/ebay-rate-limits.md` (Phase 14P/14Q modeling) and the current
codebase; nothing here is invented traffic, revenue, GMV, or user-count
data. Placeholders are marked explicitly where you need to fill in a
real number before submitting.

---

## 1. Recommended requested quota

**10,000 calls/day** (2x the current 5,000/day default Browse tier).

See §4 below for the full evaluation of 10k/15k/25k. 10,000/day is the
primary recommendation — it converts the current documented BORDERLINE
usage into comfortable headroom without requiring growth projections or
metrics this repository doesn't have, which makes it the safest ask to
get approved on a first request from the default tier.

---

## 2. Executive justification (1 paragraph)

PokemonDealFinder (pokemondealfinder.com) is an eBay Partner Network
affiliate deal-finder for Pokémon trading cards: server-side scheduled
jobs (never a live user page view) search and re-verify eBay Browse API
listings across 6 marketplaces, compare them against independent market
reference pricing, and surface genuine discounts with outbound affiliate
links back to eBay. The application is already on the default 5,000
calls/day Browse tier and, even after several rounds of call-reduction
engineering (a category-wide "newly listed" sweep instead of per-card
search, a bounded evidence-based scan allocator, quota-reserve floors
that shed low-priority work before ever risking exhaustion, and two
rounds of call-deduplication between routes that would otherwise ask eBay
the same question twice), modeled legitimate daily usage sits at
essentially the full 5,000/day ceiling. This request is for headroom to
keep listing discovery and price/status re-verification fresh — not
because current usage is inefficient, but because it is already tightly
optimized against the existing limit.

---

## 3. Full support-ticket version (copy-paste ready)

> **Subject: Buy Browse API — rate limit increase request (Application
> Growth Check)**
>
> **Application / use case:**
> PokemonDealFinder (pokemondealfinder.com) is an eBay Partner Network
> affiliate deal-finder site for Pokémon trading cards. It does not make
> any live, user-triggered eBay API calls — all Browse API usage is from
> server-side scheduled jobs (cron) that (1) discover newly-listed
> Pokémon card listings via `sort=newlyListed` category sweeps, (2)
> periodically re-verify the price/availability of listings already
> surfaced on the site, (3) recover seller photos and PSA/BGS/CGC grading
> details for specific listings when needed, and (4) scan a smaller
> sealed-product watchlist. Every result is compared against independent
> market reference pricing (PokemonPriceTracker) before being shown as a
> deal, and every deal links out to eBay via a standard EPN
> (`campid`/`customid`) affiliate link.
>
> **Current tier:** default Browse tier, 5,000 calls/day.
>
> **Marketplaces:** 6 — EBAY_US, EBAY_GB, EBAY_IT, EBAY_AU, EBAY_CA,
> EBAY_DE.
>
> **Why we need a higher limit:**
> Even after implementing category-wide sweep discovery (rather than a
> per-card search, which would cost far more), a bounded per-marketplace
> scan allocator, quota-reserve floors that intentionally skip
> lower-priority work before the account would ever hit 429s, and two
> rounds of call-deduplication (image-recovery and card-grading lookups
> that are now answered from data a job already fetched instead of a
> second API call), our modeled legitimate daily usage is already at
> essentially the full 5,000/day default ceiling on a normal day. When
> the reserve floor is reached, our lowest-priority job
> (`verify-deals`, which re-confirms a listing is still live and its
> price/condition are still accurate) is the first to be throttled by
> design — it does not cause an outage, but it does mean some listings'
> "last verified" timestamp ages beyond our target freshness window
> until the next day's quota resets.
>
> **Expected daily call volume:** approximately [TO BE FILLED FROM
> ebay_job_runs AFTER 7–14 DAYS — see §9] measured calls/day; modeled
> estimate (pre-measurement) is ~4,700–5,100 calls/day depending on
> optimization scenario (see the technical evidence table below).
> Requesting 10,000/day.
>
> **How we prevent inefficient or abusive usage:**
> - A pre-flight quota check (eBay's own Analytics rate-limit endpoint)
>   before every scheduled job; jobs skip themselves entirely rather than
>   firing calls that would 429.
> - Fixed per-run call caps on every job (e.g. a 20-listing batch cap on
>   re-verification, a 12-recovery cap on image recovery, a 6-lookup cap
>   on grading detail lookups per sweep).
> - No retries on HTTP 429 (only a single retry on a genuine 5xx/network
>   error) — we never compound a rate-limit condition.
> - No live, user-triggered eBay calls of any kind — the website itself
>   is served entirely from our own database; a page view never reaches
>   eBay's API.
> - Two dedicated call-deduplication passes so a listing's image or
>   grading data, once fetched for one purpose, is reused instead of
>   re-fetched for another job's purpose.
>
> **How this benefits eBay:** every listing this system surfaces links
> back to eBay via a standard EPN affiliate link; higher API capacity
> directly increases how fresh and complete that discovery/verification
> coverage can be across the 6 marketplaces we support.
>
> [PLACEHOLDER — fill in before submitting: eBay Developer Program App
> ID / Client ID, registered business or developer account name, EPN
> Campaign ID, and any traffic/GMV figures eBay's form specifically asks
> for. None of these are available in the codebase and must not be
> guessed.]

---

## 4. Short form-field version (for a compact web form)

> **App name:** PokemonDealFinder (pokemondealfinder.com)
> **API:** Buy Browse API
> **Current limit:** 5,000 calls/day (default tier)
> **Requested limit:** 10,000 calls/day
> **Use case:** Affiliate (EPN) deal-discovery and listing re-verification
> for Pokémon trading cards, across 6 eBay marketplaces, entirely via
> server-side scheduled jobs — no live user-triggered calls.
> **Why:** Modeled legitimate usage is already at ~full capacity on the
> default tier after multiple rounds of call-reduction engineering
> (category sweeps instead of per-card search, a bounded scan allocator,
> quota-reserve floors, and two call-deduplication passes). Requesting
> headroom, not requesting to skip optimization.
> **Retry policy:** single retry on 5xx only; never retries a 429.
> **Caching:** all results are cached in our own database; the public
> site makes zero live eBay calls.

---

## 5. Technical evidence table

All figures are **modeled from the current codebase and cron
configuration** (`docs/ebay-rate-limits.md`, Phase 14P/14Q), not yet
measured from production call logs — Phase 14R added the telemetry to
measure them, but the migration enabling it has not been applied yet
(see §9). Labeled "estimate" throughout; nothing here is an observed
value.

| Job | Frequency | Estimated daily calls | Business purpose | Optimization / safeguard |
| --- | --- | --- | --- | --- |
| `refresh-deals?mode=sweep` (US) | every 15 min | ~480 (estimate) | Discover newly-listed US Pokémon card listings, category-wide (not per-card) | `sort=newlyListed` sweep instead of N+1 per-card search; pre-flight quota guard; no retry on 429 |
| `refresh-deals?mode=sweep` (GB/IT/AU/CA/DE) | every 2 h, 5 marketplaces | ~480 (estimate) | Same, for 5 non-US marketplaces | Same as above |
| `refresh-deals?tier=allocated` | 2x/day x 6 marketplaces | ~1,700 (estimate; allocator's own sizing target) | Evidence-based per-card re-scan for the active watchlist, replacing two older static tiers within the same call envelope | Bounded per-run budget (`lib/scanAllocator.js`); per-(card,market) state so a card is scanned only as often as its own yield history justifies |
| `verify-deals` | every 30 min | up to 960 (estimate; `BATCH=20`) | Re-confirm a live listing's price/status/availability before it's shown as verified-fresh | Hard per-run batch cap; quota-reserve floor (`RESERVE=800`) — this is the first job throttled on a tight day |
| `screen-deal-images` | hourly | up to 288 (estimate; `IMAGE_RECOVER_PER_RUN=12`) | Recover a seller photo eBay's search response omitted, for a listing already missing one | Hard per-run cap; separate quota-reserve floor (`RECOVER_RESERVE=900`); 14-day re-screen suppression so a resolved row is never re-asked |
| `refresh-sealed-deals` | 1x/day (06:00 UTC) | ~1,164 (estimate) | Same discovery/verification model, for a smaller sealed-product watchlist (~194 products x 6 marketplaces) | Own quota-reserve floor; runs once daily, deliberately timed before the daily reset |
| `ingest-feed` | hourly, opportunistic | ~240–720 (estimate; hard cap ~960) | Independently re-verify listings named by an external discovery hint through our own Browse API + full matching/quality pipeline (nothing from the hint source is trusted directly) | Only runs when quota `remaining >= 800` — yields first to every other job; per-cycle call cap |
| Social/content pipeline | continuous | **0** | N/A | Reads only our own database + an independent pricing API; makes no eBay Browse call at all |
| Public website (user page views) | continuous | **0** | N/A | Site is served entirely from our own database; a page view never reaches eBay's API |

Fixed/predictable modeled ceiling (excludes `ingest-feed`'s opportunistic
top-up): **~5,072/day**, against the current 5,000/day limit — the
basis for the BORDERLINE assessment this request follows from.

---

## 6. Optimization / safeguard summary

Work already completed, in order, before this request was prepared:

1. **Category-wide sweep discovery** — `sort=newlyListed` scans the
   whole Pokémon-singles category in a handful of calls instead of
   searching per watchlist card, which is what makes frequent (15-minute)
   discovery affordable at all.
2. **Evidence-based scan allocator** (`lib/scanAllocator.js`) — replaced
   two older static-frequency tiers with one per-(card,marketplace)
   priority queue inside the *same* call envelope, so budget goes to
   cards that have actually been yielding deals or are overdue, not a
   fixed rotation.
3. **Quota-reserve floors** — every job checks the live remaining Browse
   quota before running and skips itself (never fires a doomed batch of
   calls) once a job-specific floor is reached; the floors are ordered so
   the cheapest, most user-visible discovery work (the sweep) yields
   last and lower-priority background work yields first.
4. **Freshness-aware image recovery** — a shared decision module
   (`lib/imageRecoveryPolicy.js`) used by both the verification and
   image-recovery jobs, so a genuinely-missing image is looked up once,
   the outcome is durably recorded, and neither job re-asks eBay a
   question the other already answered.
5. **Verify/image-recovery dedupe** — the verification job's own routine
   status check now also captures image data from the *same* call
   (previously discarded), so the separate image-recovery job frequently
   never needs to call eBay at all for that listing.
6. **Graded-detail dedupe** — a per-sweep lookup against our own already
   -stored grading data skips a second `getGradingDetails` call for a
   listing this system has already resolved, rather than re-asking eBay
   every time an already-graded listing resurfaces.
7. **No retry storms** — a single retry only on a genuine 5xx/network
   error; a 429 is never retried (retrying a rate-limit response only
   prolongs the block and burns more quota).
8. **No live, user-triggered calls** — the public website is served
   entirely from our own database. A page view, search, or filter change
   never causes an eBay API call; every call is a scheduled background
   job.

This is presented so the request is read as "we are asking for headroom
after optimizing," not "we are asking for capacity instead of
optimizing."

---

## 7. Expected daily usage estimate

Modeled (not yet measured) fixed/predictable ceiling: **~5,072/day**
before Phase 14Q's call-deduplication savings; **~4,676–4,993/day** after
those savings, depending on how much real-world call reuse actually
occurs (LOW/NORMAL/HIGH scenarios — see `docs/ebay-rate-limits.md`
§"Phase 14Q freshness-aware savings"). `ingest-feed`'s opportunistic
~240–720/day sits on top of this whenever spare quota exists on a given
day. All of these are **modeled estimates**, explicitly labeled as such
in the source documentation; none have yet been confirmed against real
call logs (Phase 14R telemetry is built but not yet collecting data —
see §9).

---

## 8. Current 5,000/day constraint — what actually happens

- Normal modeled usage sits at essentially the full 5,000/day ceiling on
  an average day — it is *tight*, not comfortably under the limit.
- On a higher-demand day (more graded/sealed matches, more marketplaces
  needing their allocated scan, `ingest-feed` finding genuine spare
  capacity), modeled usage can reach or exceed the limit.
- The quota-reserve floors exist precisely to prevent a hard 429
  exhaustion: when quota is tight, the lowest-priority job
  (`verify-deals`, then image recovery, then `ingest-feed`) is the first
  to skip its run for that cycle, in that order.
- The concrete effect of `verify-deals` being throttled: the
  `exact_verified_at` timestamp on some listings ages beyond its target
  30-minute-cadence freshness window until quota allows the job to catch
  up (usually the same day, worst case the next day's reset). Listings
  eligible for premium/flagship placement or downstream content are
  gated on how recently they were verified, so this is a **freshness
  quality** effect, not an availability effect.
- **The website itself has not gone down and does not depend on live
  eBay calls to render** — it is served from our own database
  regardless of eBay quota state. No outage has occurred or is being
  claimed here.

---

## 9. Telemetry placeholders (fill in after 7–14 days of production data)

Phase 14R (`lib/ebayTelemetry.js`, `ebay_job_runs` table) will provide
real, per-invocation measured usage once
`supabase/ebay_job_runs_migration.sql` is applied and the app runs for
long enough to average over normal day-to-day variation. **None of the
values below exist yet — do not fill these in with a guess.**

- Measured total Browse calls/day: **TO BE FILLED FROM ebay_job_runs
  AFTER 7–14 DAYS**
- Largest-consuming route/job: **TO BE FILLED FROM ebay_job_runs AFTER
  7–14 DAYS**
- Peak hour (UTC): **TO BE FILLED FROM ebay_job_runs AFTER 7–14 DAYS**
- Phase 14Q dedupe savings (image + grading, calls/day actually avoided):
  **TO BE FILLED FROM ebay_job_runs AFTER 7–14 DAYS**
- Reserve-floor skips per day (by job): **TO BE FILLED FROM
  ebay_job_runs AFTER 7–14 DAYS**
- Typical quota remaining at day end: **TO BE FILLED FROM ebay_job_runs
  AFTER 7–14 DAYS**

Once populated, `npm run ebay:quota-report` produces this summary
directly — see `docs/ebay-rate-limits.md` §"Daily report". Replacing the
modeled figures in this document with measured ones before submission
(or citing both, labeled) will make the request stronger.

---

## 10. Facts requiring manual verification before submission

These are things this document cannot know or must not guess, and that
you should confirm/fill in yourself before sending anything to eBay:

1. **eBay Developer Program App ID / Client ID** and the exact account
   name registered with eBay — not in this repository.
2. **EPN Campaign ID** and confirmation the EPN account is active and in
   good standing (a rate-limit increase request typically expects this).
3. **Real traffic/user/session numbers**, if eBay's form asks for them —
   not in this repository; do not estimate these.
4. **Real GMV/revenue/conversion figures**, if asked — not in this
   repository; do not estimate these.
5. **Business/legal entity name and contact details**, if the form
   requires them.
6. **Current measured (not modeled) call volume** — recommend applying
   the Phase 14R migration and waiting 7–14 days (see §9) before
   submitting, or clearly labeling all figures as modeled/pre-measurement
   if submitting sooner.
7. **Confirm the marketplace count (6) is still current** at submission
   time — a 7th marketplace or a removed one would change this document.
8. **Confirm the exact current form/portal questions** on eBay's
   Application Growth Check / rate-limit-increase flow at submission
   time — this document assumes the general shape of that request based
   on the existing `docs/ebay-rate-limits.md` note, not a live look at
   eBay's current form.
9. **Whether eBay requires a specific requested numeric tier** (some
   provider quota programs only offer fixed tiers, e.g. 5k/10k/25k) —
   confirm 10,000/day is an available tier before submitting; if not,
   the nearest available tier at or above 10,000/day is the fallback.

---

## Appendix — quota size evaluation (Part 4 detail)

| Requested size | Headroom vs. modeled ~5,072/day ceiling | Operational benefit | Likely justification strength | Risk of appearing excessive |
| --- | --- | --- | --- | --- |
| **10,000/day** | ~2x | Converts BORDERLINE to comfortable; absorbs high-demand days without any reserve-floor throttling; room for the already-noted FR/ES/NL marketplace expansion (see `docs/ebay-rate-limits.md`, held pending a rate-limit increase) | Strong — directly matches already-documented, already-optimized usage; no growth speculation required | Low — under 2x current usage, easy to justify line-by-line against the evidence table |
| **15,000/day** | ~3x | Generous cushion for the same marketplace expansion plus meaningfully higher sweep frequency/pages if ever pursued (not committed to here) | Moderate — defensible given the specific, already-documented FR/ES/NL expansion, but starts to require a growth narrative this repo can't fully back with real traffic data | Moderate — a bigger ask on a first request from the default tier; more likely to prompt follow-up questions |
| **25,000/day** | ~5x | Large speculative cushion; not tied to any specific, currently-planned feature or marketplace in this repository | Weak on its own — without concrete GMV/traffic/growth figures (which this document is explicitly not permitted to invent), a 5x ask is hard to justify from current evidence alone | High — likely to read as excessive for an app currently on the default tier with no measured-usage history yet |

**Recommendation stands at 10,000/day** (§1). 15,000/day is a reasonable
fallback ask only if eBay's process explicitly invites a growth
narrative and you want to fold in the FR/ES/NL marketplace-expansion
plan already noted in `docs/ebay-rate-limits.md`; 25,000/day is not
recommended for a first request without real measured-usage and growth
data behind it.

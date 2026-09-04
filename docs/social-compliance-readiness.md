# Social Automation Compliance & Approval Readiness — Phase 13D.1

**Status:** Audit / research / documentation only. No social posts published, no
API connected, no EPN application submitted, no homepage/product code touched.
Date compiled: 2026-09-05.

**Context this phase must not disturb:** the owner has an active/recent EPN
Quality Team account review. Nothing below was sent anywhere. No draft in this
document mentions PokeDealFinder.uk, and none is EPN-facing.

---

## 0. How to read this document

Every policy claim below is tagged with one of:

- **MUST** — a firm requirement if we proceed
- **MUST NOT** — a firm prohibition
- **REQUIRES APPROVAL** — allowed only after a specific written approval/toggle
- **SAFE WITH CONDITIONS** — allowed if a stated condition is met
- **UNCLEAR / ASK EPN (or provider)** — the source doesn't resolve it; do not
  assume permission
- **UNVERIFIED** — could not be confirmed against a first-party source in this
  pass (e.g. blocked fetch); do not rely on it without re-checking

Sources are first-party where reachable. Two eBay Developer Program pages
(the API License Agreement page and its 2018 PDF) returned HTTP 403 to
automated fetch — their content below is from a live web-search summary of
that same page, not a direct read, and is marked **UNVERIFIED** accordingly.
Re-fetch those directly (logged in, or via the owner's browser) before relying
on the exact wording for any decision.

---

## 1. EPN official policy audit

| # | Source (title) | URL | Date checked | Requirement | Classification | Impact on PokemonDealFinder |
|---|---|---|---|---|---|---|
| 1 | Special business models | https://partnernetwork.ebay.com/resources/special-business-models | 2026-09-05 | Messaging (email/IM/chat/text), loyalty/incentive programs, software/downloadable tools, mobile apps, sub-affiliate networks, PLA/paid traffic, and **"Promoting eBay through any generative artificial intelligence or tool (GenAI)"** each require EPN's prior written approval via a method-specific form. | REQUIRES APPROVAL | GenAI-assisted social content is squarely in this bucket. A form must be filed once we're ready — not this phase. |
| 2 | AI Tools | https://partnernetwork.ebay.com/page/ai-tools | 2026-09-05 | Where eBay Data may be shared with a GenAI tool: prior written approval required; must not input/expose eBay Data to a foundation model/LLM except under a written contract with the provider prohibiting training, retention beyond transient processing, and disclosure, requiring environmental segregation and prompt deletion. Application form fields: tool name/provider/model-version, processing region(s), purpose, automation level, human-in-the-loop, PII/customer/confidential-data involvement, volume/frequency/duration, disclosure presentation, expected business metrics, plus model accuracy/bias due-diligence. | REQUIRES APPROVAL | This is the gating requirement for any workflow where eBay-derived data (title, price, bid, image) is passed to an LLM or image model. See §2 worksheet and §5 data boundary. |
| 3 | Network Agreement | https://partnernetwork.ebay.com/page/network-agreement (also /legal) | 2026-09-05 | Must disclose economic interest; **MUST NOT** cookie-stuff, generate artificial/bot traffic, cloak URLs via middle servers, or frame/redirect so a visitor can't tell they left eBay; the destination URL **must** appear in the browser address bar; EPN Transaction Data may be used **only** for attribution/performance analysis — **not** audience segmentation or retargeting; EPN can audit at will and terminate on 3 days' notice without cause. | MUST / MUST NOT | Confirms: no auto-redirects (§9), no using PostHog/EPN click data to build audience segments for ad retargeting, and that the relationship is at-will — build nothing that assumes permanence. |
| 4 | Code of Conduct | referenced from Network Agreement / partnernetwork.ebay.com/legal (exact standalone URL not resolved this pass) | 2026-09-05 | Lists Unacceptable Placements (adult content, firearms, discriminatory content, etc.) and prohibited practices (roundtripping, links only outside eBay properties, no eBay-branded domains/handles). | MUST NOT | Not a risk for a Pokemon-card content account, but our account/domain naming must never imply eBay affiliation beyond the disclosed partner relationship. |
| 5 | Software Applications and Downloadable Tools | https://partnernetwork.ebay.com/page/software-applications-and-downloadable-tools | 2026-09-05 | Approval required for **installed** apps/extensions/plugins, not for an ordinary website. | SAFE WITH CONDITIONS | Confirms this category does **not** capture PokemonDealFinder.com itself or a scheduling tool like Buffer (nothing is installed on the end user's device). GenAI approval (#2) is the relevant gate for the *social* workstream, not this one. |
| 6 | Affiliate disclosure FAQ | https://partnernetwork.ebay.com/resources/affiliate-disclosure-faq | 2026-09-05 | Disclosure must be as close to the promotional content/link as possible; a footer/ToS/About-page-only disclosure is **not** sufficient; video disclosure must be embedded in-frame, readable, and present near the relevant section, not just linked. | MUST | Governs caption structure — see §10. |
| 7 | Phrases and hashtags approved/not approved | https://partnernetwork.ebay.com/resources/phrases-and-hashtags-approved-not-approved-for-use-in-affiliate-disclosure | 2026-09-05 | Approved: "Ad", "Paid Ad", "Advertising:", "Advertisement", "Paid Post by eBay", "Paid Link". Not approved: "#eBayad", "#Endorsement", "#Partner", "Affiliate Link", "Buy Now", "Commissionable Link", "Gifted" alone, etc. | MUST / MUST NOT | Directly usable in §10's reusable disclosure pattern. |
| 8 | Step 5: Knowing the rules | https://partnernetwork.ebay.com/solutions/step-5-knowing-the-rules | 2026-09-05 | No mystery-deal links; no eBay-confusing domain/handle names; no bidding on "eBay" as a paid search term; links only outside eBay properties; roundtripping banned; legally-required disclosures must accompany promotion. | MUST NOT | None of this is currently at risk, but it constrains future paid-traffic ideas (out of scope — paid traffic itself needs its own approval per #1). |
| 9 | Common missteps to avoid | https://partnernetwork.ebay.com/solutions/common-missteps-to-avoid | 2026-09-05 | Explicit: **"cannot auto-redirect from your domain to eBay using an affiliate link"**; logo must be used unmodified from the Creative Gallery; no eBay-term domain registration; disclosure hashtags (#ad/#advertisement/#sponsored) required on social. | MUST NOT | Directly confirms the brief's own stated principle in §9 — the eventual journey must never auto-redirect; the user must click through knowingly. |
| 10 | eBay Developer Program API License Agreement | https://developer.ebay.com/join/api-license-agreement (direct fetch: HTTP 403 — **UNVERIFIED**, from search summary only) | 2026-09-05 | Per search summary: eBay Content in a "Public Display" **may not be co-mingled with non-eBay Content** and must be **visually isolated** from third-party/non-eBay information; Restricted API data may not be resold/shared/redistributed to third parties, raw or aggregated; Application Keys may not be shared with third parties. | REQUIRES APPROVAL / UNCLEAR | This is the single most important open question for image use in social creative — see §7. **Re-fetch this agreement directly (authenticated) before finalizing any social-image approach**; this pass could not read it first-hand. |

**No page found** (this pass) addressing eBay-specific "social media" promotion as its own named policy distinct from the general Network Agreement/Code of Conduct — social posting is governed by the same disclosure, redirect, and GenAI rules above, not a separate ruleset. Flag as **UNCLEAR / ASK EPN** only if a dedicated social policy exists that wasn't surfaced; nothing found contradicts that assumption.

---

## 2. EPN AI Tools field-by-field readiness worksheet

**Not submitted. For preparation only.** Every "likely truthful answer" below is
a draft to validate later, not a final answer — do not treat it as filed.

| EPN asks | Likely truthful answer (draft) | Technical decision needed first | Evidence/documentation to have ready |
|---|---|---|---|
| Website/tool URL | `https://pokemondealfinder.com` | none | — |
| GenAI tool/provider | Not yet selected | Choose provider(s) per §21 | Provider's commercial-use + data-retention terms |
| Model/version | Not yet selected | Same as above | — |
| Countries/regions where eBay data is processed/stored | Depends on provider's inference region | Pick a provider with an EU/US region matching our existing PostHog EU-only posture, or confirm no eBay Data ever reaches the model at all (see §5) | Provider's data-residency documentation |
| Purpose of the GenAI tool | Draft social-caption and/or layout assistance for evidence-based deal/market content | Decide exact scope: caption text only? Layout only? Never image content? | This document (§20 architecture) |
| Internal vs customer-facing use | Customer-facing (published social captions/graphics), but **draft-only** until a human approves | Confirm Level A/B (not C) is the launch model — see §3/§4 | — |
| Automation level | Candidate selection + draft generation automated; publishing is human-gated (Level B) | Finalize per §4 | — |
| Whether human review occurs before publication | Yes — every post requires human approval before it goes out | Build the approval gate before any publishing integration | Internal review-log requirement (§20) |
| Expected GenAI outputs | Caption text; possibly structured copy for a template (not raw image generation of card art) | Confirm §22's "no AI card-artwork" decision holds | — |
| What eBay data/information is supplied to the model | **Target: none**, or only already-public, non-identifying structural facts (price, % below reference, timeframe) — never seller info, never raw eBay item IDs in the prompt unless proven necessary | Design the caption generator so eBay-derived numbers are computed in code and only the *already-decided sentence structure* (or none) touches the LLM — see §5 and §20 | Prompt-construction code, once built, should be inspectable to prove this |
| Whether PII/customer/confidential information is involved | No — no PII is collected or processed anywhere in this pipeline (matches the site's existing privacy posture) | none | `app/privacy/page.js` (already accurate) |

**This worksheet cannot be completed today** because no GenAI provider, no
publishing integration, and no automation code exist yet. It exists so that
once the current EPN Quality review resolves and a provider is chosen, the
form can be filled truthfully without a scramble.

---

## 3. Three automation levels

### Level A — data automation, human publish
System detects candidates + drafts a visual/caption; a human manually posts
using the native Instagram/TikTok app (or Buffer's "notification publish").

- **EPN implication:** Lowest risk. No GenAI-to-EPN approval is even
  triggered if drafting uses no GenAI (pure template + our own ranking data);
  if a GenAI caption assist is used, the AI Tools approval (§1 #2) still
  applies regardless of how much of the pipeline is "automated," because the
  approval gate is about *whether eBay Data reaches GenAI*, not about
  publish-automation level.
- **Meta/TikTok implication:** No API integration needed at all for
  publishing (human posts natively) — lowest platform-policy surface.
- **Risk:** Lowest.
- **Operational burden:** Highest (a person manually posts every item).
- **Verdict:** Safe starting point; does not by itself avoid the GenAI
  approval question if GenAI is used anywhere in drafting.

### Level B — data + creative automation, human approval
System selects, generates the graphic, generates the caption, prepares the
disclosure text and link, and queues it. A human must explicitly approve
before it publishes (via Buffer or the native Content Publishing/Content
Posting APIs).

- **EPN implication:** REQUIRES APPROVAL if any GenAI touches eBay Data at
  any stage (§1 #2) — the human-approval step does not remove that
  requirement, it only affects the "automation level" and "human-in-the-loop"
  fields on the form.
- **Meta/TikTok implication:** Requires real API integration (App Review for
  Instagram; Direct Post audit for TikTok, see §11–§12) plus the disclosure
  toggle workflow.
- **Risk:** Moderate — a human still gates every post, so a wrong fact or bad
  disclosure is caught before publish, but the system is now a real
  publishing pipeline subject to platform review and rate limits.
- **Operational burden:** Moderate.
- **Verdict:** The realistic target model, once the current EPN review is
  clear and the AI Tools approval (if GenAI is used) is granted — see §4.

### Level C — full automatic publishing
No pre-publication human approval; system posts, schedules, and updates on
its own.

- **EPN implication:** Nothing found forbids full automation outright, but
  the AI Tools form explicitly asks for "automation level" and whether
  "Human-in-the-Loop" oversight exists — a "no human review" answer is a
  materially different (and less favorable) application than Level B's.
  Given the current EPN Quality review is unresolved, this is the highest-risk
  choice to lead with.
- **Meta/TikTok implication:** Both platforms' publishing APIs technically
  support it; Meta's Platform Terms bar undisclosed automated access but the
  official Content Publishing API is exactly the sanctioned path for this —
  the concern is the *quality/accuracy* backstop a human review removes, not
  a policy violation by itself.
- **Risk:** Highest — a factual error (stale price, ended auction, wrong
  card) or a disclosure mistake goes live with nobody catching it first,
  directly touching the truth-contract in §16/§17 and the freshness
  requirement in §18.
- **Operational burden:** Lowest, once built and trusted.
- **Verdict:** **Do not launch at Level C.** Not assumed acceptable, and not
  recommended as a starting point regardless of EPN status.

---

## 4. Recommended initial human-oversight model

**Level B, with one refinement:** automated candidate selection → automated
evidence re-validation (fresh price/bid/still-active check, immediately
before the draft is generated, not at selection time) → automated draft
creative (template-based, not freeform GenAI image generation — §22) →
automated disclosure-gate check (the post cannot be queued for approval
without a compliant disclosure already attached) → **human review and
approval** → scheduled/approved publish via the official API.

This is preferred over Level A once volume justifies it, because Level A's
"human posts manually" step is also a silent evidence-freshness gap (time
passes between drafting and manual posting, during which a deal can end). A
approval-gated automated *publish* step (Level B) can be built to re-check
freshness at the moment of publish, which a manual Level A workflow cannot
guarantee. This is a design conclusion, not yet implemented — no publishing
code exists.

---

## 5. eBay data boundary

| eBay-derived field | Scoring/selection | Caption/copy | Image generation | Chart/social graphic | Send to GenAI at all? |
|---|---|---|---|---|---|
| Listing title | SAFE TO PROCESS | SAFE TO DISPLAY (already shown on-site) | — | SAFE TO DISPLAY as plain text | DO NOT SEND TO GENAI without the §1 #2 approval |
| Listing price | SAFE TO PROCESS | SAFE TO DISPLAY | — | SAFE TO DISPLAY | DO NOT SEND TO GENAI without approval |
| Current auction bid | SAFE TO PROCESS | SAFE TO DISPLAY, but **must** be re-fetched immediately pre-publish (§18) and always framed as "current bid — can rise," never a final price | — | SAFE TO DISPLAY with the same framing | DO NOT SEND TO GENAI without approval |
| Item image | SAFE TO PROCESS (internal use, matches current site behavior) | — | **REQUIRES EPN CONFIRMATION** — do not composite an eBay listing photo into a branded graphic (own logo/headline/chart in the same image) until the "visually isolated from non-eBay content" clause (§1 #10) is resolved with EPN directly | Same REQUIRES EPN CONFIRMATION | DO NOT SEND TO GENAI (no derivative/generative use of an eBay photo) |
| Seller information | SAFE TO PROCESS (existing trust checks only) | DO NOT PUBLISH | — | DO NOT PUBLISH | DO NOT SEND TO GENAI |
| eBay item ID | SAFE TO PROCESS | DO NOT PUBLISH as a headline fact (fine incidentally inside our own `/deals/[id]` URL, which is not an eBay property) | — | DO NOT PUBLISH | DO NOT SEND TO GENAI |
| Marketplace / country | SAFE TO PROCESS | SAFE TO DISPLAY (avoids misleading a different-region audience) | — | SAFE TO DISPLAY | Low risk if sent, but default to DO NOT SEND until approval exists |
| Affiliate URL | SAFE TO PROCESS (server-side only) | **DO NOT PUBLISH** the raw eBay affiliate URL as a social CTA target — the CTA must point to our own site (§9) | — | DO NOT PUBLISH | DO NOT SEND TO GENAI |
| Condition | SAFE TO PROCESS | SAFE TO DISPLAY | — | SAFE TO DISPLAY | DO NOT SEND TO GENAI without approval |
| Shipping | SAFE TO PROCESS | SAFE TO DISPLAY (total-price framing, matches methodology) | — | SAFE TO DISPLAY | DO NOT SEND TO GENAI without approval |
| Sold/completed listing data | **Not applicable** — PokemonDealFinder does not query eBay's sold/completed listings; `lib/ebay.js` only calls the Browse API for live listings. Our "market reference" comes from PokemonPriceTracker (a separate contract — see §6), not from eBay directly. | | | | |

**Governing principle:** until the EPN AI Tools approval exists, the social
pipeline's architecture should keep eBay-derived data **out of any GenAI
prompt entirely** — captions referencing price/discount/bid should be
generated by deterministic string templates in our own code (the same
pattern already used for `lib/flagshipRanking.js`-style deterministic
outputs), not by asking an LLM to phrase a sentence containing eBay facts.
This keeps Level A/B fully buildable pre-approval, with only the "generate a
caption headline in our own voice" (no eBay facts inside the prompt) or
"suggest a template layout" kind of GenAI use available before that approval
is filed.

---

## 6. PokemonPriceTracker (PPT) data licensing

Source: https://www.pokemonpricetracker.com/terms (fetched 2026-09-05).

- Commercial use requires the Business plan (already held).
- Terms explicitly **prohibit** reselling/redistributing "the raw data itself
  as a standalone product," and prohibit bulk retrieval anticipating
  cancellation.
- Terms explicitly **permit** caching PPT data "in your own systems" and
  serving it "to the end users of your own application," with a "reasonable"
  refresh cadence.
- **No attribution requirement is stated.**
- **The terms do not explicitly address off-platform social-media
  distribution of derived figures** (market price, % change, price-history
  chart) as distinct from display "within your own application."

| Content type | Classification |
|---|---|
| Market price shown on PokemonDealFinder.com (existing use) | Covered — matches "serve to end users of your own application" |
| Percentage movement / 7-day / 30-day change **on the website** | Covered, same basis |
| Aggregated price-history chart **on the website** | Covered, same basis |
| Any of the above **reproduced in an Instagram/TikTok graphic** (a surface outside pokemondealfinder.com) | **REQUIRES PROVIDER CONFIRMATION** — plausibly still "derived display for your own application's users" if the graphic always links back to the site and never stands alone as a redistributable dataset, but the terms don't say this in words. Do not assume. |
| Grade-comparison figures (raw vs. graded reference values) | Same REQUIRES PROVIDER CONFIRMATION as above |
| Raw/bulk data export for any purpose | DO NOT — explicitly prohibited |

**Action before Phase 13E:** a short, direct written confirmation from
PokemonPriceTracker that derived/aggregated figures may appear in the site's
own social media marketing (with the same "not raw data" boundary already
respected on-site) closes this gap cheaply. Not sent this phase.

JustTCG is also a listed provider (`app/privacy` service-providers list);
its terms were not audited this phase because PPT is the primary
price/catalogue source per the current architecture — if JustTCG-derived
figures are ever used in social content specifically, its terms need the
same review before Phase 13E, not assumed equivalent to PPT's.

---

## 7. Card image rights matrix

| Source | Website display status | Social display status | Derivative/GenAI status | Attribution required? | Risk | Action needed |
|---|---|---|---|---|---|---|
| eBay listing images (via Browse API) | Existing, established use | **REQUIRES EPN CONFIRMATION** (see §1 #10, §5) — likely fine as a standalone, unmodified photo with a clear "view on eBay" link; likely **not** fine composited with our own logo/text/chart in one image | DO NOT — no cropping/recomposing/generative alteration of an eBay photo | Not currently attributed per-image beyond the outbound eBay link | Medium (policy is genuinely ambiguous, and eBay controls the affiliate relationship) | Verify the "visually isolated" clause directly with EPN or eBay Developer support before any composited use; until then, if an eBay photo appears in social creative at all, show it unmodified with nothing else in the frame |
| PokemonPriceTracker catalogue images (if used) | Existing, established use per PPT license | **REQUIRES PROVIDER CONFIRMATION** — same gap as §6; PPT's terms don't address off-site image redistribution | REQUIRES PROVIDER CONFIRMATION for any GenAI-assisted cropping/compositing | Follow whatever PPT confirms | Medium | Ask PPT the same question as §6, extended to images specifically |
| TCG official card images (if used anywhere) | Not currently a stated site source per files reviewed this phase | DO NOT assume any rights beyond what's licensed | DO NOT | Would depend entirely on the specific licensing terms of whichever source is used | High if used without a confirmed license | Do not introduce a new TCG image source for social without first identifying and reading its specific terms |
| Owner-created graphical elements (templates, charts we render ourselves from our own data, backgrounds, headline typography) | N/A — these are ours | SAFE | SAFE (we may use GenAI to help design *our own* template elements, since no third-party data/IP is in that prompt) | No | Low | This is the safest visual content to build the identity around — see §14/§15 |
| AI-generated recreations of Pokemon characters/card artwork | Not used | **DO NOT** by default (§22) | **DO NOT** | N/A | High (copyright + trademark, see §8) | Do not build this; use template layouts over properly licensed source imagery (a real eBay listing photo shown unmodified and isolated, or nothing at all) instead |

**Do not assume social redistribution rights follow from website display
rights** for any of the first two rows — each is a separate, unconfirmed
question even though the underlying website use is already established and
working today.

---

## 8. Trademark / brand safety guardrails

No logo redesign this phase — guardrails only, preserving the existing
red/white, magnifying-glass, no-Poké-Ball identity.

| Element | Rule |
|---|---|
| "Pokemon" word mark | Usable descriptively (as the current site already does, unaccented per house style — see [[pokemon-deals-spelling]]) to describe the subject matter; **must not** be styled to look like the official Pokemon Company wordmark/logo treatment |
| Poké Ball / Pokéball imagery | **MUST NOT** appear anywhere in PokemonDealFinder's own branding, avatar, templates, or watermark — preserves the existing deliberate choice |
| Nintendo / The Pokemon Company / Creatures Inc. / Game Freak logos | **MUST NOT** be used anywhere in owned social creative |
| Official-looking typography (the specific Pokemon logo font/style, card-frame chrome) | **MUST NOT** be mimicked in templates — avoid implying official affiliation through style alone, not just through logo use |
| eBay logo | **MUST** be used only exactly as downloaded from eBay's Creative Gallery, unmodified (§1 #9), and only where an eBay affiliate mention is being made — not as decorative branding |
| Misleading affiliation | Every profile bio / pinned post should carry the same disclaimer already live on the site ("independent tool... not affiliated with, endorsed by, or operated by Nintendo, The Pokemon Company... or eBay beyond the affiliate relationship") — carry this language forward, don't invent new wording |
| Pokemon character artwork (official illustrations from the cards themselves) | Showing an **unmodified, real eBay listing photo** of a real card (which incidentally contains official artwork, as any photo of the physical card would) is different from **generating new** artwork or isolating/repurposing the character art outside the context of "here is the actual listing" — the former is what §7's "safe if unmodified/isolated" row already covers; the latter is prohibited under §22 |

---

## 9. Affiliate link journey

Two journeys assessed separately, as instructed — they are **not**
equivalent under EPN policy.

### A. Social post → PokemonDealFinder page → intentional eBay click (preferred)
- The post links to our own domain (a card/deal/landing page).
- The visitor reads real evidence (current price, market reference, freshness
  timestamp) on our page.
- The visitor then knowingly clicks a "View on eBay" / "Bid on eBay" button —
  our existing `AffiliateLink.js`, unchanged, already does exactly this (an
  explicit `<a>` with `rel="sponsored"`, no redirect, no interstitial trick).
- **EPN assessment:** consistent with every rule found in §1 — no
  auto-redirect, disclosure can live on our own page (`/affiliate-disclosure`,
  already built) *and* in the social caption per §10, "mystery deal" concerns
  don't apply because the destination and nature of the click are obvious
  before the user leaves our page.
- **Classification: SAFE WITH CONDITIONS** — conditions being: disclosure
  present in the social caption itself (not just on our page — §1 #6), and
  the landing page must still be accurate/fresh when clicked (§18/§19).

### B. Social post → direct EPN eBay affiliate URL
- The social post's own link (bio link, "swipe up," in-caption URL) points
  straight at an eBay affiliate URL, skipping our site entirely.
- **EPN assessment:** not prohibited by name in anything found this pass, but
  it inherits every disclosure requirement with **no intermediate page to
  carry it** — the *entire* disclosure burden falls on the caption/creative
  itself, and Instagram/TikTok's own in-app disclosure tooling (paid
  partnership label / commercial content toggle, §11–§12) would need to be
  used since there's no landing page to do that work. It also forfeits our
  own evidence-freshness page (§19) as the safety net for an expired deal —
  a dead direct link just 404s or shows a sold-out eBay page with zero
  explanation.
- **Classification: SAFE WITH CONDITIONS, but structurally worse** — not an
  EPN violation by itself, but strictly inferior to Journey A for both
  compliance clarity and user trust. Recommend building toward Journey A only.

**Confirmed:** PokemonDealFinder must not auto-redirect at any point in
either journey (§1 #9) — the user always makes an explicit, visible click to
leave for eBay.

---

## 10. Affiliate disclosure — conservative reusable pattern

Jurisdictions considered: **US (FTC)**, **UK (ASA/CAP)**, **Australia
(ACCC/AANA)** — sources in §1-adjacent research below. This is not legal
advice; it is a conservative pattern that satisfies the strictest reading
found across all three.

| Requirement | US (FTC) | UK (ASA/CAP) | Australia (ACCC/AANA) |
|---|---|---|---|
| Must be near the link/claim, not just in bio/ToS | Yes — "the closer... the better"; bio-only is inadequate | Yes — must be "upfront," not buried | Implied by "clear, obvious, upfront" standard |
| Vague terms rejected | "Affiliate link," "Commissionable link," "Buy now" alone are inadequate | "*affiliate" alone, "#collab," spaced-out "a d/affiliate" rejected | Platform tools (e.g. Instagram's Paid Partnership label) or #Ad/#Sponsored expected |
| Accepted minimum wording | "Paid link" placed directly next to the link; or a plain compensation statement | "#Ad" / "Ad" | #Ad, Advert, Advertising, Branded Content, Paid Partnership, Paid Promotion |
| Timing | Should accompany the recommendation itself | Must be identifiable **before** engagement | "Upfront" |

**Reusable pattern (conservative superset of all three):**

1. **In the caption**, as the *first line or within the first visible line
   before "see more" truncation*: `Ad · PokemonDealFinder is an eBay Partner
   — this post may contain affiliate links.` (Avoid "collab," "affiliate
   link" alone, "#partner," and any hashtag-only disclosure per §1 #7's
   not-approved list.)
2. **In the creative itself**, when the post's whole purpose is a specific
   deal (not just brand awareness): a small, legible "Ad" or "Sponsored"
   label baked into the image/video, not only in the caption — satisfies the
   UK "identifiable from the content itself" concern and TikTok's/Meta's own
   in-app labeling separately (see §11/§12).
3. **Platform-native disclosure toggle MUST also be used** where the
   platform provides one (TikTok's Commercial Content Disclosure toggle;
   Instagram's Paid Partnership label if applicable) — §12 confirms TikTok
   explicitly classifies affiliate-commission content as Branded Content
   requiring this toggle; this is additive to the caption text, not a
   substitute for it.
4. **On PokemonDealFinder itself**, the existing `/affiliate-disclosure` page
   and the per-click `rel="sponsored"` attribute already satisfy the
   on-site half of this — no change needed there.
5. **Before marketplace departure**, the existing "View on eBay" button
   pattern (an explicit, visibly-labeled outbound link, never an auto-click)
   already satisfies "the user must knowingly choose."

---

## 11. Instagram / Meta automation

Sources: Meta for Developers (Instagram Platform, Content Publishing),
2026-09-05.

- **Legitimate publishing path:** the official Instagram Content Publishing
  API (Graph API), a two-call flow — create a media container, then publish
  it.
- **Eligible account type:** Instagram professional (Business or Creator)
  account connected to a Facebook Page; requires Page Publishing
  Authorization and a registered Meta developer app.
- **Automation permissions:** requires `instagram_content_publish` (or the
  business-content-publish equivalent) and **Meta App Review** to move past
  a 25-test-user cap into production access.
- **Carousel support:** yes, up to 10 images/videos per carousel; all items
  crop to the first item's aspect ratio.
- **Reels support:** yes, via `media_type=REELS`. Stories: supported via
  `media_type=STORIES` per the docs (contradicts an older "stories not
  supported" claim seen in a secondary source — treat the official docs
  page, which explicitly lists a Stories media type, as authoritative).
- **Rate limits:** 100 API-published posts per rolling 24 hours per account;
  a carousel counts as one post; checkable live via
  `GET /{ig-user-id}/content_publishing_limit`.
- **Caption/link constraints:** nothing unusual found beyond normal Instagram
  caption limits; links in captions are not clickable (Instagram's long-
  standing platform behavior) — the CTA must live in the bio link or a
  Story/Reel "link sticker," not assumed clickable in-caption.
- **Third-party scheduling compatibility:** the API itself is
  publisher-agnostic; Buffer (§13) uses this same official API, not scraping.
- **Prohibited scraping/botting:** Meta's Platform Terms bar automated
  data-collection or automated actions **without prior permission** — the
  official Content Publishing API **is** that permission for publishing;
  nothing here authorizes scraping engagement/analytics data outside the
  API.
- **Classification:** REQUIRES APPROVAL (Meta App Review) but a
  well-trodden, standard path — not unusual or risky by itself.

---

## 12. TikTok automation

Sources: TikTok for Developers (Content Posting API, Content Sharing
Guidelines), TikTok Branded Content Policy, 2026-09-05.

- **Official publishing API:** Content Posting API, with a "Direct Post"
  mode (posts straight to the creator's profile) and an "Upload" mode
  (drafts for manual finishing in-app).
- **Account/app approval:** an unaudited API client's Direct Post uploads
  are restricted to **private-only** visibility; a compliance **audit** is
  required to lift that and post publicly.
- **Video/photo capabilities:** both video and photo posts are supported via
  the API (photo support added more recently than video).
- **Automated publishing restrictions:** a shared per-creator daily posting
  cap (commonly cited around 15/day) applies across all API clients using
  Direct Post for that account — this bounds how much a single account can
  ever publish per day regardless of our own automation level.
- **Disclosure requirements — the single most load-bearing TikTok finding
  this phase:** TikTok's own documentation states that **content earning a
  commission via an affiliate link is, by definition, "Branded Content"** and
  **requires the Commercial Content Disclosure toggle to be enabled at post
  time** — this is not optional and not satisfied by a caption alone. Posts
  detected as commercial without disclosure get flagged (and their reach
  limited) within hours per TikTok's enforcement update.
- **Commercial-content settings:** when the toggle is on, visibility must be
  Public or Friends (not Private), and posting requires acknowledging the
  Branded Content Policy.
- **Music/licensing:** commercial/branded videos must use only TikTok's
  Commercial Music Library — a normal trending-sound track risks being muted
  or the post being restricted; this constrains creative production.
- **Scheduling-tool implications:** Buffer can auto-publish videos that meet
  TikTok's own publishing requirements; anything needing TikTok-only
  in-app effects still needs manual "notification publish."
- **Classification:** REQUIRES APPROVAL (API client audit) + MUST (disclosure
  toggle on every affiliate-linked post) + a real production constraint
  (Commercial Music Library only).

---

## 13. Buffer

- **Instagram support:** yes — feed posts, carousels, Reels; first-comment
  scheduling on paid plans.
- **TikTok support:** yes — auto-publish for videos meeting TikTok's API
  requirements; anything needing native-only effects falls back to
  "notification publish" (a push reminder, human finishes it in-app).
- **API availability:** Buffer's publishing is itself built on the official
  Instagram Graph API and TikTok Content Posting API — not a workaround.
- **Approval flow:** connecting each platform still goes through that
  platform's own OAuth/App Review process; Buffer doesn't bypass §11/§12.
- **Media/carousel/video limits:** inherits the underlying platforms' limits
  (10-item Instagram carousel, etc.).
- **Human approval retained:** yes — Buffer supports a draft/pending-approval
  queue state before a post goes live, which is exactly the Level B gate in
  §3/§4.
- **Classification:** SAFE WITH CONDITIONS — Buffer itself introduces no new
  EPN or platform-policy exposure beyond what the underlying platforms
  already require; it's a scheduling convenience, not a compliance
  workaround. No purchase/integration decision made this phase.

---

## 14. Creative reference framework (PriceCharting / Collectr — analytical only)

Framework for future study, built from the dimensions the owner already
named — **no scraping, no reproduction of their actual posts.**

| Dimension | Categories to classify future references against |
|---|---|
| Hook type | biggest movers / biggest losers / "this card exploded" / weekly recap / hidden opportunity / grade spread / market anomaly |
| Data unit | percentage / dollar increase / raw price / graded (e.g. PSA 10) price / price-history trend / recent sale / live opportunity |
| Slide structure | hook → item 1 → item 2 → item 3 → summary → CTA (or variants) |
| Visual hierarchy | headline / card image / large number / timeframe / chart / supporting evidence / branding placement |
| CTA type | follow / visit / check value / browse deals / see current listings |

This table is a lens for analyzing *inspiration*, not a spec to fill in with
their content. PokemonDealFinder's own pillars (§15) and truth contracts
(§16/§17) are what actually get built — this framework only helps recognize
*which structural idea* (e.g. "weekly movers," not their exact typography or
copy) is worth adapting in our own voice.

---

## 15. PokemonDealFinder original content pillars

| Pillar | Required data | Rights dependency | EPN dependency | Risk | Automation suitability | Likely format | Likely CTA |
|---|---|---|---|---|---|---|---|
| Deal of the Day | One verified live BIN deal (reuses `lib/flagshipRanking.js`-style quality, not raw discount%) | eBay image (isolated, per §7) | GenAI approval only if any AI touches the caption/eBay facts | Low–Medium (image-comingling question, §7) | High (Level B) | Single image/short video | "See this deal" → our `/deals/[id]` page |
| Biggest Deals Found Today | 3–5 live deals | Same as above, ×N | Same | Low–Medium | High | Carousel, one card per slide | "See more deals" → `/deals` |
| Weekly Market Movers | PPT price-history % change over a defined window | **REQUIRES PPT confirmation (§6)** before launch | GenAI approval if AI drafts the caption | Medium (licensing gap open) | Medium | Carousel or single chart graphic | "See current listings" → `/pokemon/[slug]` or `/cards/[slug]` |
| Raw vs Graded | PPT reference values for both | Same PPT gap as above | Same | Medium | Medium | Comparison graphic (our own template, no eBay photo needed) | "Compare on PokemonDealFinder" |
| What $50 / $100 / $250 Can Buy | Live verified deals within a price band | eBay image question (§7) | Same as Deal of the Day | Low–Medium | High | Carousel | "Browse this price band" → `/deals` filtered |
| Auction Watch | Live auction + current bid, explicitly labeled "can rise" | eBay image question (§7); **must** re-verify bid freshness at publish (§18) | Same | Medium (freshness-sensitive) | Medium (needs the tightest pre-publish re-check) | Single image/video | "Watch this auction" → `/deals/[id]` |
| Card Market Snapshot | PPT historical movement, no live deal required | REQUIRES PPT confirmation (§6) | GenAI approval if AI-drafted | Medium | High (evergreen, not freshness-sensitive) | Chart graphic (our own template) | "See full price history" → card hub |
| Pokemon Spotlight | One species across sets/deals (reuses `/pokemon/[slug]` data) | Mixed — some eBay images, some PPT catalogue images (§7 rows 1–2) | Depends on which images used | Low–Medium | High | Carousel | "See all `<Pokemon>` cards" → `/pokemon/[slug]` |
| Set Spotlight | One set's live opportunities (reuses `/sets/[slug]` data) | Same as above | Same | Low–Medium | High | Carousel | "Browse this set" → `/sets/[slug]` |

No content is generated from this table this phase — it is a menu to select
from once §5–§7's open items close.

---

## 16. Deal content truth contract

**Deterministic rules — enforced in copy templates, not left to a GenAI
model's discretion:**

1. A live deal is always stated as a **current, time-bound fact**: "Current
   listing: $X" / "Market reference: $Y" / "Currently N% below our market
   reference" / "Price checked at [freshness timestamp]."
2. An auction's current bid is **never** presented as a final price — always
   paired with "current bid — can rise" or equivalent, matching the site's
   existing `lib/auctionLaneRanking.js` framing (never calling a gap a
   "saving").
3. **Never** use: "guaranteed profit," "easy $X profit," "free money," "this
   will double," "buy before it's too late," "guaranteed undervalued," "you'll
   make money," or any paraphrase with the same guarantee/scarcity meaning.
4. **Never** fabricate urgency ("only 1 left," countdown pressure) that isn't
   a real, currently-true fact about the listing.
5. **Never** state a specific profit number implying resale certainty (e.g.
   "$39 profit") — the gap to reference is evidence of a price difference,
   not a promised outcome.
6. Every "deal" claim must be re-verified for freshness immediately before
   publish (§18) — a template producing a truthful sentence about stale data
   is still a false claim at publish time.

This mirrors and extends the phase 13C truth-contract language already
established for `flagshipRanking`/`auctionLaneRanking` — no new philosophy,
just extended to social copy.

---

## 17. Price-movement truth contract

- **Allowed (historical observation):** "Market reference increased 18% over
  the last 30 days," always with an explicit, defined start/end window and
  sourced from PPT's price-history data.
- **Not allowed without a defined predictive model and evidence backing it**
  (which does not exist and is out of scope): "this card is going to
  explode," "will keep rising," "smart investment," or any forward-looking
  claim framed as fact rather than history.
- **Rule:** a historic-movement sentence must never be the *premise* for an
  implied future promise in the same post — if a caption states a 30-day
  change, it should not be immediately followed by language that reframes
  that change as a forecast.

---

## 18. Data freshness requirements (design only — no worker built)

| Fact type | Freshness rule |
|---|---|
| Live BIN deal | Must be re-verified (still active, same price) **immediately before publish**, not just at candidate-selection time |
| Auction | Must be re-confirmed still active and its current bid re-fetched immediately before publish; if it has ended between selection and publish, the post must not go out as "live" |
| Market price | Must carry a source timestamp / freshness indicator in the underlying data used, consistent with the site's existing "accurate as of the listing's last scan" language |
| Price movement | Must use one clearly defined start/end window (e.g. "last 30 days" computed from fixed calendar dates, not a vague "recently") |

No stale "deal" post should keep implying a live opportunity after that
listing has ended — this is a hard requirement for whatever publish-gate
code is eventually built (Level B's approval step, §4), not merely a
guideline.

---

## 19. Expired social content (concept only — no site change this phase)

**The problem:** an Instagram/TikTok post is effectively permanent; the eBay
listing it featured is not. Weeks later, someone finds the old post and
clicks through to a page for a deal that's long gone.

**Preferred concept:** every social post links to a **stable
PokemonDealFinder context page** (a card/deal page, not the raw eBay listing
and not a one-off throwaway page) — this already matches the existing
architecture (`/deals/[id]`, `/cards/[slug]` hubs are permanent URLs). When
the featured listing has since ended, that same URL should show something
truthful instead of pretending the deal is still live, e.g.: **"This deal
has ended — see current listings/deals for this card."**

- **Not solved with redirects** — the URL a person clicked from the old post
  stays valid and loads; its *content* changes to reflect reality. This is
  consistent with `/deals/[id]` and `/cards/[slug]` already being permanent,
  content-can-change pages rather than one-shot artifacts.
- This is a **future requirement to design into `/deals/[id]`'s expired-deal
  state**, not a change made this phase — no code touched.

---

## 20. Content automation architecture (concept only)

```
PokemonDealFinder data (deals, rankings, PPT price history)
  → candidate generator            (deterministic — reuses existing ranking logic)
  → evidence validator             (re-checks freshness right before use)
  → rights/compliance gate         (blocks anything not cleared per §5–§8)
  → content scorer                 (which candidate is worth a post today)
  → template selector              (which pillar/format, §15)
  → structured creative payload    (plain data object — no eBay facts sent to GenAI yet)
  → renderer                       (template → image/video, our own assets only)
  → caption generator              (deterministic template; GenAI assist only on non-eBay-data wording, until §1 #2 approval exists)
  → disclosure gate                (blocks queueing without a compliant disclosure, §10)
  → human review                   (Level B gate, §4)
  → scheduler / publish            (official API only — Buffer, or direct Graph/Content-Posting API)
  → attribution                    (privacy-safe UTM, §24 — never card names/IDs)
  → learn                          (aggregate-only feedback into candidate scoring)
```

No stage of this pipeline is implemented. It exists to show where each
compliance gate from this document (§5, §7, §10, §16–§19) physically sits in
a future build, so Phase 13E (if it proceeds) has a concrete checklist
rather than a vague intention.

---

## 21. GenAI providers — preparation only (none selected)

Categories anticipated, not chosen:

- **Text/caption generation** — needed for non-eBay-data caption phrasing
  (§5's boundary) and, later, potentially fuller caption drafting once the
  AI Tools approval exists.
- **Image/template generation** — needed only for **our own** template
  elements (backgrounds, icon-style graphics, chart styling) — not for card
  artwork (§22) and not for compositing eBay photos.
- **Voice** — only relevant if video narration is added later; not currently
  planned.
- **Video generation/rendering** — only relevant for Reels/TikTok video
  formats; not currently planned.

For **any** eventual provider, before use, we need on file: commercial-use
terms, data-retention policy, training/data-use policy, processing region,
an explicit answer to "does eBay data ever reach this provider" (target:
no, per §5), an explicit answer to "does PokemonPriceTracker data ever reach
this provider," cost, and confirmation the provider supports deterministic,
template-constrained output rather than freeform generation we can't audit.
This list feeds directly into the §2 worksheet once a provider is chosen.

---

## 22. No AI-generated card artwork by default

**Decision: do not generate AI recreations of Pokemon characters or card
art.** Reasons:

1. **Trademark/copyright risk** (§8) — a generated image imitating official
   artwork or card-frame styling is a much harder rights position than
   showing an unmodified real photo of a real listing.
2. **Trust-brand fit** — the product's entire premise is "here is real
   evidence," not illustrative content; fabricated card imagery undercuts
   that positioning even if legally defensible.
3. **A safer, more trustworthy alternative already exists:** template-based
   layouts (our own typography, our own chart rendering, our own layout
   grid) around **properly licensed source imagery** — an unmodified,
   isolated real eBay listing photo (once §7's open question clears), or, for
   pillars that don't need a specific listing photo at all (Weekly Market
   Movers, Card Market Snapshot), a pure data chart with no card photo.

This is evaluated and decided now; it is not a placeholder for later
reconsideration without a specific reason to revisit it.

---

## 23. Measurement plan (concept only — no tracking changes this phase)

Optimize for the funnel, not vanity metrics:

```
social content → PokemonDealFinder visit → QCA → eBay affiliate click
```

Candidate metrics (all aggregate, matching the existing PostHog posture —
see [[pokemon-deals-analytics-posture]]):

- Profile/site click-through rate (bio link or in-bio "link in bio" clicks)
- Landing-page QCA (reuses the existing `qualified_detail_view` /
  `card_viewed_from_home`-style events, with `origin_section`/`traffic_source`
  able to carry a `social` value once wired — not built this phase)
- Affiliate click (reuses `AffiliateLink.js`'s existing `affiliate_click`
  event unchanged)
- Search usage and deal-detail engagement (existing events)

Followers/likes/views remain **diagnostics only** — never the optimization
target, consistent with the "views/likes remain diagnostics" instruction.

---

## 24. UTM / attribution concept (design only — not deployed)

```
utm_source=instagram | tiktok
utm_medium=social
utm_campaign=<safe campaign enum, e.g. "weekly_movers" | "deal_of_day" | "set_spotlight">
```

- **MUST NOT** place a card name, Pokemon name, or any user/session identity
  in a UTM parameter — campaign values are a small fixed enum, matching the
  existing `classifyTrafficSource`/`sanitizeUtmValue` pattern already used
  site-wide for landing attribution (`lib/analytics/props.js`).
- Attribution stays aggregate: "how much traffic did the `weekly_movers`
  campaign send," never "which specific post did this specific visitor
  click."
- Not deployed this phase — this is the shape a future implementation should
  follow when it's built.

---

## 25. Social account context

Owned profiles: `instagram.com/pokemondealfinder`,
`tiktok.com/@pokemondealfinder` — currently small/new, not materially
driving eBay traffic today. This document does not fabricate engagement
history, does not propose buying followers, click farms, or engagement bots
anywhere above, and nothing in this phase changes that current state.

---

## 26. Current EPN review — consistency check

**Audit finding: CONSISTENT.**

No social-automation code, no publishing integration, and no GenAI
integration exist anywhere in the repository prior to this phase (confirmed
via repo search — no matches for EPN/Special-Business-Model/Quality-Team
terminology, no Buffer/Meta/TikTok SDK in `package.json`). This document is
planning-only, was not sent to EPN, and does not change anything already
disclosed to them. The owner's existing characterization of the profiles as
"small/new and not currently a material direct eBay promotional channel"
remains accurate as of this phase — nothing here contradicts or updates that
history.

**Forward-looking note (not an instruction to act now):** once any future
phase actually *launches* GenAI-assisted or automated social promotion, that
characterization will need revisiting *before or alongside* any EPN AI Tools
application — launching first and explaining later would itself create the
inconsistency this check is meant to catch. That is a Phase 13E-or-later
concern, flagged here so it isn't missed.

---

## 27. Final decision matrix

| Area | Current status | Approval needed? | Before-launch action |
|---|---|---|---|
| EPN AI Tools | Not applied for | Yes, if any GenAI ever touches eBay Data | File the §2 worksheet for real once a provider is chosen and the current EPN review is resolved |
| Instagram publishing | Not connected | Yes (Meta App Review) | Standard developer app + review process, only when ready to build Level A/B |
| TikTok publishing | Not connected | Yes (Direct Post API client audit) | Same, plus Commercial Music Library compliance for any commercial video |
| Buffer | Not connected | No EPN/platform approval of its own beyond the above | Evaluate plan/cost only once ready to build |
| Affiliate disclosures | Pattern designed (§10), not yet used anywhere social | No approval; a compliance requirement, not a permission | Bake the §10 pattern into every template before the first post |
| eBay data → GenAI | Not happening (no GenAI pipeline exists) | Yes (§1 #2) before it ever happens | Keep eBay facts out of GenAI prompts (§5) until approved |
| PPT data → social | Not happening | **Provider confirmation, not EPN** | Get PPT's written yes/no on off-site derived-figure use (§6) |
| Card imagery | Not used in social yet | eBay: EPN/Developer-terms confirmation (§7); PPT: provider confirmation | Resolve both before any composited creative ships |
| Pokemon trademarks | Guardrails documented (§8) | No approval; house rule | Apply guardrails to the first template before it's used |
| Automated publishing | Not built | Depends on level chosen | Build Level B, not Level C, first (§3/§4) |
| Human review | Not built | N/A | Build the approval gate before any publish integration |
| Direct social → eBay links | Assessed, not used | Not prohibited, but weaker | Prefer Journey A (§9); avoid Journey B as the default |
| Social → PokemonDealFinder links | This is Journey A, not built yet | No approval needed beyond the above | Build once ready |
| Expired deal handling | Concept only (§19) | No approval; a product requirement | Design `/deals/[id]`'s expired-state copy before the first post that could outlive its deal |
| Attribution | Concept only (§24) | No approval; a privacy requirement | Implement the UTM enum + landing capture before any real campaign |

---

## 28. Launch gate

**GREEN — can proceed later, no blocker found:**
- Journey A (social → PokemonDealFinder → intentional eBay click) design
- Disclosure pattern (§10)
- Truth contracts (§16/§17)
- Content-pillar menu (§15) for pillars that don't depend on eBay images or
  PPT-off-site confirmation
- UTM/attribution design (§24)
- Buffer as the eventual scheduling layer (§13)

**AMBER — confirm before launch:**
- eBay listing images in composited social creative (§7, §5) — confirm the
  "visually isolated" clause with EPN/eBay Developer support
- PokemonPriceTracker derived-figure use in social content (§6) — get
  written confirmation from PPT
- Any GenAI use touching eBay-derived facts (§1 #2) — file the AI Tools
  application once the below WAITING item clears
- Instagram App Review / TikTok API-client audit — routine, but not started

**RED — do not launch:**
- Level C (fully automatic, no human review) publishing (§3)
- AI-generated recreations of Pokemon characters/card art (§22)
- Composited eBay-photo creative before the AMBER item above resolves
- Any post without the §10 disclosure pattern applied
- Any GenAI pipeline that puts raw eBay data into a model prompt before
  EPN approval exists

**WAITING — current EPN review:**
- Submitting the AI Tools application, or any EPN-facing communication about
  GenAI or social promotion, until the current EPN Quality Team account
  review is resolved (explicit instruction this phase, honored — nothing
  was sent)

---

## What must happen before Phase 13E

1. Current EPN Quality Team review resolves.
2. PokemonPriceTracker gives a written answer on off-site derived-figure use
   in social content (§6).
3. The eBay "visually isolated" Public Display clause is confirmed directly
   with EPN or eBay Developer support (§1 #10, §7) — this phase could not
   verify it first-hand (403 on both source URLs).
4. A GenAI provider (if any) is chosen with the §21 checklist satisfied.
5. The §2 AI Tools worksheet is filled with real, final answers and only
   then submitted — still not this phase.
6. The Level B pipeline (§4/§20) is actually built, including the disclosure
   gate (§10) and the human-approval step, before any publishing API is
   connected.
7. `/deals/[id]`'s expired-deal state (§19) exists before the first post
   that could plausibly outlive its featured listing.

Until all of the above are true, no post should be published and no EPN
application should be filed.

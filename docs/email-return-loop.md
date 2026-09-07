# Email Capture & Return-Visitor Loop — Phase CRM-1

A lightweight, trust-first way for people who discover PokemonDealFinder
via social / SEO to come back — instead of relying only on one-session
affiliate clicks.

**Not a CRM.** No accounts, no popups, no dark patterns. One email field,
double opt-in, one-click unsubscribe, an occasional digest.

**Nothing sends in this phase.** Every visible surface and the signup
endpoint are gated on `emailEnabled()` (`RESEND_API_KEY` +
`ALERT_FROM_EMAIL`), which is unset in production. See
[Owner activation](#owner-activation).

---

## Value proposition

Not "join our newsletter". The offer is **Pokemon deal alerts**:

> Get standout Pokemon card deals and market finds in your inbox.
> Occasional — only when something's genuinely worth sending.

Primary CTA everywhere: **"Get deal alerts"** (one, consistent — do not vary).

Consent copy shown at every form (`lib/crm/subscribers.CONSENT_COPY`):

> Occasional emails about standout Pokemon card deals and market finds.
> Unsubscribe anytime.

### First iteration is a digest, not real-time

Per-card **price alerts** (`/api/alerts`) already exist and are genuinely
event-driven. The CRM-1 capture is a **digest / occasional deal alert** —
the cadence language is deliberately "occasional" / "when it's worth
sharing", never "instant", "every deal", or "guaranteed savings".

---

## Capture placements

Inline / embedded only. Never a modal, exit-intent, countdown, or
notification nag. Never above a primary deal CTA.

| Placement | Where | Component call |
| --- | --- | --- |
| `homepage` | After the first proof section ("Best deals right now" + trust strip), before "Auctions ending soon". Full-width charcoal band. | `<EmailCapture placement="homepage" />` in `app/page.js` |
| `expired_deal` | On an ended/expired deal page, below the recovery links & related deals, above the footer. Strongest return-intent moment. | `<EmailCapture placement="expired_deal" />` in `app/deals/[id]/page.js` |
| `deal_detail` | On a live deal page, below the related-deals module, well under "View on eBay". Compact card. | `<EmailCapture placement="deal_detail" />` in `app/deals/[id]/page.js` |

`deals_browse` is defined in the model but not placed in v1 (keep it to a
few).

Module visual direction (§23): charcoal/black ground, white type,
restrained red CTA, no envelope illustration, compact. Headline answers
"why give us your email?".

---

## Subscriber data model

No new table. The existing `newsletter_subscribers`
(`supabase/newsletter_migration.sql`) is extended by
`supabase/newsletter_capture_migration.sql` (non-destructive: nullable
columns + a `status` backfill + two indexes).

| CRM-1 field | Column | Notes |
| --- | --- | --- |
| subscriber_id | `id` (uuid) | |
| email_normalized | `email` (unique) | trimmed + lowercased before write (`normalizeEmail`) |
| status | `status` | authoritative — see below |
| created_at / confirmed_at / unsubscribed_at | same | retained; kept in sync with `status` |
| source | `source` | e.g. `capture_homepage`, `price_alert_form` |
| utm_source / utm_medium / utm_campaign / utm_content | `utm_*` | short codes only (`sanitizeUtmValue` + a final guard) |
| signup_route | `signup_route` | bare on-site path / placement token, never a URL with query string |
| consent_version | `consent_version` | `lib/crm/subscribers.CONSENT_VERSION` (`crm1-2026-09`) |
| token | `token` (unique) | confirm / unsubscribe token |

### Statuses

`PENDING` → `ACTIVE` → `UNSUBSCRIBED` (terminal) · `BOUNCED` /
`COMPLAINED` (terminal, set only by a future provider webhook — none in
this phase).

`status` is authoritative. `confirmed` (bool) + `unsubscribed_at` are the
**legacy encoding the weekly digest cron still filters on**, so every
route that writes one writes the other. `deriveStatus(row)` returns
`status` if present, else derives it from the legacy fields (an
unsubscribe outranks `confirmed`).

---

## Provider choice

**Resend**, reused via the existing `lib/email.js` wrapper (no new
dependency). It is the project's transactional / digest mailer and is
already isolated from the cold-outreach path.

**Outreach (Instantly) and subscriber mail stay separate.** `lib/email.js`
never imports `lib/outreach/*` and vice-versa; the outreach provider
module holds no reference to `RESEND_API_KEY`. There is no Instantly
send path for subscribers.

If `RESEND_API_KEY` / `ALERT_FROM_EMAIL` are unset, `emailEnabled()` is
false: the capture modules don't render, `/api/newsletter/subscribe`
returns `{ ok:false, reason:"disabled" }` (503), and no address is
collected that couldn't be confirmed.

---

## Double opt-in

**Yes.** The infra already supports it (token + `GET /api/newsletter
?token=..&action=confirm`).

```
signup form → POST /api/newsletter/subscribe → row status=PENDING
            → confirmation email (transactional, Resend)
            → visitor clicks → status=ACTIVE
```

Rationale: cleaner list, stronger consent evidence, fewer typos — and the
existing price-alert flow already works exactly this way, so it is not a
fragile addition. Nothing is ever sent to a `PENDING` address.

---

## Consent & privacy

- No pre-checked boxes. No checkbox at all — submitting the form with the
  consent copy visible is the consent; `consent_version` records which
  copy string was shown.
- `app/privacy/page.js` "Price alerts and deal emails" covers: what's
  stored (email, token, date, signup route, campaign tag), the purpose
  (see which content brings people in), the provider (Resend), double
  opt-in, one-click unsubscribe, no sale/rental/marketing sharing,
  deletion on request. No hidden enrichment.
- PostHog never receives the address (`email` is a `FORBIDDEN_KEY` in
  `lib/analytics/sanitize.js`).

---

## Unsubscribe

`GET /api/newsletter?token=<token>&action=unsubscribe` — tokenised, no
login, one click. Sets `unsubscribed_at` **and** `status=UNSUBSCRIBED`.

- **No accidental resubscribe:** a stale `action=confirm` link on an
  already-unsubscribed row no longer silently reactivates it — it shows
  "you previously unsubscribed; sign up again on the site". A deliberate
  re-opt-in goes through `/api/newsletter/subscribe`, which clears
  `unsubscribed_at` + issues a fresh token first.
- The digest send layer attaches RFC 8058 `List-Unsubscribe` +
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers
  (`digestTemplate.listUnsubscribeHeaders`) once sending is enabled.
- Confirmation page copy carries no retention-guilt language.

Unsubscribe exists and is wired **before** any marketing email can be
sent.

---

## Analytics

Events (declared in `lib/analytics/events.js`, auto-allowlisted):

| Event | Fired | Props |
| --- | --- | --- |
| `email_capture_viewed` | module scrolled into view (once) | `placement`, `page_type` |
| `email_signup_submitted` | form submit | `placement`, `page_type` |
| `email_signup_success` | endpoint returned ok | `placement`, `page_type` |
| `email_signup_error` | endpoint returned an error | `placement`, `page_type`, `reason` |
| `email_confirmation_success` | reserved — confirm page (server HTML today) | — |
| `email_unsubscribed` | reserved — unsubscribe page (server HTML today) | — |

Plus the in-memory common context already attached to every event
(`device_class`, `utm_*`, `viewer_country`). **Never the email address.**

### Attribution

At signup the route records `utm_source/medium/campaign/content` (from the
link the visitor arrived on, sanitised) and `signup_route`. This lets us
later answer *"which social content produces subscribers?"* by joining
`newsletter_subscribers.utm_*` to the social attribution layer — with
anonymous / subscriber-level first-party data only, no invasive identity
stitching.

---

## Digest template (prep only — not sent)

`lib/crm/digestTemplate.renderDigest(rows, { unsubscribeUrl, siteUrl,
preset })` → `{ subject, html, text }`. Pure string assembly.

- Every deal link is **website-first**: `https://pokemondealfinder.com/
  deals/<id>`. **No eBay / affiliate URL is ever emitted from the digest.**
- Footer always: why-received line, one-click unsubscribe link, bare
  domain, affiliate disclosure.
- Presets: `standout` (occasional framing, default) and `weekly` (the
  existing weekly-digest wording — `app/api/send-digest` uses this, so its
  subject/intro are unchanged).
- Digest content safety: `send-digest` already pulls fresh, verified,
  Buy-It-Now deal rows at send time; an expired deal is simply not in the
  set. No stale price copy is persisted.

---

## Frequency

Design target: **max 2–3 marketing emails / week**, likely less until deal
volume justifies more. No daily cadence unless a user later explicitly
opts into daily. `send-digest` keeps its 6-day idempotency guard. **No
autonomous send cadence is enabled in this phase.**

---

## Return-visitor funnel

```
SEO / SOCIAL
  → DEAL (or homepage)
  → EMAIL CAPTURE  (inline, double opt-in)
  → DIGEST         (occasional, website-first links)
  → POKEMONDEALFINDER.COM
  → LIVE DEAL
  → EBAY OUTBOUND  (affiliate)
```

### Metrics to watch (not list size alone)

capture impression → signup rate → confirmation rate → unsubscribe rate →
email click-through → return visit → affiliate outbound after an
email-sourced visit.

---

## Future segmentation (design only — not built)

Later the digest may support preferences: under $25 · graded · a specific
Pokemon · a specific set. **Not asked at signup** — email-only friction
first. Would be a post-confirmation preference page keyed by `token`, not
extra signup fields.

---

## Operator visibility

- `npm run crm:summary` (`--json`) — ACTIVE / PENDING / UNSUBSCRIBED /
  BOUNCED / COMPLAINED, 7d & 30d signups, top signup source. Read-only,
  **no addresses**.
- The social operator dashboard (`npm run social:dashboard`) shows the
  same counts in a "Subscribers (CRM-1)" panel (bounded `head:true` count
  queries; `--no-db` skips it).

---

## Owner activation

1. Run `supabase/newsletter_capture_migration.sql` in the Supabase SQL
   editor (also confirm `supabase/newsletter_migration.sql` has been run —
   there was prior drift).
2. Set `RESEND_API_KEY` and `ALERT_FROM_EMAIL`. The capture modules then
   render and `/api/newsletter/subscribe` accepts signups + sends
   **confirmation** emails only.
3. The **digest** (`/api/send-digest`) stays inert until its cron is
   configured with `CRON_SECRET`; keep it off until deal volume and list
   size justify a first send. Nothing marketing goes out before then.

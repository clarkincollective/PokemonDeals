# Analytics runtime verification — `guides_research_clicked`

Verifies that clicking the "Guides & Research" navigation control actually runs
the application's own handler and reaches `lib/analytics/client.js` `capture()`,
which calls the module-private `_posthog.capture(name, payload)` — once, with the
expected payload — on both desktop and mobile.

**Driver:** `scripts/_verifyAnalyticsRuntime.mjs`
**Verified:** 2026-09-12, against `origin/main` `c6d670c`, `next dev`, headless Chrome.
**Result:** 8/8 passed. No production-code change was required or made.

## Why the earlier evidence was insufficient

An earlier pass reported this as verified on the strength of the `data-analytics-click`
attribute, `ALLOWED_EVENTS` membership, and a click observed by a listener the test
itself registered. None of those establish that the application handler ran:

- attributes and allowlist membership are static facts;
- a listener added by the test only proves the DOM dispatches clicks;
- `window.posthog` is **not** `_posthog`, the module-private handle `capture()` calls.

## What was actually exercised

| Step | Evidence |
|---|---|
| Real control, real handler | Click dispatched on the `<a href="/guides">` control; handled by the app's own capture-phase delegated listener in `AnalyticsBootstrap`. The only listener the driver adds is a non-capture `preventDefault` (to stop navigation), which runs *after* the app's. |
| Module-private handle | Wrapped the object returned by `window.__pdfAnalytics.posthog()` — asserted `sameObject: true`, `isWindowPosthog: false`. |
| Layer genuinely live | `__analyticsState()` → `{ready: true, disabled: false, queued: 0, hasCommon: 10}`. |
| Once per click | Desktop and mobile each recorded exactly one `guides_research_clicked`. |

Payloads as assembled by `capture()` (`commonProps()` + `sanitizeProps()`):

```
desktop: {analytics_version:"13A.1", device_class:"desktop", traffic_source:"direct",
          landing_page_type:"home", geo_country:"unknown", viewer_country:"other",
          viewer_currency:"USD", section:"nav", source:"nav"}
mobile:  { …same…, device_class:"mobile" }
```

The handler's second-fire branch (`props.graded_entry && name !== GRADED_CLICKED`)
cannot apply here: `graded_entry` is set only on the `/deals/graded` entry
(`components/SiteHeader.js`), while this control's props are exactly
`{section:"nav", source:"nav"}`. That is what makes "once per click" a sound claim.

## Transport

Every `posthog.com` request was failed at the network layer, so **nothing was
transmitted**. `client.js` anticipates a blocked network (it flushes anyway), so
blocking does not disable the path under test. Blocked requests were
`eu-assets.i.posthog.com/array/<key>/config` and `eu.i.posthog.com/flags/` — both
*initialisation* endpoints. No event-ingestion request was observed.

Config-level transport mocking is impossible by design: `getPosthogHost()` rejects
any non-EU override and falls back to `eu.i.posthog.com`.

## Limits — what this does NOT establish

- **Not production execution.** The observation point `window.__pdfAnalytics` exists
  only when `NODE_ENV !== "production"` (`lib/analytics/client.js`). This ran against
  `next dev`. The code path is the same; the build is not.
- **Not ingestion.** Nothing was transmitted and no ingestion attempt was observed.
  Whether PostHog would accept the event is untested and unclaimed.
- **Console errors not fully classified.** The 2026-09-12 run recorded 30 console
  errors but held them in memory and printed only the first four (all
  `ERR_BLOCKED_BY_CLIENT`, i.e. the driver's own blocking). The full set was never
  written to disk, so it cannot be classified from saved output, and they are **not**
  assumed harmless. The committed driver now retains every entry in full and
  separates guard noise from other errors, so a future run resolves this.
- **The committed driver has not been re-executed.** It is a de-secreted,
  dependency-free refactor of the driver that produced these results (`ws` → the
  built-in `WebSocket`, machine paths → `CHROME_PATH` / `BASE_URL`). Parse-checked
  only; not re-run, because a browser rerun was out of scope.

## No regression test was added

Existing analytics coverage does not prove this behaviour — the suites are source
scanners or pure-module unit tests, and `tests/scanner/analytics-contract.test.mjs`
explicitly skips `lib/analytics/client.js`. A runtime test cannot be expressed with
the existing tooling: there is no jsdom/testing-library/playwright in
`devDependencies`, `_posthog` has no injection seam, and `capture()` short-circuits
on `isBrowser()` under Node. Adding a dependency or a production injection hook was
out of scope, and a static test would not prove the behaviour in question — so this
script is the artifact instead.

## Prerequisites

```
npm run dev                     # dev server (default :3311; override BASE_URL)
NEXT_PUBLIC_POSTHOG_KEY set     # else analyticsEnabled() is false and the layer is inert
Node >= 22                      # built-in WebSocket; `engines` is not declared
Chrome                          # CHROME_PATH, else the Windows default

node scripts/_verifyAnalyticsRuntime.mjs
```

No credential is read, printed or transmitted by the script.

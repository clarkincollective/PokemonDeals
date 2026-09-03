// Phase 13A - the ONLY module that talks to posthog-js.
//
// Everything the app captures goes through capture() here. Nothing else
// imports "posthog-js". Guarantees:
//   * inert no-op unless NEXT_PUBLIC_POSTHOG_KEY is set
//   * inert no-op if the visitor has Do Not Track / GPC on
//   * posthog-js is dynamically imported AFTER first paint so it never
//     lands in the initial bundle / critical path
//   * every failure is swallowed - analytics can never change site
//     behaviour or block an affiliate click
//   * no identify(), no alias(), no group() - anonymous only

"use client";

import { ALLOWED_EVENTS } from "./events.js";
import { ANALYTICS_VERSION, analyticsEnabled, buildPostHogConfig } from "./config.js";
import { buildBeforeSend, sanitizeProps } from "./sanitize.js";
import { isDoNotTrackEnabled } from "./session.js";

let _posthog = null;
let _initStarted = false;
let _ready = false;
let _disabled = false;
const _queue = [];
let _commonContext = {};

const isBrowser = () => typeof window !== "undefined";

export function setCommonContext(patch) {
  if (!patch || typeof patch !== "object") return;
  _commonContext = { ..._commonContext, ...patch };
}

function commonProps() {
  return {
    analytics_version: ANALYTICS_VERSION,
    ..._commonContext,
  };
}

// Kick off a deferred load + init. Safe to call more than once.
export function initAnalytics() {
  if (_initStarted || !isBrowser()) return;
  _initStarted = true;

  if (!analyticsEnabled()) {
    _disabled = true;
    _queue.length = 0;
    return;
  }
  if (isDoNotTrackEnabled()) {
    _disabled = true;
    _queue.length = 0;
    return;
  }

  const start = () => {
    import("posthog-js")
      .then(({ default: posthog }) => {
        try {
          posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
            ...buildPostHogConfig({ beforeSend: buildBeforeSend({ allowed: ALLOWED_EVENTS }) }),
            loaded: () => {
              _ready = true;
              flush();
            },
          });
          _posthog = posthog;
          // In case `loaded` doesn't fire (e.g. request blocked), still
          // flush - capture() will queue again if truly unavailable.
          _ready = true;
          flush();
          // Dev-only debug handle - never in production. Lets a local
          // validation pass inspect the real SDK instance / queue state.
          if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
            window.__pdfAnalytics = {
              state: __analyticsState,
              posthog: () => _posthog,
              isCapturing: () => {
                try {
                  return _posthog?.is_capturing?.();
                } catch {
                  return "err";
                }
              },
            };
          }
        } catch (e) {
          _disabled = true;
          if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
            window.__pdfAnalyticsError = String((e && e.stack) || e);
          }
        }
      })
      .catch((e) => {
        _disabled = true;
        if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
          window.__pdfAnalyticsError = "import: " + String((e && e.stack) || e);
        }
      });
  };

  // After first paint / idle so it stays off the critical path.
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(start, { timeout: 4000 });
  } else {
    setTimeout(start, 1500);
  }
}

function flush() {
  if (!_ready || !_posthog) return;
  while (_queue.length) {
    const { name, props } = _queue.shift();
    try {
      _posthog.capture(name, props);
    } catch {
      /* drop */
    }
  }
}

// The single capture entry point.
export function capture(name, props = {}) {
  try {
    if (_disabled || !isBrowser()) return;
    if (!ALLOWED_EVENTS.has(name)) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[analytics] ignored unknown event "${name}" - add it to lib/analytics/events.js`);
      }
      return;
    }
    const payload = { ...commonProps(), ...sanitizeProps(props) };

    if (!_initStarted) initAnalytics();
    if (_ready && _posthog) {
      _posthog.capture(name, payload);
    } else if (!_disabled) {
      if (_queue.length < 100) _queue.push({ name, props: payload });
    }
  } catch {
    /* analytics must never throw into the app */
  }
}

// For tests / debugging only.
export function __analyticsState() {
  return { ready: _ready, disabled: _disabled, queued: _queue.length, hasCommon: Object.keys(_commonContext).length };
}

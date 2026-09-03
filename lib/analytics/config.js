// Phase 13A - PostHog configuration, isolated so tests can assert the
// privacy contract without importing the browser SDK.
//
// POSTURE (locked by the phase brief):
//   * PostHog Cloud EU project + EU ingestion endpoint
//   * cookieless_mode: "always"  -> true cookieless server-hash mode;
//     stores NOTHING in cookies / localStorage / sessionStorage
//   * person_profiles: "never"   -> identify()/alias() become no-ops
//   * autocapture / session replay / surveys / heatmaps / exceptions OFF
//   * explicit custom events only (capture_pageview / capture_pageleave OFF)
//   * before_send sanitisers strip URLs / redact PII / drop stray events
//   * respect Do Not Track / Global Privacy Control (we also gate init)
//
// Accepted 13A limitation (documented): with a daily rotating server
// salt, a visitor cannot be reliably linked across days. Same-session /
// same-day funnel measurement is sufficient for 13A.
//
// If NEXT_PUBLIC_POSTHOG_KEY is absent the whole analytics layer is an
// inert no-op (see lib/analytics/client.js) - safe to ship before the
// owner creates the project.

export const ANALYTICS_VERSION = "13A.1";

// PostHog Cloud EU. Assets are served from eu-assets.i.posthog.com; the
// SDK derives that automatically from an eu.i.posthog.com api_host.
export const POSTHOG_EU_API_HOST = "https://eu.i.posthog.com";
export const POSTHOG_EU_UI_HOST = "https://eu.posthog.com";

export function getPosthogKey() {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
}

// Optional override, but it MUST stay an EU host. If someone points this
// at a US host we fall back to EU rather than honour it - the brief is
// explicit: "Use the EU-hosted PostHog project, not a US project pointed
// at an EU-looking URL."
export function getPosthogHost() {
  const raw = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "").trim();
  if (!raw) return POSTHOG_EU_API_HOST;
  try {
    const h = new URL(raw).hostname.toLowerCase();
    const isEu = h === "eu.i.posthog.com" || h.endsWith(".eu.posthog.com") || h === "eu.posthog.com";
    return isEu ? raw.replace(/\/$/, "") : POSTHOG_EU_API_HOST;
  } catch {
    return POSTHOG_EU_API_HOST;
  }
}

export function analyticsEnabled() {
  return Boolean(getPosthogKey());
}

// The exact object passed to posthog.init(). `beforeSend` is injected by
// the caller (client.js) so this file has no SDK dependency.
export function buildPostHogConfig({ beforeSend } = {}) {
  return {
    api_host: getPosthogHost(),
    ui_host: POSTHOG_EU_UI_HOST,

    // --- the cookieless contract ---
    cookieless_mode: "always",
    persistence: "memory", // belt-and-braces: never localStorage/cookie
    person_profiles: "never",
    defaults: "2026-05-30", // PostHog's documented baseline for cookieless setup

    // --- explicit events only ---
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_performance: false, // we run our own perf baseline; keep events intentional
    rageclick: false,

    // --- no privacy-sensitive extensions ---
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true, // never fetch recorder/surveys/toolbar bundles
    enable_heatmaps: false,

    // --- respect opt-out signals ---
    respect_dnt: true,
    advanced_disable_toolbar_metrics: true,

    // --- housekeeping ---
    loaded: undefined,
    before_send: beforeSend,
  };
}

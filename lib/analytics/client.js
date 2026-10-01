// 2 Oct 2026 - owner: "we can remove posthog from the website. it slows
// users experience and i was not using it and i dont have a subscription
// anymore." PostHog (posthog-js) is no longer loaded, initialised, or
// called from anywhere in the app. capture()/initAnalytics() are
// permanent no-ops so every existing call site (data-analytics-click
// markers, impression observers, the page-view tracker) keeps working
// without changes - they just no longer send anything, anywhere.
//
// lib/analytics/config.js's analyticsEnabled() now always returns false,
// which is what actually removes the user-facing cost: every component
// that gates its effects on it (AnalyticsBootstrap's document-wide click
// listener, HomepageAnalytics's IntersectionObserver + scroll listener,
// DetailViewAnalytics's dwell timer) now does nothing at all.

"use client";

export function setCommonContext() {}

export function initAnalytics() {}

export function capture() {}

export function __analyticsState() {
  return { ready: false, disabled: true, queued: 0, hasCommon: false };
}

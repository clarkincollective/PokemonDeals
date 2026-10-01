// 2 Oct 2026 - PostHog removed (owner: no longer used, no subscription,
// was costing user-experience overhead for no benefit). analyticsEnabled()
// is kept because every analytics-aware component (AnalyticsBootstrap,
// HomepageAnalytics, DetailViewAnalytics, EmailCapture) gates its effects
// on it - returning false here is what actually stops their listeners /
// observers / timers from ever being set up, not just the SDK call.

export function analyticsEnabled() {
  return false;
}

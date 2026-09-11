"use client";

import { createContext, useContext, useRef, useSyncExternalStore } from "react";

// HYDRATION-SAFE CLOCK (2026-09-11).
//
// Relative timestamps ("found Yesterday", "ends 3h left", the "Just found"
// badge) are a function of TWO clocks the server and the browser never
// share:
//   * the calendar day - the server renders in UTC, the viewer's browser in
//     their own zone, so a listing found 20:30Z is "Yesterday" in the HTML
//     and "Today" to a Brisbane viewer (React error #418, text mismatch);
//   * `now` itself - ISR pages (/deals/*, /) are served from cache for up
//     to their revalidate window, so the HTML's "43m left" was computed
//     minutes before the browser hydrates it.
//
// The fix is NOT suppressHydrationWarning. The root layout captures the
// server render's clock once (`Date.now()` at render, so it's baked into
// the same HTML + flight payload) and provides it here. useClockValue()
// then hands React two snapshots:
//   * server snapshot  - computed from the SERVER clock, on the UTC
//     calendar. React uses it for the server HTML AND for the browser's
//     hydration render, so the two are identical by construction;
//   * client snapshot  - computed from the viewer's real clock on their
//     local calendar. React swaps to it right after hydration (and uses
//     it directly on client-side navigations), so an aged cached page and
//     a non-UTC viewer both end up with the honest, current wording.
// The visible SSR wording is unchanged from before (the server always
// rendered on the UTC calendar); only the browser's first paint now
// agrees with it.

const RenderClockContext = createContext(null);

export function RenderClockProvider({ now, children }) {
  return <RenderClockContext.Provider value={now}>{children}</RenderClockContext.Provider>;
}

// The server render's clock (ms epoch), or null outside a provider.
export function useRenderClock() {
  return useContext(RenderClockContext);
}

const subscribe = () => () => {};

// `compute(now, { utc })` -> a primitive (string/boolean/number) so React's
// Object.is comparison between snapshots is meaningful.
//
// getSnapshot must return the same value when nothing changed - React calls
// it more than once per render and re-renders (in prod) / warns (in dev) if
// two calls disagree. A wall-clock-derived string can change between two
// calls straddling a minute edge, so the client value is memoised for one
// second per hook instance.
export function useClockValue(compute) {
  const serverNow = useRenderClock();
  const cache = useRef({ at: 0, value: undefined });

  const getSnapshot = () => {
    const t = Date.now();
    if (t - cache.current.at >= 1000 || cache.current.value === undefined) {
      cache.current = { at: t, value: compute(t, { utc: false }) };
    }
    return cache.current.value;
  };

  // No provider (unit render, storybook) -> behave exactly as before: the
  // viewer's clock, the local calendar.
  const getServerSnapshot = () =>
    serverNow == null ? compute(Date.now(), { utc: false }) : compute(serverNow, { utc: true });

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

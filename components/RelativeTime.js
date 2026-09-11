"use client";

import { useClockValue } from "@/components/RenderClock";
import { timeAgo, timeUntil, isWithin } from "@/lib/time";

// A relative timestamp that hydrates cleanly - see components/RenderClock.js.
//
//   <RelativeTime date={deal.first_seen_at} />                -> "Yesterday"
//   <RelativeTime date={deal.auction_end_at} mode="until" />  -> "3h left"
//
// Renders a bare text node so it drops into any sentence ("found {…}")
// exactly where the plain timeAgo()/timeUntil() call used to be.
export default function RelativeTime({ date, mode = "ago" }) {
  const text = useClockValue((now, { utc }) =>
    mode === "until" ? timeUntil(date, { now }) : timeAgo(date, { now, utc }),
  );
  return text;
}

// Renders `children` only while `date` is within `withinMs` of now, on the
// same hydration-safe clock (the "Just found" badge). A cached page that
// ages across the window shows the badge on first paint - matching its
// HTML - and drops it right after hydration, with no mismatch.
export function WithinWindow({ date, withinMs, children }) {
  const inside = useClockValue((now) => isWithin(date, withinMs, { now }));
  return inside ? children : null;
}

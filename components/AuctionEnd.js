"use client";

import { useSyncExternalStore } from "react";
import { useClockValue } from "@/components/RenderClock";
import { timeUntil } from "@/lib/time";

const HOUR = 3_600_000;

// The end of an auction, stated two ways from ONE stored timestamp
// (deals.auction_end_at, eBay's own end time):
//
//   relative   "3h left" / "42 min left" - on the hydration-safe clock
//              (components/RenderClock), so the server HTML and the
//              browser's first paint agree and the wording never restarts
//              or flashes; it simply re-reads the clock once a second.
//   absolute   the exact end time in the VIEWER's zone, with the zone
//              name, in the element's title (hover / long-press) and, when
//              `expanded`, printed beside the countdown - the detail page
//              uses that; a grid card keeps the short form.
//
// Amber only when the end is genuinely within an hour. No blinking, no
// synthetic urgency, no timer per card - a single memoised clock read.
function absoluteEnd(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

// false during SSR and the hydration pass, true after - the standard
// hydration-safe "mounted" read (no effect + state round-trip).
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

export default function AuctionEnd({ date, expanded = false, className = "" }) {
  const hydrated = useHydrated();
  const state = useClockValue((now) => {
    const end = Date.parse(date ?? "");
    if (!Number.isFinite(end)) return "unknown";
    if (end <= now) return "ended";
    return end - now <= HOUR ? "soon" : "later";
  });
  const relative = useClockValue((now) => (Number.isFinite(Date.parse(date ?? "")) ? timeUntil(date, { now }) : "soon"));

  if (state === "unknown") return <span className={className}>ends soon</span>;
  if (state === "ended") return <span className={`text-zinc-500 ${className}`}>ended</span>;

  // `absolute` is computed after hydration only (Intl in the viewer's
  // zone); it lives in title / the expanded line, never in the SSR text
  // the countdown itself renders, so hydration stays clean.
  const abs = hydrated ? absoluteEnd(date) : null;
  const tone = state === "soon" ? "font-semibold text-amber-700 dark:text-amber-400" : "";
  return (
    <span className={`${tone} ${className}`.trim()}>
      <time dateTime={date} title={abs ? `Ends ${abs}` : undefined}>
        {relative}
      </time>
      {expanded && abs && (
        <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">· ends {abs}</span>
      )}
    </span>
  );
}

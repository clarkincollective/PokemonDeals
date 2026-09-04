"use client";

import { useEffect, useRef, useState } from "react";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { classifyQueryIntent } from "@/lib/analytics/intent";

// A compact search bar that slides in under the sticky header once the
// visitor scrolls past the hero, on narrow screens only (the desktop
// header keeps its own search icon). Gives mobile a persistent way back
// into search without scrolling up. Plain <form> - works with JS off
// (it just won't auto-hide) and still a REAL native form submission (no
// controlled input, no client-side router.push) - unlike HeroSearch this
// bar has no autocomplete state to manage.
//
// 13C.5.1 - reuses HeroSearch's exact Search event contract
// (hero_search_focus / search_started / search_submitted) with
// source:"sticky" instead of "hero", so "Search" can be compared against
// "Discover" without a separate event family. Becoming visible on scroll
// is NOT search intent and never captures anything by itself - only the
// input/form handlers below do, and only on real user interaction.
// Nothing here can delay or block the native navigation to /search?q=...:
// capture() is fire-and-forget and never preventDefault()s.
export default function MobileStickySearch() {
  const [show, setShow] = useState(false);
  const focusedRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // hero_search_focus{source:"sticky"} - once per mount, matching
  // HeroSearch's focusedRef guard.
  function onFocus() {
    if (!focusedRef.current) {
      focusedRef.current = true;
      capture(EVENTS.HERO_SEARCH_FOCUS, { source: "sticky" });
    }
  }

  // search_started{source:"sticky"} - first >=2-char input in an
  // interaction, resets on clear - identical threshold to HeroSearch's
  // `queryLongEnough`. The input stays UNCONTROLLED (no value/onChange
  // state) on purpose; this only reads the live DOM value to classify
  // the interaction, it never drives a re-render.
  function onChange(e) {
    const v = e.target.value.trim();
    if (v.length >= 2 && !startedRef.current) {
      startedRef.current = true;
      capture(EVENTS.SEARCH_STARTED, { source: "sticky" });
    } else if (v.length === 0) {
      startedRef.current = false;
    }
  }

  // search_submitted{source:"sticky"} - the only submit path here is
  // Enter (no button, no suggestions), so via is always "form". Never
  // calls preventDefault(): the browser's native GET submission to
  // /search?q=... proceeds exactly as before, analytics or not.
  function onSubmit(e) {
    const v = (e.currentTarget.elements?.q?.value || "").trim();
    if (v.length >= 2) {
      capture(EVENTS.SEARCH_SUBMITTED, { source: "sticky", via: "form", ...classifyQueryIntent(v) });
    }
  }

  return (
    <div
      className={`fixed inset-x-0 top-[57px] z-20 border-b border-zinc-200 bg-paper/90 px-4 py-2 backdrop-blur transition-transform duration-200 lg:hidden dark:border-zinc-800 dark:bg-black/90 ${
        show ? "translate-y-0" : "-translate-y-[140%]"
      }`}
    >
      <form action="/search" className="relative" onSubmit={onSubmit}>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
        >
          <circle cx="8.5" cy="8.5" r="5.5" />
          <line x1="16" y1="16" x2="12.5" y2="12.5" />
        </svg>
        <input
          type="text"
          name="q"
          onFocus={onFocus}
          onChange={onChange}
          aria-label="Search Pokemon cards by name, set or collector number"
          placeholder="Search a card or set…"
          // 13B.7.2 - >=16px so iOS Safari doesn't auto-zoom on focus
          // (this bar is mobile-only, so no sm: step-down needed).
          className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-base text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </form>
    </div>
  );
}

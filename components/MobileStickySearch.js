"use client";

import { useEffect, useState } from "react";

// A compact search bar that slides in under the sticky header once the
// visitor scrolls past the hero, on narrow screens only (the desktop
// header keeps its own search icon). Gives mobile a persistent way back
// into search without scrolling up. Plain <form> - works with JS off
// (it just won't auto-hide).
export default function MobileStickySearch() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 top-[57px] z-20 border-b border-zinc-200 bg-paper/90 px-4 py-2 backdrop-blur transition-transform duration-200 lg:hidden dark:border-zinc-800 dark:bg-black/90 ${
        show ? "translate-y-0" : "-translate-y-[140%]"
      }`}
    >
      <form action="/search" className="relative">
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
          placeholder="Search a card or set…"
          className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </form>
    </div>
  );
}

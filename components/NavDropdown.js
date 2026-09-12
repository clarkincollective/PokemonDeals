"use client";

import { useEffect, useId, useRef, useState } from "react";

// One "Deals ▾" / "Cards & Sets ▾" dropdown in the desktop header.
//
// Interaction model:
//  - Mouse: opens on hover, closes on mouse-out (short delay so crossing
//    the gap to the panel doesn't flicker it shut).
//  - Click / keyboard: toggles AND "pins" it open - a pinned menu ignores
//    mouse-out and only closes on an outside click, Escape, or picking an
//    item. This stops a click-opener from losing the menu the moment they
//    move the pointer.
//
// Items are NAV_PRIMARY entries (lib/navLinks). An entry that declares
// `analyticsClick` / `analyticsProps` is emitted here exactly as the
// inline and mobile renderers emit it, so a destination is measurable
// wherever it is shown. Filter-style hrefs ("?") are nofollow'd.
export default function NavDropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  const pinnedRef = useRef(false);
  const closeTimer = useRef(null);
  const rootRef = useRef(null);
  const id = useId();

  const close = () => {
    clearTimeout(closeTimer.current);
    pinnedRef.current = false;
    setOpen(false);
  };

  const openHover = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };

  const closeHover = () => {
    if (pinnedRef.current) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const toggle = () => {
    clearTimeout(closeTimer.current);
    setOpen((wasOpen) => {
      pinnedRef.current = !wasOpen;
      return !wasOpen;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) close();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={openHover}
      onMouseLeave={closeHover}
      onFocusCapture={openHover}
      onBlur={closeHover}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className="flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold tracking-tight text-zinc-800 transition-colors hover:bg-zinc-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-red-500"
      >
        {label}
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>

      {/* Always rendered so the links are in the server HTML (crawlable);
          `hidden` (display:none) when closed also drops them from tab
          order and the a11y tree. */}
      <div
        id={id}
        hidden={!open}
        className="absolute left-0 top-full z-40 mt-1.5 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-card-hover dark:border-zinc-800 dark:bg-zinc-950"
      >
        {items.map((it) => (
          <a
            key={it.href}
            href={it.href}
            onClick={close}
            rel={it.href.includes("?") ? "nofollow" : undefined}
            data-analytics-click={it.analyticsClick ?? undefined}
            data-analytics-props={it.analyticsClick ? JSON.stringify(it.analyticsProps ?? {}) : undefined}
            className="block rounded-lg px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-red-500"
          >
            {it.label}
          </a>
        ))}
      </div>
    </div>
  );
}

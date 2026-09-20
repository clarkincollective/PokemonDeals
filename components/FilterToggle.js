"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";

// Collapse/expand wrapper for the filter rows. Below `lg` the rows are
// clutter on a page someone's actively scrolling, so they stay behind a
// "Filters" button (open automatically when a filter is already active).
// On `lg` and up there's room - the rows are always shown, no toggle, so
// filtering (especially region) is one click, not two.
//
// Deal-first R2: `collapsible` keeps the rows behind the button at EVERY
// width (the homepage feed shows a short mode row instead, and "More
// filters" opens the full set on demand). The rows are hidden with a
// class, never unmounted, so a crawler / no-JS visitor still sees every
// (nofollow'd) filter link either way.
//
// 2026-09-19 (growth brief §5): below `lg` the open panel is a bottom
// SHEET - role="dialog", focus moves to its Close button, Tab is trapped
// inside it, Escape / backdrop / "Show results" close it and focus returns
// to the button that opened it; a "Reset" action clears every filter. The
// sheet never opens itself on load (a modal that appears unasked on a
// phone is worse than a closed one), so `defaultOpen` only applies to the
// inline `lg` layout. Rows still stay in the DOM whether open or closed.
//
// Filters are links: picking one navigates, so "Show results" simply
// dismisses the sheet over the already-filtered results.

const DESKTOP_MQ = "(min-width: 1024px)"; // Tailwind `lg`

function subscribeDesktop(onChange) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(DESKTOP_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getDesktop = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DESKTOP_MQ).matches : false);
// Server snapshot = not desktop: the sheet chrome ships hidden in the HTML,
// so a phone never paints an open sheet before hydration.
const getDesktopServer = () => false;

export default function FilterToggle({
  defaultOpen,
  activeCount = 0,
  collapsible = false,
  label = "Filters",
  // Reset every filter: a plain href (server-rendered grids) or a handler
  // (client URL-state grids). Either renders the sheet's Reset action.
  resetHref = null,
  onReset = null,
  children,
}) {
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktop, getDesktopServer);
  const [inlineOpen, setInlineOpen] = useState(defaultOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = isDesktop ? inlineOpen : sheetOpen;
  const setOpen = isDesktop ? setInlineOpen : setSheetOpen;
  const sheetActive = open && !isDesktop;
  const openedOnce = useRef(false);
  const openerRef = useRef(null);
  const closeRef = useRef(null);
  const sheetRef = useRef(null);

  const toggle = () =>
    setOpen((o) => {
      if (!o && !openedOnce.current) {
        openedOnce.current = true;
        capture(EVENTS.FILTER_OPENED, { context: "all_deals" });
      }
      return !o;
    });
  const close = () => setSheetOpen(false);

  // Sheet mode only: lock the page, move focus in, trap Tab, close on
  // Escape, and hand focus back to the opener afterwards.
  useEffect(() => {
    if (!sheetActive || !sheetRef.current) return;
    const sheet = sheetRef.current;
    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSheetOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...sheet.querySelectorAll('a[href], button:not([disabled]), input, select')]
        .filter((el) => el.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [sheetActive]);

  const sheetClass = sheetActive
    ? "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl motion-safe:animate-sheet-in dark:bg-zinc-950"
    : "";
  const chrome = (
    <>
      <div hidden={!sheetActive} className="flex items-center justify-between lg:hidden">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {label}
          {activeCount > 0 && <span className="ml-1.5 text-xs font-medium text-zinc-500">{activeCount} active</span>}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Close filters"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      </div>
    </>
  );
  const footer = (
    <div hidden={!sheetActive} className="sticky bottom-0 -mx-5 mt-4 flex gap-2 border-t border-zinc-200 bg-white px-5 pt-3 lg:hidden dark:border-zinc-800 dark:bg-zinc-950">
      {(resetHref || onReset) && activeCount > 0 && (
        resetHref ? (
          <a
            href={resetHref}
            rel="nofollow"
            className="flex min-h-12 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:text-zinc-100"
          >
            Reset
          </a>
        ) : (
          <button
            type="button"
            onClick={() => { onReset(); close(); }}
            className="flex min-h-12 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:text-zinc-100"
          >
            Reset
          </button>
        )
      )}
      <button
        type="button"
        onClick={close}
        className="flex min-h-12 flex-1 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
      >
        Show results
      </button>
    </div>
  );
  const backdrop = (
    <div hidden={!sheetActive} className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={close} aria-hidden="true" />
  );
  const dialogProps = sheetActive ? { role: "dialog", "aria-modal": "true", "aria-label": label } : {};

  if (collapsible) {
    return (
      <div>
        <button
          ref={openerRef}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {label}
          {!open && activeCount > 0 && (
            <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{activeCount}</span>
          )}
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M5 7.5 10 12.5 15 7.5" />
          </svg>
        </button>
        {backdrop}
        <div ref={sheetRef} {...dialogProps} className={sheetClass}>
          {chrome}
          <div className={open ? "mt-4 block" : "hidden"}>{children}</div>
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        ref={openerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        // 13B.7.1 - real tap target (>= WCAG 2.5.8's 24px; ~44px here) for
        // the primary mobile way into the filters. -my-1.5 keeps the
        // visual position where it was.
        className="-my-1.5 flex min-h-[44px] items-center gap-1.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 hover:text-zinc-700 lg:hidden dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        Filters
        {!open && activeCount > 0 && (
          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {activeCount}
          </span>
        )}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>

      {backdrop}
      <div ref={sheetRef} {...dialogProps} className={sheetClass}>
        {chrome}
        <div className={`${open ? "mt-4 block" : "hidden"} lg:mt-0 lg:block`}>{children}</div>
        {footer}
      </div>
    </div>
  );
}

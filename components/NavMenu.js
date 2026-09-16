"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV_PRIMARY, NAV_GROUPS, NAV_LEARN, NAV_SEARCH } from "@/lib/navLinks";

// Mobile slide-in menu (deal-first R1; mobile UX refinement 2026-09-14).
// First screen: Search, then the deal shortcut tiles (`menuShortcut` in
// lib/navLinks). Everything else sits in expandable groups that follow the
// desktop header - remaining Deals, Cards & Sets - plus an About this site
// group (the inline Guides & Research entry and the Learn links the footer
// also carries). Every destination the menu had is still reachable.
//
// The header this button lives in uses backdrop-blur, which (per the CSS
// spec) makes it a containing block for position:fixed descendants -
// without a portal, the full-screen overlay gets trapped inside the
// header's own small box. `open` only becomes true from a client click,
// so document is always available by the time the portal renders.
export default function NavMenu() {
  const [open, setOpen] = useState(false);
  // One expanded group at a time keeps the panel short; null = all closed.
  const [expanded, setExpanded] = useState(null);
  const closeRef = useRef(null);
  const openerRef = useRef(null);
  const dialogRef = useRef(null);
  const close = () => {
    setOpen(false);
    setExpanded(null);
  };

  // Keep background content inert, contain focus and restore the opener.
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const opener = openerRef.current;
    const background = [...document.body.children]
      .filter((el) => el !== dialog)
      .map((el) => ({ el, inert: el.inert }));
    for (const { el } of background) el.inert = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setExpanded(null);
      }
      if (e.key !== "Tab") return;
      const items = [...dialog.querySelectorAll('a[href], button:not([disabled])')]
        .filter((el) => el.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const { el, inert } of background) el.inert = inert;
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  const itemClass =
    "flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-100 dark:hover:bg-zinc-900";
  const tileClass =
    "flex min-h-12 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-[15px] font-semibold leading-tight text-zinc-900 hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-600";
  const groupButtonClass =
    "flex min-h-12 w-full items-center justify-between rounded-lg px-3 text-left text-base font-semibold text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-50 dark:hover:bg-zinc-900";

  const linkFor = (link, className = itemClass) => (
    <a
      key={link.href}
      href={link.href}
      rel={link.href.includes("?") ? "nofollow" : undefined}
      onClick={close}
      // same nav model as the desktop bar, so an entry that declares an
      // event is measurable here too
      data-analytics-click={link.analyticsClick ?? undefined}
      data-analytics-props={link.analyticsClick ? JSON.stringify(link.analyticsProps ?? {}) : undefined}
      className={className}
    >
      {link.label}
    </a>
  );
  const tileFor = (link) => linkFor(link, tileClass);

  // Expandable groups, in desktop-header order. Shortcut tiles are not
  // repeated inside them.
  const groups = [
    ...NAV_GROUPS.map((group) => ({
      id: group.id,
      label: group.id === "deals" ? "More deals" : group.label,
      links: NAV_PRIMARY.filter((link) => link.group === group.id && !link.menuShortcut),
    })),
    {
      id: "learn",
      // Site help (How It Works / Methodology / FAQ). It used to be labelled
      // "Guides & help" - confusing once "News & Guides" sat directly above it.
      label: "About this site",
      links: [...NAV_PRIMARY.filter((link) => link.group == null), ...NAV_LEARN],
    },
  ].filter((g) => g.links.length > 0);

  const toggleGroup = (id) => setExpanded((current) => (current === id ? null : id));

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-6 w-6">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div ref={dialogRef} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Site menu">
            <div className="absolute inset-0 bg-black/50" onClick={close} />
            <div className="absolute right-0 top-0 flex h-full w-80 max-w-[88vw] flex-col overflow-y-auto bg-white p-5 shadow-xl dark:bg-zinc-950">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Menu</span>
                <button
                  ref={closeRef}
                  onClick={close}
                  aria-label="Close menu"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:hover:bg-zinc-900"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                    <line x1="5" y1="5" x2="19" y2="19" />
                    <line x1="19" y1="5" x2="5" y2="19" />
                  </svg>
                </button>
              </div>

              <nav aria-label="Site" className="flex flex-col">
                <a
                  href={NAV_SEARCH.href}
                  onClick={close}
                  className="flex min-h-12 items-center gap-2.5 rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-500 hover:border-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5 shrink-0" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="16.5" y1="16.5" x2="21" y2="21" />
                  </svg>
                  <span>
                    {NAV_SEARCH.label}
                    <span className="sr-only"> cards and prices</span>
                  </span>
                </a>

                <p className="mt-5 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Deals</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {NAV_PRIMARY.filter((link) => link.menuShortcut).map(tileFor)}
                </div>

                <div className="mt-4 flex flex-col divide-y divide-zinc-100 border-y border-zinc-100 dark:divide-zinc-900 dark:border-zinc-900">
                  {groups.map((group) => {
                    const isOpen = expanded === group.id;
                    const panelId = `site-menu-${group.id}`;
                    return (
                      <div key={group.id} className="py-1">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() => toggleGroup(group.id)}
                          className={groupButtonClass}
                        >
                          <span>{group.label}</span>
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                            <path d="M5 7.5 10 12.5 15 7.5" />
                          </svg>
                        </button>
                        <div id={panelId} hidden={!isOpen} className="pb-1 pl-2">
                          {group.links.map((link) => linkFor(link))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </nav>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

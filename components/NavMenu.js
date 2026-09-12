"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV_PRIMARY, NAV_GROUPS, NAV_LEARN, NAV_SEARCH } from "@/lib/navLinks";

// Mobile slide-in menu (deal-first R1). Grouped to match the desktop
// header - Deals, Cards & Sets, then the inline entries (Guides &
// Research) - plus Search and a small Learn group the footer also carries.
//
// The header this button lives in uses backdrop-blur, which (per the CSS
// spec) makes it a containing block for position:fixed descendants -
// without a portal, the full-screen overlay gets trapped inside the
// header's own small box. `open` only becomes true from a client click,
// so document is always available by the time the portal renders.
export default function NavMenu() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const close = () => setOpen(false);

  // focus lands on the close control when the panel opens; Escape closes
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const itemClass =
    "flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-zinc-100 dark:hover:bg-zinc-900";
  const groupLabel = "mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400";

  const linkFor = (link) => (
    <a
      key={link.href}
      href={link.href}
      rel={link.href.includes("?") ? "nofollow" : undefined}
      onClick={close}
      // same nav model as the desktop bar, so an entry that declares an
      // event is measurable here too
      data-analytics-click={link.analyticsClick ?? undefined}
      data-analytics-props={link.analyticsClick ? JSON.stringify(link.analyticsProps ?? {}) : undefined}
      className={itemClass}
    >
      {link.label}
    </a>
  );

  return (
    <>
      <button
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
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Site menu">
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

              <nav className="flex flex-col gap-0.5">
                {NAV_GROUPS.map((group) => (
                  <Fragment key={group.id}>
                    <div className={groupLabel}>{group.label}</div>
                    {NAV_PRIMARY.filter((link) => link.group === group.id).map(linkFor)}
                  </Fragment>
                ))}

                <div className={groupLabel}>More</div>
                {NAV_PRIMARY.filter((link) => link.group == null).map(linkFor)}
                <a href={NAV_SEARCH.href} onClick={close} className={itemClass}>
                  {NAV_SEARCH.label}
                </a>

                <div className={groupLabel}>Learn</div>
                {NAV_LEARN.map((link) => (
                  <a key={link.href} href={link.href} onClick={close} className={itemClass}>
                    {link.label}
                  </a>
                ))}
              </nav>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

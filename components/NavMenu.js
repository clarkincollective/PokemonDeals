"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { NAV_LINKS } from "@/lib/navLinks";

// The header this button lives in uses backdrop-blur, which (per the CSS
// spec) makes it a containing block for position:fixed descendants -
// without a portal, the "full screen" overlay below gets trapped inside
// the header's own small box instead of covering the viewport. open can
// only become true from a client click, never during SSR, so document is
// always available by the time this renders - no mount-check needed.
export default function NavMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-6 w-6">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-white p-6 shadow-xl dark:bg-zinc-950">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Menu</span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                    <line x1="5" y1="5" x2="19" y2="19" />
                    <line x1="19" y1="5" x2="5" y2="19" />
                  </svg>
                </button>
              </div>
              <nav className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={
                      link.emphasis
                        ? "rounded-lg px-3 py-2.5 text-base font-bold text-red-600 hover:bg-zinc-100 dark:text-red-500 dark:hover:bg-zinc-900"
                        : "rounded-lg px-3 py-2.5 text-base font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    }
                  >
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

"use client";

import { useState } from "react";

// Always shares our own /deals/[id] URL, never a raw eBay/TCGPlayer link -
// that page's own CTA is already affiliate-wrapped (see AffiliateLink in
// DealCard/deal detail), so sharing it is what actually gets us both the
// traffic (a friend/group chat opens OUR page first) and the affiliate
// credit (their eventual click-through is already tracked). Uses the
// native OS share sheet where available (iOS/Android/most modern
// browsers) - the simplest, most recognizable way for a visitor to send a
// link to a specific app/contact - falling back to copy-to-clipboard with
// a brief confirmation on desktop browsers without it.
// className fully controls padding/radius/gap (no default - the two call
// sites need different sizing and mixing a base padding/radius with an
// override via string concatenation is unreliable in Tailwind, since
// class order in the generated stylesheet, not in the attribute, decides
// which wins).
export default function ShareButton({ url, title, text, label, className }) {
  const [copied, setCopied] = useState(false);

  async function handleShare(e) {
    e.preventDefault();
    e.stopPropagation();

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // User cancelled the native share sheet - not an error.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (very old browser, insecure context) -
      // nothing sensible to fall back to; fail silently rather than
      // break the page.
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      title="Share this deal"
      aria-label="Share this deal"
      className={`flex shrink-0 items-center justify-center gap-1.5 border border-zinc-200 text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 ${className}`}
    >
      {copied ? (
        <span className="whitespace-nowrap text-[10px] font-semibold text-emerald-600 dark:text-emerald-500">
          Copied!
        </span>
      ) : (
        <>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
          >
            <path d="M10 3v10.5" />
            <path d="M6.2 6.8 10 3l3.8 3.8" />
            <path d="M4.5 10.5v4.8a1.2 1.2 0 0 0 1.2 1.2h8.6a1.2 1.2 0 0 0 1.2-1.2v-4.8" />
          </svg>
          {label && <span className="text-sm font-medium">{label}</span>}
        </>
      )}
    </button>
  );
}

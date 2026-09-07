"use client";

import { useEffect, useState } from "react";

// UX-CVR-1 §4 - a single, unobtrusive continuity line for a visitor who
// arrived from one of our social posts (utm_medium=social on the landing
// URL). It reassures them the page IS the live listing the post referred
// to. It never renders the raw UTM values, adds no storage, and shows
// nothing at all for organic / direct / search traffic.
export default function SocialLandingBadge() {
  const [fromSocial, setFromSocial] = useState(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const medium = (sp.get("utm_medium") || "").toLowerCase();
      const source = (sp.get("utm_source") || "").toLowerCase();
      const KNOWN = ["instagram", "tiktok", "x", "youtube"];
      setFromSocial(medium === "social" || KNOWN.includes(source));
    } catch {
      setFromSocial(false);
    }
  }, []);

  if (!fromSocial) return null;

  return (
    <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <span aria-hidden="true">•</span>
      You&apos;re viewing the live listing — details below are current.
    </p>
  );
}

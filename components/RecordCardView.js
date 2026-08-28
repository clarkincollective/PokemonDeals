"use client";

import { useEffect } from "react";
import { recordRecent } from "@/lib/recentCards";

// Renders nothing. Dropped onto a card hub so that opening the page adds
// it to the viewer's local "recently viewed" list (see lib/recentCards).
// `card` is a plain descriptor built on the server: { slug, name, set,
// image, price }.
export default function RecordCardView({ card }) {
  useEffect(() => {
    recordRecent(card);
    // slug is the identity of the page - re-record if it somehow changes
    // without a remount.
  }, [card?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

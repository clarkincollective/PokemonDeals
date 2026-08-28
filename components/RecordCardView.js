"use client";

import { useEffect } from "react";
import { recordRecent, cardKey } from "@/lib/recentCards";

// Renders nothing. Dropped onto a card hub or a deal page so that opening
// it adds the card to the viewer's local "recently viewed" list (see
// lib/recentCards). `card` is a plain descriptor built on the server:
//   { slug?, dealId?, name, set, image, price }
export default function RecordCardView({ card }) {
  const key = cardKey(card);
  useEffect(() => {
    recordRecent(card);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

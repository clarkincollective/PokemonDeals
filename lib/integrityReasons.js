// GEO audit 2026-09-19 - the pure half of the listing integrity report:
// how a recorded `disqualified_reason` string (lib/dealQuality's audit
// trail, "family:detail") maps to a plain-English family label, and how a
// list of them is grouped. No imports, so the test runner can load it
// directly; lib/integrityReport.js does the database reads.

// Wording matches lib/trustContent LISTING_CHECKS.
export const REASON_LABELS = Object.freeze({
  identity: "Title does not match the catalogue card (wrong card, set or number)",
  variant: "Different product form or printing than the catalogue card (jumbo, World Championship, prerelease, staff, wrong printing)",
  condition: "Seller-stated condition could not be verified, or the card is played / damaged / altered",
  authenticity: "Wording or images that indicate a replica, proxy or altered card",
  visual: "Image-based authenticity screen not passed",
  language: "Wrong language for the catalogue card",
  product: "Not a single trading card (sealed product, lot, merchandise, empty packaging)",
  reference: "No trustworthy market reference for this exact printing and condition",
  stale: "Not re-seen on eBay recently enough to show as live",
  other: "Other checks",
});

export function reasonFamily(reason) {
  const head = String(reason ?? "").split(":")[0].trim().toLowerCase();
  return REASON_LABELS[head] ? head : "other";
}

// reason strings -> [{ family, label, count }] sorted by count desc.
export function groupReasons(reasons) {
  const counts = new Map();
  for (const r of reasons) {
    const f = reasonFamily(r);
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([family, count]) => ({ family, label: REASON_LABELS[family], count }))
    .sort((a, b) => b.count - a.count);
}

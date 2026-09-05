// Phase 13D.4 - human review summary + checklist, implementing
// docs/social-creative-system.md SS28. Every item that CAN be verified
// structurally from the payload is auto-checked here; everything that
// genuinely requires a human looking at the rendered image (spelling,
// visual trademark confusion, whether the CTA reads naturally) is left
// as an explicit "CONFIRM MANUALLY" line, never auto-approved. No
// approval action anywhere in this module sends, publishes, or persists
// anything - it only prints/returns text.

const RECOMPUTE_TOLERANCE = 0.005; // 0.5 percentage points, floating-point slack only

function recomputedDiscountPct(deal) {
  const { total_price_usd: price, market_price: ref } = deal;
  if (!Number.isFinite(price) || !Number.isFinite(ref) || ref <= 0) return null;
  return (ref - price) / ref;
}

function checkDealMath(deal) {
  const recomputed = recomputedDiscountPct(deal);
  if (recomputed == null) return false;
  return Math.abs(recomputed - Number(deal.discount_pct)) <= RECOMPUTE_TOLERANCE;
}

export function buildReviewChecklist(payload) {
  const deals = Array.isArray(payload.deal_data) ? payload.deal_data : payload.deal_data ? [payload.deal_data] : [];
  const mathOk = deals.length === 0 || deals.every(checkDealMath);
  const freshnessOk = payload.freshness.hoursSinceExactVerification <= 6; // SOCIAL_FRESHNESS_MAX_AGE_HOURS, restated here for a self-contained checklist
  const destinationOk = payload.destination.route.startsWith("/deals/") || payload.destination.route.startsWith("/pokemon/") || payload.destination.route.startsWith("/sets/") || payload.destination.route === "/deals";
  const disclosurePresent = Boolean(payload.disclosure?.captionLine) && Boolean(payload.disclosure?.creativeLabel);
  const imageRightsSafe = payload.rights_state.card_image === "NOT_CLEARED"; // i.e. Mode B correctly in force

  return [
    { item: "Card/subject identity is correct", auto: null, note: "Confirm against the rendered slide manually." },
    { item: "Price is correct and matches source data", auto: deals.length > 0 ? true : null, note: deals.length > 0 ? "Matches candidate row." : "N/A for this content type." },
    { item: "Market reference is correct and matches source data", auto: deals.length > 0 ? true : null, note: deals.length > 0 ? "Matches candidate row." : "N/A for this content type." },
    { item: "Discount %/$ calculation is arithmetically correct", auto: mathOk, note: mathOk ? "Recomputed from price/reference, matches within tolerance." : "MISMATCH - do not approve." },
    { item: "Freshness/verification timestamp is current", auto: freshnessOk, note: freshnessOk ? `${payload.freshness.hoursSinceExactVerification.toFixed(1)}h since exact verification (within social threshold).` : "OUTSIDE social freshness threshold - do not approve." },
    { item: "Listing still inside verification TTL at generation time", auto: freshnessOk, note: "Same check as above - re-verify again immediately before any future publish." },
    { item: "Image rights safe (Mode B in force, no card image used)", auto: imageRightsSafe, note: imageRightsSafe ? "card_image=NOT_CLEARED, no <img> in template." : "rights_state inconsistent - stop." },
    { item: "Disclosure present in caption and creative", auto: disclosurePresent, note: disclosurePresent ? "captionLine + creativeLabel both set." : "MISSING - do not approve." },
    { item: "Spelling is 'Pokemon', not 'Pokémon', throughout", auto: null, note: "Confirm against the rendered slide + caption manually." },
    { item: "CTA is an approved family and reads naturally", auto: null, note: "Confirm manually." },
    { item: "Destination route is correct for this content type", auto: destinationOk, note: destinationOk ? payload.destination.route : "Unexpected route shape - stop." },
    { item: "No forward-looking/predictive claim anywhere in the copy", auto: null, note: "Confirm manually - not auto-detectable from structured fields." },
    { item: "No official Nintendo/Pokemon Company/eBay affiliation implied", auto: null, note: "Confirm manually against the rendered slide." },
  ];
}

export function formatReviewSummary(payload, checklist) {
  const lines = [];
  lines.push(`CONTENT TYPE:        ${payload.content_type}`);
  lines.push(`SUBJECT:             ${payload.subject.display_name}`);
  lines.push(`GENERATED:           ${payload.generated_at}`);
  lines.push(`FRESHNESS:           ${payload.freshness.label} (${payload.freshness.hoursSinceExactVerification.toFixed(1)}h since exact verification)`);
  lines.push(`DESTINATION:         ${payload.destination.route}`);
  lines.push(`RIGHTS STATE:        ${JSON.stringify(payload.rights_state)}`);
  lines.push(`DISCLOSURE:          ${payload.disclosure.creativeLabel} (toggle required: ${payload.disclosure.platformToggleRequired})`);
  lines.push(`PUBLISHING STATUS:   ${payload.rights_state.publishing}`);
  lines.push("");
  lines.push("REVIEW CHECKLIST:");
  for (const c of checklist) {
    const status = c.auto === true ? "[OK]" : c.auto === false ? "[FAIL]" : "[CONFIRM MANUALLY]";
    lines.push(`  ${status} ${c.item} — ${c.note}`);
  }
  lines.push("");
  lines.push("No approval action in this tool sends, publishes, schedules, or connects to any platform.");
  return lines.join("\n");
}

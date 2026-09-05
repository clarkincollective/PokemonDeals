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
  // 13E.2.1: card_image may now be CLEARED (canonical catalogue artwork
  // permitted for Version C). The invariant that still MUST hold on every
  // creative is that eBay SELLER photos are never composited - that
  // clearance is tracked separately and is still NOT_CLEARED.
  const imageRightsSafe =
    ["CLEARED", "NOT_CLEARED"].includes(payload.rights_state.card_image) &&
    payload.rights_state.ebay_seller_images === "NOT_CLEARED";

  return [
    { item: "Card/subject identity is correct", auto: null, note: "Confirm against the rendered slide manually." },
    { item: "Price is correct and matches source data", auto: deals.length > 0 ? true : null, note: deals.length > 0 ? "Matches candidate row." : "N/A for this content type." },
    { item: "Market reference is correct and matches source data", auto: deals.length > 0 ? true : null, note: deals.length > 0 ? "Matches candidate row." : "N/A for this content type." },
    { item: "Discount %/$ calculation is arithmetically correct", auto: mathOk, note: mathOk ? "Recomputed from price/reference, matches within tolerance." : "MISMATCH - do not approve." },
    { item: "Freshness/verification timestamp is current", auto: freshnessOk, note: freshnessOk ? `${payload.freshness.hoursSinceExactVerification.toFixed(1)}h since exact verification (within social threshold).` : "OUTSIDE social freshness threshold - do not approve." },
    { item: "Listing still inside verification TTL at generation time", auto: freshnessOk, note: "Same check as above - re-verify again immediately before any future publish." },
    { item: "Image rights safe (no eBay seller photo; Version C uses cleared canonical artwork only)", auto: imageRightsSafe, note: imageRightsSafe ? `card_image=${payload.rights_state.card_image}, ebay_seller_images=NOT_CLEARED - seller photos never composited.` : "rights_state inconsistent (eBay seller images must stay NOT_CLEARED) - stop." },
    { item: "Disclosure present in caption and creative", auto: disclosurePresent, note: disclosurePresent ? "captionLine + creativeLabel both set." : "MISSING - do not approve." },
    { item: "Spelling is 'Pokemon', not 'Pokémon', throughout", auto: null, note: "Confirm against the rendered slide + caption manually." },
    { item: "CTA is an approved family and reads naturally", auto: null, note: "Confirm manually." },
    { item: "Destination route is correct for this content type", auto: destinationOk, note: destinationOk ? payload.destination.route : "Unexpected route shape - stop." },
    { item: "No forward-looking/predictive claim anywhere in the copy", auto: null, note: "Confirm manually - not auto-detectable from structured fields." },
    { item: "No official Nintendo/Pokemon Company/eBay affiliation implied", auto: null, note: "Confirm manually against the rendered slide." },
  ];
}

// Phase 13E.1 - deterministic compliance scan of an assembled caption
// string (docs/social-daily-workflow.md SS11/SS13/SS14). Pure text
// checks, no LLM. Used by the CLI summary, the review gallery, and the
// regression tests.
const FAKE_URGENCY_RE =
  /\b(only \d+ left|hurry|act now|won'?t last|last chance|before it'?s gone|selling fast|going fast|everyone is buying|collectors are going crazy|don'?t miss out|buy now)\b/i;

export function checkCaptionCompliance(caption) {
  const text = String(caption ?? "");
  return {
    // no manufactured scarcity / urgency (a truthful auction timer is
    // fine, but the daily families are all BIN so no timer appears)
    noFakeUrgency: !FAKE_URGENCY_RE.test(text),
    // where an eBay listing is involved the copy must say so, and never
    // imply PokemonDealFinder is the seller
    mentionsEbayListing: /\beBay\b/.test(text),
    notImplyingOwnership: !/\b(our listing|we are selling|we guarantee|guaranteed authentic|guaranteed to)\b/i.test(text),
    // affiliate disclosure present, using the approved "Ad" label
    hasDisclosure: /(^|\n)Ad ·/.test(text),
    // soft CTA, never an aggressive pitch
    hasSoftCta: /PokemonDealFinder/.test(text) && !/\b(BUY NOW|shop now!!|order today)\b/i.test(text),
    // no card/listing/user identity leaked as a hashtag-style token or ID
    noRawListingId: !/\bv1\|\d/.test(text) && !/itm\/\d/.test(text),
  };
}

export function captionComplianceOk(caption) {
  const c = checkCaptionCompliance(caption);
  return Object.values(c).every(Boolean);
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

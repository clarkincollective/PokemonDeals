// Phase 13D.4.1 - the local static review gallery. Pure HTML string
// building from already-generated payload.json files - no server, no
// Next.js route, no authentication, no database write, no publish
// button anywhere in this file. Everything here is read-only local
// static output (see docs' "LOCAL STATIC OUTPUT" requirement).
//
// This file must NEVER read or embed an environment variable, API key,
// credential, or token - it only touches the already-sanitized payload
// objects lib/social/payload.mjs produces (which themselves are tested
// to contain no identity/secret data). See
// tests/scanner/social-preview-system.test.mjs's secret-leak tests.

import { buildReviewChecklist } from "./reviewSummary.mjs";
import { assembleCaption } from "./caption.mjs";

const FAMILY_LABELS = {
  "deal-of-day": "Deal of the Day",
  "best-deals": "Best Deals Found Today",
  "just-found": "Just Found",
  "pokemon-spotlight": "Pokemon Spotlight",
  "set-spotlight": "Set Spotlight",
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function checklistHtml(checklist) {
  return checklist
    .map((c) => {
      const status = c.auto === true ? "OK" : c.auto === false ? "FAIL" : "MANUAL";
      const cls = c.auto === true ? "ok" : c.auto === false ? "fail" : "manual";
      return `<li class="check ${cls}"><span class="check-badge">${status}</span> ${esc(c.item)} <span class="check-note">${esc(c.note)}</span></li>`;
    })
    .join("");
}

function coverThumb(family) {
  // best-deals produces numbered carousel files (01-cover-A.png, ...);
  // every other family produces preview-A.png/preview-B.png.
  const thumb = family === "best-deals" ? "01-cover-A.png" : "preview-A.png";
  return `${family}/${thumb}`;
}

function familyCard(entry) {
  const { family, payload } = entry;
  const checklist = buildReviewChecklist(payload);
  const standardCaption = assembleCaption(payload, { variant: "standard" });
  const shortCaption = assembleCaption(payload, { variant: "short" });
  const label = FAMILY_LABELS[family] ?? family;
  const thumbSrc = coverThumb(family);

  return `
  <section class="family-card">
    <div class="family-header">
      <h2>${esc(label)}</h2>
      <span class="publishing-badge">PUBLISHING: ${esc(payload.rights_state.publishing)}</span>
    </div>
    <div class="family-body">
      <img class="thumb" src="${thumbSrc}" alt="${esc(label)} preview" />
      <div class="details">
        <table class="fact-table">
          <tr><th>Subject</th><td>${esc(payload.subject.display_name)}</td></tr>
          <tr><th>Content type</th><td>${esc(payload.content_type)}</td></tr>
          <tr><th>Generated</th><td>${esc(payload.generated_at)}</td></tr>
          <tr><th>Freshness</th><td>${esc(payload.freshness.label)} (${payload.freshness.hoursSinceExactVerification.toFixed(1)}h since exact verification)</td></tr>
          <tr><th>Destination</th><td>${esc(payload.destination.route)}</td></tr>
          <tr><th>UTM preview</th><td><code>${esc(new URLSearchParams(payload.destination.utm).toString())}</code></td></tr>
          <tr><th>Disclosure</th><td>${esc(payload.disclosure.creativeLabel)} (platform toggle required: ${payload.disclosure.platformToggleRequired})</td></tr>
          <tr><th>Rights state</th><td><code>${esc(JSON.stringify(payload.rights_state))}</code></td></tr>
        </table>

        <h3>Auto checks</h3>
        <ul class="check-list">${checklistHtml(checklist)}</ul>

        <h3>Caption — SHORT</h3>
        <pre class="caption">${esc(shortCaption)}</pre>
        <h3>Caption — STANDARD</h3>
        <pre class="caption">${esc(standardCaption)}</pre>
      </div>
    </div>
  </section>`;
}

export function buildGalleryHtml(entries) {
  const cards = entries.map(familyCard).join("\n");
  const generatedAt = new Date().toISOString();
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>PokemonDealFinder — Local Social Preview Review</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #FAFAF8; color: #18181B; margin: 0; padding: 32px; }
  h1 { font-size: 28px; }
  .banner { background: #FEF2F2; border: 2px solid #DC2626; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; font-weight: 700; color: #7F1D1D; }
  .family-card { background: white; border: 1px solid #E4E4E7; border-radius: 16px; margin-bottom: 32px; overflow: hidden; }
  .family-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #E4E4E7; }
  .publishing-badge { background: #18181B; color: white; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
  .family-body { display: flex; gap: 24px; padding: 24px; }
  .thumb { width: 300px; height: 375px; object-fit: cover; border-radius: 12px; border: 1px solid #E4E4E7; flex-shrink: 0; }
  .details { flex: 1; min-width: 0; }
  .fact-table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 16px; }
  .fact-table th { text-align: left; color: #71717A; padding: 4px 12px 4px 0; vertical-align: top; white-space: nowrap; }
  .fact-table td { padding: 4px 0; word-break: break-word; }
  .check-list { list-style: none; padding: 0; margin: 0 0 16px 0; font-size: 14px; }
  .check { padding: 4px 0; }
  .check-badge { display: inline-block; width: 56px; font-weight: 800; font-size: 11px; }
  .check.ok .check-badge { color: #059669; }
  .check.fail .check-badge { color: #DC2626; }
  .check.manual .check-badge { color: #A16207; }
  .check-note { color: #71717A; }
  .caption { background: #FAFAF8; border: 1px solid #E4E4E7; border-radius: 8px; padding: 12px; font-size: 13px; white-space: pre-wrap; }
  code { background: #F4F4F5; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
  <h1>PokemonDealFinder — Local Social Preview Review</h1>
  <div class="banner">LOCAL PREVIEW ONLY — nothing on this page is published, scheduled, or connected to any platform. Generated ${esc(generatedAt)}.</div>
  ${cards || "<p>No previews generated yet. Run: npm run social:preview -- all</p>"}
</body>
</html>`;
}

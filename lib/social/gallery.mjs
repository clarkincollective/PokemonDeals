// Phase 13D.4.1 / 13E.1 - the local static DAILY REVIEW QUEUE. Pure HTML
// string building from already-generated payloads - no server, no
// Next.js route, no authentication, no database write, and NO PUBLISH
// CONTROL anywhere in this file. "Approve"/"Reject" here is local
// review-workflow state only (browser localStorage, per-viewer, never
// sent anywhere - SS15). Nothing on this page is connected to any
// platform.
//
// This file must NEVER read or embed an environment variable, API key,
// credential, or token - it only touches the already-sanitized payload
// objects lib/social/payload.mjs produces.

import { buildReviewChecklist } from "./reviewSummary.mjs";
import { RIGHTS_STATE_REASON } from "./rights.mjs";

const FAMILY_LABELS = {
  "deal-of-day": "Deal of the Day",
  "just-found": "Just Found",
  "pokemon-spotlight": "Pokemon Spotlight",
  "set-spotlight": "Set Spotlight",
  "market-snapshot": "Market Snapshot",
  "best-deals": "Best Deals Found Today",
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const REJECTION_REASONS = ["BAD IMAGE", "WEAK DEAL", "WRONG CARD", "DUPLICATE", "BORING", "STALE", "COPY NEEDS WORK", "OTHER"];

// Phase 13E.2 - the 5 manual checks for an AI-generated background (SS17).
const ASSET_REVIEW_CHECKS = [
  ["generated_background", "GENERATED BACKGROUND"],
  ["copyright_risk", "COPYRIGHT RISK"],
  ["brand_fit", "BRAND FIT"],
  ["text_legibility", "TEXT LEGIBILITY"],
  ["ai_artifact", "AI ARTIFACT"],
];

function pct(n) {
  return n == null ? "—" : `${Math.round(Number(n) * 100)}%`;
}
function usd(n) {
  return n == null ? "—" : `$${Number(n).toFixed(2)}`;
}

// The one representative deal for the fact table (single-deal families) or
// null (spotlight / snapshot show aggregate facts instead).
function primaryDeal(payload) {
  if (payload.content_type === "market_snapshot") return null;
  return Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
}

function factRows(payload) {
  const rows = [];
  const d = primaryDeal(payload);
  if (d) {
    rows.push(["Card / subject", esc(d.card_name)]);
    rows.push(["Listing price", `${usd(d.total_price_usd)} (USD) — live eBay listing`]);
    rows.push(["Market reference", `${usd(d.market_price)} (USD)`]);
    rows.push(["Gap below reference", pct(d.discount_pct)]);
    rows.push(["Raw / graded", d.is_graded ? esc(`${d.grader ?? "Graded"} ${d.grade ?? ""}`.trim()) : "Raw"]);
    rows.push(["Marketplace", esc((d.marketplace ?? "").replace("EBAY_", "")) || "—"]);
  } else if (payload.content_type === "market_snapshot") {
    const m = payload.market_snapshot;
    rows.push(["Subject", "Today's under-market snapshot (aggregate)"]);
    rows.push(["Cards under reference", String(m.deal_count)]);
    rows.push(["Biggest gap", `${pct(m.biggest_gap_pct)}${m.biggest_gap_card ? ` — ${esc(m.biggest_gap_card)}` : ""}`]);
    rows.push(["Median gap", pct(m.median_gap_pct)]);
    rows.push(["Median listed", `${usd(m.median_listed_usd)} (USD)`]);
  } else {
    // spotlight
    rows.push(["Subject", esc(payload.subject.display_name)]);
    rows.push(["Live deals in group", String(payload.subject.deal_count)]);
    const top = payload.deal_data?.[0];
    if (top) {
      rows.push(["Best current gap", `${pct(top.discount_pct)} — ${esc(top.card_name)}`]);
      rows.push(["From", `${usd(top.total_price_usd)} (USD)`]);
    }
  }
  rows.push(["Freshness", `${esc(payload.freshness.label)} (${payload.freshness.hoursSinceExactVerification.toFixed(1)}h since exact verification)`]);
  rows.push(["Destination", esc(payload.destination.route)]);
  rows.push(["Platform suitability", "Instagram feed + TikTok photo/carousel (1080×1350)"]);
  return rows;
}

function rightsRows(payload) {
  return Object.entries(payload.rights_state).map(
    ([k, v]) => `<tr><th>${esc(k)}</th><td><code>${esc(v)}</code></td><td class="rights-reason">${esc(RIGHTS_STATE_REASON[k] ?? "")}</td></tr>`
  ).join("");
}

function checklistHtml(payload) {
  const checklist = buildReviewChecklist(payload);
  return checklist
    .map((c) => {
      const status = c.auto === true ? "OK" : c.auto === false ? "FAIL" : "MANUAL";
      const cls = c.auto === true ? "ok" : c.auto === false ? "fail" : "manual";
      return `<li class="check ${cls}"><span class="check-badge">${status}</span> ${esc(c.item)} <span class="check-note">${esc(c.note)}</span></li>`;
    })
    .join("");
}

function warningFlags(payload) {
  const checklist = buildReviewChecklist(payload);
  const fails = checklist.filter((c) => c.auto === false).map((c) => c.item);
  const flags = [...fails];
  // 13E.2.1: card_image may legitimately be CLEARED now. The invariant
  // that must still hold on every creative is that eBay SELLER photos are
  // never composited.
  if (payload.rights_state.ebay_seller_images !== "NOT_CLEARED") flags.push("ebay_seller_images is no longer NOT_CLEARED - stop and re-check Layer 2 source");
  if (!["CLEARED", "NOT_CLEARED"].includes(payload.rights_state.card_image)) flags.push(`card_image rights state is unexpected (${payload.rights_state.card_image}) - stop`);
  return flags;
}

// Phase 13E.2 / 13E.2.1 - the side-by-side creative block:
//   A  deterministic Mode B (always)
//   B  A's overlay over an approved data-free OpenAI background (if in rotation)
//   C  A/B's overlay + the REAL canonical card artwork (if card_image
//      CLEARED and the exact printing verified - else fails closed)
//   D  brand ad: background + a REAL site screenshot (only if one is cached)
// No version is pre-selected - the owner picks in the review block below.
function mediaBlock(entry) {
  const { family, thumb, enhanced, cardVersion, brandAd } = entry;
  const label = FAMILY_LABELS[family] ?? family;
  const shots = [
    `
      <figure class="shot">
        <img class="thumb" src="${esc(thumb)}" alt="${esc(label)} — deterministic creative" />
        <figcaption><strong>A</strong> — deterministic (Mode B)</figcaption>
      </figure>`,
  ];
  if (enhanced) {
    shots.push(`
      <figure class="shot">
        <img class="thumb" src="${esc(enhanced.thumb)}" alt="${esc(label)} — background-enhanced creative" />
        <figcaption><strong>B</strong> — OpenAI background<br><span class="note">asset ${esc(enhanced.assetId)} · ${esc(enhanced.style ?? "")}/${esc(enhanced.zone ?? "")}</span></figcaption>
      </figure>`);
  }
  if (cardVersion) {
    const sub = cardVersion.tcgplayerId
      ? `tcgplayer #${esc(cardVersion.tcgplayerId)}${cardVersion.cardNumber ? " · " + esc(cardVersion.cardNumber) : ""}`
      : cardVersion.cards
        ? `${cardVersion.cards.length} exact printings`
        : "";
    shots.push(`
      <figure class="shot">
        <img class="thumb" src="${esc(cardVersion.thumb)}" alt="${esc(label)} — real card artwork creative" />
        <figcaption><strong>C</strong> — real canonical card<br><span class="note">${esc(cardVersion.presentation)} · ${sub}</span></figcaption>
      </figure>`);
  }
  if (brandAd && brandAd.status === "ready") {
    shots.push(`
      <figure class="shot">
        <img class="thumb" src="${esc(brandAd.thumb)}" alt="${esc(label)} — brand ad creative" />
        <figcaption><strong>D</strong> — brand ad<br><span class="note">real ${esc(brandAd.origin ?? "site")} screenshot</span></figcaption>
      </figure>`);
  }
  return `<div class="media${shots.length === 1 ? " media-solo" : ""}">${shots.join("")}</div>`;
}

// Version C image-rights panel (SS19): CARD IMAGE / SOURCE / PRINTING MATCH.
function imageRightsBlock(entry) {
  const { payload, cardVersion, cardVersionFailed } = entry;
  const rights = payload.rights_state.card_image;
  const pm = cardVersion?.printingMatch ?? cardVersionFailed?.printingMatch ?? null;
  const pmText = cardVersion ? "PASS" : cardVersionFailed ? "FAIL" : "—";
  const pmReason = cardVersion?.printingMatch?.reason ?? cardVersionFailed?.reason ?? "";
  const source = cardVersion?.provider ?? cardVersionFailed?.provider ?? "TCGplayer product CDN (canonical catalogue artwork)";
  return `
        <h3>Version C — card image rights <span class="note">(SS19)</span></h3>
        <table class="fact-table">
          <tr><th>CARD IMAGE</th><td><code>${esc(rights)}</code></td></tr>
          <tr><th>SOURCE</th><td>${esc(source)}${cardVersion?.sourceUrl ? ` — <code>${esc(cardVersion.sourceUrl)}</code>` : ""}</td></tr>
          <tr><th>PRINTING MATCH</th><td><strong class="${pmText === "PASS" ? "pm-pass" : pmText === "FAIL" ? "pm-fail" : ""}">${pmText}</strong>${pmReason ? ` — ${esc(pmReason)}` : ""}</td></tr>
        </table>
        <p class="note">${
          cardVersion
            ? "Real canonical artwork for the exact matched printing. Never an eBay seller photo, never AI-generated, never a species-level generic. eBay seller-image evidence is a separate, still-uncleared requirement."
            : "Version C failed closed — Mode B (A/B) stands. C is only offered when card_image=CLEARED and the exact printing verifies."
        }</p>`;
}

function assetReviewBlock(entry) {
  const { family, payload, enhanced, cardVersion, brandAd } = entry;
  if (!enhanced && !cardVersion && !entry.cardVersionFailed && !(brandAd && brandAd.status === "ready")) return "";
  const dateKey = String(payload.generated_at).slice(0, 10);
  const assetKey = `pdf-social-asset-review::${dateKey}::${family}`;

  const bgChecks = enhanced
    ? `
        <h3>OpenAI background (Version B) — human review <span class="note">(SS17 · local only)</span></h3>
        <p class="note">Source asset <code>${esc(enhanced.sourceFile ?? enhanced.assetId)}</code>. Image generation received no card / price / listing / user data and drew no card — it is an evergreen background; every fact on the slide is the deterministic overlay.</p>
        <div class="asset-checks" data-asset-key="${esc(assetKey)}">
          ${ASSET_REVIEW_CHECKS.map(
            ([k, lbl]) => `
          <div class="acheck" data-check="${k}"><span class="acheck-label">${lbl}</span><button type="button" class="abtn" data-v="PASS">PASS</button><button type="button" class="abtn" data-v="REJECT">REJECT</button></div>`
          ).join("")}
        </div>`
    : `<div class="asset-checks" data-asset-key="${esc(assetKey)}" hidden></div>`;

  const cardBlock = cardVersion || entry.cardVersionFailed ? imageRightsBlock(entry) : "";

  const pubButtons = ["A"]
    .concat(enhanced ? ["B"] : [])
    .concat(cardVersion ? ["C"] : [])
    .concat(brandAd && brandAd.status === "ready" ? ["D"] : [])
    .map((v) => `<button type="button" class="abtn" data-pub="${v}">${v}</button>`)
    .join("");

  return `
        ${bgChecks}
        ${cardBlock}
        <div class="asset-publish" data-publish-key="${esc(assetKey)}::pub">
          <span class="acheck-label">PUBLISH WHICH VERSION?</span>
          ${pubButtons}
        </div>
        <p class="note">No version is auto-preferred — the owner picks. Version C is real canonical card artwork for the exact matched printing (fails closed otherwise). Nothing here is published.</p>`;
}

function candidateCard(entry) {
  const { family, payload, hashtags = [], captions = {}, reasonSelected = "" } = entry;
  const label = FAMILY_LABELS[family] ?? family;
  const flags = warningFlags(payload);
  const dateKey = String(payload.generated_at).slice(0, 10);
  const stateKey = `pdf-social-review::${dateKey}::${family}`;

  return `
  <section class="candidate" data-state-key="${esc(stateKey)}">
    <div class="cand-header">
      <div><span class="cand-family">${esc(label)}</span> <span class="cand-type">${esc(payload.content_type)}</span></div>
      <div class="review-controls">
        <button type="button" class="btn approve" data-action="approve">Approve (local)</button>
        <button type="button" class="btn reject" data-action="reject">Reject</button>
        <select class="reject-reason" data-role="reject-reason">
          <option value="">reason…</option>
          ${REJECTION_REASONS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("")}
        </select>
        <span class="review-status" data-role="status">unreviewed</span>
      </div>
    </div>

    <div class="cand-body">
      ${mediaBlock(entry)}
      <div class="details">
        <p class="reason"><strong>Why selected:</strong> ${esc(reasonSelected)}</p>

        ${flags.length ? `<div class="flags"><strong>⚠ Warning flags:</strong> ${flags.map(esc).join(" · ")}</div>` : `<div class="flags ok">No auto-check warnings.</div>`}

        <table class="fact-table">
          ${factRows(payload).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("")}
        </table>

        <h3>Rights state (per capability)</h3>
        <table class="fact-table rights"><tbody>${rightsRows(payload)}</tbody></table>
        <p class="note">eBay seller-image evidence: <code>${esc(payload.rights_state.ebay_seller_images)}</code> — a seller photo is NEVER composited. Version C (when shown) uses the real CANONICAL catalogue artwork for the exact printing, which is a separate clearance.</p>

        <h3>Instagram caption</h3>
        <pre class="caption">${esc(captions.instagram ?? "")}</pre>
        <h3>TikTok caption</h3>
        <pre class="caption">${esc(captions.tiktok ?? "")}</pre>

        <h3>Hashtags <span class="note">(separate from caption — edit/drop freely)</span></h3>
        <pre class="hashtags">${esc(hashtags.join(" "))}</pre>

        <h3>Auto checks</h3>
        <ul class="check-list">${checklistHtml(payload)}</ul>
        ${assetReviewBlock(entry)}
      </div>
    </div>
  </section>`;
}

export function buildDailyGalleryHtml(entries, meta = {}) {
  const { warnings = [], rejected = [], considered = 0, generatedAt = new Date().toISOString() } = meta;
  const cards = entries.map(candidateCard).join("\n");
  const mixBanner = warnings.length
    ? `<div class="mix-warn"><strong>Daily mix warnings:</strong><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`
    : `<div class="mix-ok">Daily mix looks balanced — ${entries.length} post${entries.length === 1 ? "" : "s"} across ${new Set(entries.map((e) => e.family)).size} format${new Set(entries.map((e) => e.family)).size === 1 ? "" : "s"}.</div>`;
  const rejectedBlock = rejected.length
    ? `<details class="rejected"><summary>${rejected.length} of ${considered} families produced no post today</summary><ul>${rejected
        .map((r) => `<li><strong>${esc(FAMILY_LABELS[r.family] ?? r.family)}:</strong> ${esc(r.reason)}</li>`)
        .join("")}</ul></details>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PokemonDealFinder — Daily Social Review Queue</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #FAFAF8; color: #18181B; margin: 0; padding: 32px; max-width: 1100px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .sub { color: #71717A; font-size: 13px; margin-bottom: 20px; }
  .publish-banner { background: #18181B; color: #fff; border-radius: 12px; padding: 14px 20px; font-weight: 800; letter-spacing: 0.02em; margin-bottom: 16px; }
  .mix-warn { background: #FEF3C7; border: 2px solid #D97706; border-radius: 12px; padding: 12px 18px; margin-bottom: 16px; color: #7C2D12; }
  .mix-warn ul { margin: 6px 0 0; padding-left: 18px; }
  .mix-ok { background: #ECFDF5; border: 1px solid #059669; border-radius: 12px; padding: 10px 18px; margin-bottom: 16px; color: #065F46; font-size: 14px; }
  .rejected { background: #fff; border: 1px solid #E4E4E7; border-radius: 12px; padding: 10px 18px; margin-bottom: 24px; font-size: 13px; }
  .rejected summary { cursor: pointer; font-weight: 700; }
  .rejected ul { margin: 8px 0 0; padding-left: 18px; }
  .candidate { background: #fff; border: 1px solid #E4E4E7; border-radius: 16px; margin-bottom: 28px; overflow: hidden; }
  .candidate.is-approved { border-color: #059669; box-shadow: 0 0 0 2px #05966933; }
  .candidate.is-rejected { border-color: #DC2626; opacity: 0.75; }
  .cand-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 22px; border-bottom: 1px solid #E4E4E7; flex-wrap: wrap; }
  .cand-family { font-weight: 800; font-size: 15px; }
  .cand-type { color: #71717A; font-size: 12px; }
  .review-controls { display: flex; align-items: center; gap: 8px; }
  .btn { border: 1px solid #D4D4D8; background: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .btn.approve.active { background: #059669; color: #fff; border-color: #059669; }
  .btn.reject.active { background: #DC2626; color: #fff; border-color: #DC2626; }
  .reject-reason { border: 1px solid #D4D4D8; border-radius: 8px; padding: 6px 8px; font-size: 12px; }
  .review-status { font-size: 12px; color: #71717A; min-width: 90px; }
  .cand-body { display: flex; gap: 24px; padding: 22px; flex-wrap: wrap; }
  .media { display: flex; gap: 14px; flex-shrink: 0; }
  .media-solo { }
  .shot { margin: 0; }
  .shot figcaption { font-size: 11px; color: #52525B; margin-top: 6px; text-align: center; line-height: 1.3; }
  .thumb { width: 240px; height: 300px; object-fit: cover; border-radius: 12px; border: 1px solid #E4E4E7; display: block; }
  .details { flex: 1; min-width: 280px; }
  .asset-checks { display: flex; flex-direction: column; gap: 6px; background: #FAFAF8; border: 1px solid #E4E4E7; border-radius: 8px; padding: 12px; margin: 6px 0 8px; }
  .acheck, .apublish, .asset-publish { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .asset-publish { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #E4E4E7; flex-wrap: wrap; }
  .pm-pass { color: #059669; } .pm-fail { color: #DC2626; }
  .acheck-label { flex: 1; font-weight: 700; letter-spacing: 0.03em; color: #3F3F46; }
  .apublish { border-top: 1px dashed #E4E4E7; margin-top: 4px; padding-top: 8px; }
  .abtn { border: 1px solid #D4D4D8; background: #fff; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 800; cursor: pointer; }
  .abtn.pass { background: #059669; color: #fff; border-color: #059669; }
  .abtn.fail { background: #DC2626; color: #fff; border-color: #DC2626; }
  .abtn.pub { background: #18181B; color: #fff; border-color: #18181B; }
  .reason { font-size: 14px; margin: 0 0 10px; }
  .flags { font-size: 13px; background: #FEF2F2; border: 1px solid #DC2626; color: #7F1D1D; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
  .flags.ok { background: #F4F4F5; border-color: #E4E4E7; color: #71717A; }
  .fact-table { border-collapse: collapse; width: 100%; font-size: 13px; margin-bottom: 14px; }
  .fact-table th { text-align: left; color: #71717A; padding: 4px 12px 4px 0; vertical-align: top; white-space: nowrap; }
  .fact-table td { padding: 4px 0; word-break: break-word; }
  .fact-table.rights td:first-child { white-space: nowrap; }
  .rights-reason { color: #71717A; font-size: 12px; }
  h3 { font-size: 13px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; color: #52525B; }
  .note { color: #A1A1AA; font-size: 11px; text-transform: none; letter-spacing: 0; font-weight: 400; }
  .caption, .hashtags { background: #FAFAF8; border: 1px solid #E4E4E7; border-radius: 8px; padding: 12px; font-size: 13px; white-space: pre-wrap; margin: 0 0 8px; }
  .hashtags { color: #2563EB; }
  .check-list { list-style: none; padding: 0; margin: 0; font-size: 13px; }
  .check { padding: 3px 0; }
  .check-badge { display: inline-block; width: 54px; font-weight: 800; font-size: 11px; }
  .check.ok .check-badge { color: #059669; }
  .check.fail .check-badge { color: #DC2626; }
  .check.manual .check-badge { color: #A16207; }
  .check-note { color: #71717A; }
  code { background: #F4F4F5; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
  <h1>PokemonDealFinder — Daily Social Review Queue</h1>
  <p class="sub">Generated ${esc(generatedAt)}. ${entries.length} candidate post${entries.length === 1 ? "" : "s"} for review.</p>

  <div class="publish-banner">REVIEW ONLY — PUBLISHING DISABLED. Nothing on this page is published, scheduled, or connected to Instagram, TikTok, or any platform. Approve/Reject below is local workflow state only; the owner publishes selected content manually. Versions: A = deterministic Mode B · B = A over an approved data-free OpenAI background · C = A/B plus the REAL canonical card artwork for the exact matched printing (fails closed otherwise) · D = brand ad with a real site screenshot. No version is auto-preferred — the owner chooses.</div>

  ${mixBanner}
  ${rejectedBlock}

  ${cards || "<p>No candidate posts today — inventory did not support any format. This is expected behaviour, not an error.</p>"}

<script>
(function () {
  function load(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  document.querySelectorAll(".candidate").forEach(function (card) {
    var key = card.getAttribute("data-state-key");
    var approveBtn = card.querySelector('[data-action="approve"]');
    var rejectBtn = card.querySelector('[data-action="reject"]');
    var reasonSel = card.querySelector('[data-role="reject-reason"]');
    var statusEl = card.querySelector('[data-role="status"]');
    function render(state) {
      card.classList.toggle("is-approved", state && state.decision === "approve");
      card.classList.toggle("is-rejected", state && state.decision === "reject");
      approveBtn.classList.toggle("active", state && state.decision === "approve");
      rejectBtn.classList.toggle("active", state && state.decision === "reject");
      if (state && state.decision === "approve") statusEl.textContent = "APPROVED (local)";
      else if (state && state.decision === "reject") statusEl.textContent = "REJECTED" + (state.reason ? " · " + state.reason : "");
      else statusEl.textContent = "unreviewed";
      if (state && state.reason) reasonSel.value = state.reason;
    }
    var initial = load(key);
    render(initial);
    approveBtn.addEventListener("click", function () { var s = { decision: "approve", at: new Date().toISOString() }; save(key, s); render(s); });
    rejectBtn.addEventListener("click", function () { var s = { decision: "reject", reason: reasonSel.value || "", at: new Date().toISOString() }; save(key, s); render(s); });
    reasonSel.addEventListener("change", function () { var s = load(key); if (s && s.decision === "reject") { s.reason = reasonSel.value; save(key, s); render(s); } });
  });

  // Phase 13E.2 - the 5 generated-background checks (local only).
  document.querySelectorAll(".asset-checks").forEach(function (box) {
    var key = box.getAttribute("data-asset-key");
    var state = load(key) || {};
    function paint() {
      box.querySelectorAll(".acheck").forEach(function (row) {
        var name = row.getAttribute("data-check");
        row.querySelectorAll(".abtn").forEach(function (b) {
          var v = b.getAttribute("data-v");
          b.classList.toggle("pass", state[name] === "PASS" && v === "PASS");
          b.classList.toggle("fail", state[name] === "REJECT" && v === "REJECT");
        });
      });
    }
    box.querySelectorAll(".acheck .abtn").forEach(function (b) {
      b.addEventListener("click", function () {
        var name = b.closest(".acheck").getAttribute("data-check");
        state[name] = b.getAttribute("data-v");
        save(key, state); paint();
      });
    });
    paint();
  });

  // Phase 13E.2.1 - the A/B/C/D publish pick (local only, never auto-set).
  document.querySelectorAll(".asset-publish").forEach(function (box) {
    var key = box.getAttribute("data-publish-key");
    var state = load(key) || {};
    function paint() {
      box.querySelectorAll(".abtn").forEach(function (b) {
        b.classList.toggle("pub", state.publish === b.getAttribute("data-pub"));
      });
    }
    box.querySelectorAll(".abtn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.publish = b.getAttribute("data-pub");
        save(key, state); paint();
      });
    });
    paint();
  });
})();
</script>
</body>
</html>`;
}

// Back-compat: the older `social:preview` gallery entry point still used
// by scripts/socialPreview.mjs. Unchanged shape.
export function buildGalleryHtml(entries) {
  return buildDailyGalleryHtml(
    entries.map((e) => ({
      family: e.family,
      payload: e.payload,
      thumb: `${e.family}/${e.family === "best-deals" ? "01-cover-A.png" : "preview-A.png"}`,
      captions: { instagram: "", tiktok: "" },
      hashtags: [],
      reasonSelected: "(preview mode — no daily selection reason)",
    })),
    {}
  );
}

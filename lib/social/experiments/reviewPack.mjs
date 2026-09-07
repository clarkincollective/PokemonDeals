// Phase 13E.10A - CREATIVE EXPERIMENT REVIEW PACK (§17, §18).
//
// A DRY-RUN, structured side-by-side for the initial experiment slate,
// built from EXISTING fixture / snapshot data only. It renders the exact
// hook + CTA strings each variant would use, plus the facts, eligibility,
// destination and "why this test matters". It never publishes and never
// pretends fixture data is live - every item is labelled SIMULATION /
// REVIEW ONLY. No second renderer: text manifest.

import { EXPERIMENTS } from "./experiments.mjs";
import { renderHook, HOOK_VARIANTS } from "./hooks.mjs";
import { CTA_VARIANTS, ctaLabel } from "./ctas.mjs";
import { factsFromCandidate, destinationKindForFamily, defaultHookFor, defaultCtaFor } from "./index.mjs";
import { experimentApplies } from "./experiments.mjs";

const WHY = {
  e1_deal_hook_pricecontrast_vs_percentgap: "The Deal Drop hook is the single biggest lever on the scroll-stop → website-visit step. If a concrete '$X → $Y' contrast beats a '% below market' line for outbound clicks, every future Deal Drop should lead with it.",
  e2_deal_cta_seelivedeal_vs_checkcurrentlisting: "The CTA wording is the last thing between a viewer and a website visit. 'See the live deal' promises the exact listing; 'Check the current listing' is more cautious. We want the one that actually moves people to the deal page.",
  e3_collection_hook_foundtoday_vs_belowmarket: "A carousel can be framed as discovery ('we found these') or value ('these are underpriced'). Which framing drives more of the audience to browse the site decides how we headline every multi-card post.",
  e4_mover_cta_pricehistory_vs_comparelistings: "A Market Mover's job is to send an interested collector somewhere useful. 'Full price history' points at the chart; 'Compare live listings' points at the hub. The winner tells us what a mover audience actually wants next.",
};

// Turn one snapshot candidate into the { hook_text, cta_label } a given
// variant would produce. Returns { ok, hook, cta, reason }.
function renderVariant(variant, { candidate, family }) {
  const facts = factsFromCandidate({ ...candidate, family });
  const destinationKind = destinationKindForFamily(family);
  const hookId = variant.hook_variant ?? defaultHookFor(family, facts);
  const ctaId = variant.cta_variant ?? defaultCtaFor(destinationKind);
  const rh = hookId ? renderHook(hookId, facts) : { ok: false, text: null, reason: "no eligible hook" };
  return {
    ok: rh.ok,
    hook_variant: hookId,
    hook_text: rh.text,
    cta_variant: ctaId,
    cta_label: ctaLabel(ctaId),
    reason: rh.reason,
  };
}

// candidatesByFamily: { deal_drop: [cand...], hook_carousel: [cand...], market_mover: [cand...] }
// Each `cand` is a light shape: { content_id, card_name, card_set, species,
//   card_tcgplayer_id, total_price_usd, market_price, discount_pct,
//   freshness_state, movement, item_count, all_under_threshold,
//   under_price_threshold_usd }.
export function buildReviewPack(candidatesByFamily = {}, { snapshotSource = "fixture", capturedAt = null } = {}) {
  const items = [];
  for (const exp of EXPERIMENTS) {
    const family = exp.applies_to[0];
    const pool = candidatesByFamily[family] ?? [];
    // pick up to 2 candidates that BOTH variants are eligible for
    const usable = [];
    for (const cand of pool) {
      const facts = factsFromCandidate({ ...cand, family });
      const applies = experimentApplies(exp, { family, facts, destinationKind: destinationKindForFamily(family) });
      if (applies.ok) usable.push(cand);
      if (usable.length >= 2) break;
    }

    const examples = usable.map((cand) => {
      const facts = factsFromCandidate({ ...cand, family });
      return {
        content_id: cand.content_id ?? null,
        subject: cand.card_name ?? cand.species ?? (cand.item_count ? `${cand.item_count} cards` : "(subject)"),
        facts_used: {
          listedUsd: facts.listedUsd,
          marketRefUsd: facts.marketRefUsd,
          discountPct: facts.discountPct,
          movementPct: facts.movementPct,
          movementDirection: facts.movementDirection,
          movementWindow: facts.movementWindow,
          freshnessState: facts.freshnessState,
          itemCount: facts.itemCount,
        },
        variant_A: renderVariant(exp.variants.A, { candidate: cand, family }),
        variant_B: renderVariant(exp.variants.B, { candidate: cand, family }),
      };
    });

    items.push({
      experiment_id: exp.experiment_id,
      hypothesis: exp.hypothesis,
      dimension: exp.dimension,
      creative_family: family,
      variant_A: exp.variants.A,
      variant_B: exp.variants.B,
      destination_kind: destinationKindForFamily(family),
      why_this_test_matters: WHY[exp.experiment_id] ?? "",
      eligible_candidates_found: usable.length,
      examples,
      unavailable_reason: usable.length === 0 ? "no fixture candidate has BOTH variants eligible" : null,
    });
  }

  return {
    phase: "13E.10A",
    label: "SIMULATION / REVIEW ONLY — fixture data, NOT live, nothing published",
    generated_at: new Date().toISOString(),
    snapshot_source: snapshotSource,
    snapshot_captured_at: capturedAt,
    published: false,
    scheduled: false,
    items,
  };
}

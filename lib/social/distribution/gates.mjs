// Phase 13E.5A - THE DISTRIBUTION PREFLIGHT GATE STACK.
//
// A social post may only leave this machine when EVERY gate below passes.
// The gates are deliberately independent and overlapping - defeating one
// (a stale env var, a hand-edited ledger row) still leaves the others in
// the way. Nothing here calls a provider or the network; it is a pure
// function of (job row, artifact variant, flags, provider-configured?,
// channel resolved?, ledger).
//
// `send` in scripts/socialPublish.mjs runs runAllGates() and HARD-FAILS
// on any blocker. `dry-run` runs the same stack and just prints it.

import { RIGHTS_STATE } from "../rights.mjs";
import { placementEligibility, mediaCompatibility } from "./artifactMap.mjs";
import { duplicateOf } from "./ledger.mjs";

const DISCLOSURE_MARKER = /\bAd\b/; // the approved EPN disclosure label (caption.mjs DISCLOSURE_LINE starts "Ad · ...")
const MAX_CAPTION_HASHTAGS = 5; // IG allows up to 5 in the caption body (VERIFIED PROVIDER FACT)
const MAX_FIRSTCOMMENT_HASHTAGS = 30;

function gate(id, ok, detail) {
  return { id, ok: Boolean(ok), detail: String(detail ?? "") };
}

// rightsMatch: the artifact's frozen rights_state must be byte-identical
// to the current code-reviewed RIGHTS_STATE - a drifted or absent copy is
// a hard fail (someone changed the source of truth after the artifact was
// built, or the artifact predates the rights system).
function rightsInSync(artifactRights) {
  if (!artifactRights || typeof artifactRights !== "object") return { ok: false, why: "artifact carries no rights_state" };
  for (const k of Object.keys(RIGHTS_STATE)) {
    if (artifactRights[k] !== RIGHTS_STATE[k]) {
      return { ok: false, why: `rights drift on "${k}": artifact=${artifactRights[k]} current=${RIGHTS_STATE[k]}` };
    }
  }
  return { ok: true, why: "rights_state matches lib/social/rights.mjs exactly" };
}

// The full stack. Returns { ok, gates:[{id,ok,detail}], blockers:[...] }.
//
//   row        the ledger row (has platform, creative_variant, caption,
//              hashtags, channel_id, snapshot, qa, ...)
//   variant    the normalised artifact variant (media, caption_*, qa, rights, snapshot)
//   flags      readDistributionFlags() result
//   providerConfigured  boolean - getSocialProvider().isConfigured()
//   ledger     the full ledger array (for duplicate detection)
//   force      owner override for the duplicate gate ONLY
export function runAllGates({ row, variant, flags, providerConfigured, ledger = [], force = false } = {}) {
  const gates = [];

  // G1 - master publish switch: BOTH the code-reviewed rights flag AND
  // the env switch must say go.
  gates.push(
    gate(
      "publish_switch",
      RIGHTS_STATE.publishing === "ALLOWED" && flags?.publishEnabled === true,
      `rights.publishing=${RIGHTS_STATE.publishing}; SOCIAL_PUBLISH_ENABLED=${flags?.publishEnabled ? "true" : "not true"} (both must be go)`
    )
  );

  // G2 - not dry-run. Dry run is the default; a real send needs it
  // explicitly off.
  gates.push(gate("live_mode", flags?.dryRun === false, flags?.dryRun ? "SOCIAL_PUBLISH_DRY_RUN is not \"false\" - dry-run mode" : "live mode"));

  // G3 - EPN compliance prerequisite recorded by the owner.
  gates.push(
    gate(
      "epn_compliance",
      flags?.epnAiToolsApproved === true,
      flags?.epnAiToolsApproved
        ? "EPN_AI_TOOLS_APPROVED=true (owner recorded the prerequisite is satisfied)"
        : "EPN_AI_TOOLS_APPROVED not set - see docs/social-compliance-readiness.md SS1 #2 / SS4"
    )
  );

  // G4 - QA pass on the exact artifact variant.
  const qa = variant?.qa ?? row?.qa ?? null;
  gates.push(
    gate(
      "qa_pass",
      qa && qa.ok === true && (qa.failed?.length ?? 0) === 0,
      qa ? `qa.ok=${qa.ok}, ${qa.passed ?? "?"}/${qa.total ?? "?"} passed, failed=[${(qa.failed ?? []).join(", ")}]` : "no QA result on the artifact"
    )
  );

  // G5 - rights cleared AND in sync with the source of truth.
  const rsync = rightsInSync(variant?.rights ?? row?.rights);
  const rightsClear =
    rsync.ok &&
    RIGHTS_STATE.ppt_social_data === "CLEARED" &&
    RIGHTS_STATE.card_image === "CLEARED";
  gates.push(
    gate(
      "rights_cleared",
      rightsClear,
      rsync.ok
        ? `ppt_social_data=${RIGHTS_STATE.ppt_social_data}, card_image=${RIGHTS_STATE.card_image} (ebay_seller_images=${RIGHTS_STATE.ebay_seller_images} is fine - unused; ebay_genai=${RIGHTS_STATE.ebay_genai} is fine - deterministic)`
        : rsync.why
    )
  );

  // G6 - explicit human approval on THIS row.
  gates.push(gate("owner_approval", row?.status === "APPROVED", `ledger status is "${row?.status}" (need APPROVED)`));

  // G7 - provider auth present.
  gates.push(gate("provider_auth", providerConfigured === true, providerConfigured ? "a social provider is configured" : "no social provider configured (set BUFFER_ACCESS_TOKEN)"));

  // G8 - the row's platform resolves to a real provider channel id.
  gates.push(gate("channel_resolved", Boolean(row?.channel_id), row?.channel_id ? `channel ${row.channel_id}` : `no channel id for ${row?.channel_key ?? "?"} - run "social:publish channels" after owner auth`));

  // G9 - placement eligibility (family/media -> platform) + media envelope.
  const pe = placementEligibility({ family: row?.creative_family, mediaKind: variant?.media?.kind, platform: row?.platform });
  gates.push(gate("placement_eligible", pe.ok, pe.reason));
  const mc = mediaCompatibility({
    platform: row?.platform,
    mediaMeta: {
      kind: variant?.media?.kind,
      width: variant?.media?.width,
      height: variant?.media?.height,
      durationS: variant?.media?.durationS,
      itemCount: variant?.media?.itemCount,
    },
  });
  gates.push(gate("media_compatible", mc.ok, mc.reason));

  // G10 - the media files actually exist on disk.
  gates.push(gate("media_present", variant?.media?.filesExist === true && (variant?.media?.files?.length ?? 0) > 0, `files=${(variant?.media?.files ?? []).length}, exist=${variant?.media?.filesExist}`));

  // G11 - caption FROZEN, non-empty, carries the disclosure, within
  // hashtag limits, and unchanged since prepare.
  const cap = String(row?.caption ?? "");
  const capOk = cap.trim().length > 0;
  const discOk = DISCLOSURE_MARKER.test(cap);
  const liveCap = row?.platform === "tiktok" ? variant?.caption_tiktok : variant?.caption_instagram;
  const captionUnchanged = liveCap != null && String(liveCap) === cap;
  const nTags = Array.isArray(row?.hashtags) ? row.hashtags.length : 0;
  const inlineTagsInCaption = (cap.match(/#[A-Za-z0-9_]+/g) ?? []).length;
  const tagsOk = nTags <= MAX_FIRSTCOMMENT_HASHTAGS && inlineTagsInCaption <= MAX_CAPTION_HASHTAGS;
  gates.push(
    gate(
      "caption_frozen",
      capOk && discOk && captionUnchanged && tagsOk,
      `nonEmpty=${capOk}, disclosure=${discOk}, unchangedVsArtifact=${captionUnchanged}, inlineHashtags=${inlineTagsInCaption}(<=${MAX_CAPTION_HASHTAGS}), hashtagArray=${nTags}(<=${MAX_FIRSTCOMMENT_HASHTAGS})`
    )
  );

  // G12 - deterministic facts present + frozen (no stale/empty snapshot).
  // A still artifact must carry the frozen numbers on the ledger row. A
  // 9:16 VIDEO artifact satisfies this via its own QA gate: runVideoQa()
  // re-derives every on-screen money value / dimension straight from the
  // verified payload (39-40 checks), so a video that is qa.ok has already
  // had its deterministic facts re-verified against source.
  const snap = row?.snapshot ?? {};
  const stillFacts =
    (snap.market_price != null && snap.discount_pct != null) ||
    (snap.movement && snap.movement.pct != null);
  const videoFactsViaQa = variant?.media?.kind === "video_916" && qa?.ok === true;
  const hasFact = stillFacts || videoFactsViaQa || row?.creative_family === "brand_ad";
  gates.push(
    gate(
      "deterministic_facts",
      Boolean(hasFact),
      stillFacts
        ? "frozen market_price/discount or movement present on the row"
        : videoFactsViaQa
          ? "9:16 video — deterministic on-screen numbers re-verified by the video QA gate"
          : row?.creative_family === "brand_ad"
            ? "brand_ad carries no per-card fact by design"
            : "no frozen deterministic fact on the row and no passing video QA"
    )
  );

  // G13 - not a duplicate (unless the owner forces it).
  const dup = duplicateOf(row, ledger);
  gates.push(gate("not_duplicate", !dup || force === true, dup ? (force ? `duplicate of ${dup.job_id} - FORCED by owner` : `already ${dup.status} as ${dup.job_id}`) : "no in-flight/published row for this placement"));

  const blockers = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return { ok: blockers.length === 0, gates, blockers };
}

// The subset of gates that do NOT involve human approval or the live
// switch - "is this artifact structurally fit to become an APPROVED row?"
// Used by prepare() to decide DRAFT -> READY.
export function readinessGates(args) {
  const full = runAllGates(args);
  const IGNORE = new Set(["publish_switch", "live_mode", "owner_approval"]);
  const gates = full.gates.filter((g) => !IGNORE.has(g.id));
  const blockers = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return { ok: blockers.length === 0, gates, blockers };
}

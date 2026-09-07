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
import { placementEligibility, mediaCompatibility, PLATFORM_COPY_FIELD, LIMITS } from "./artifactMap.mjs";
import { duplicateOf } from "./ledger.mjs";

const DISCLOSURE_MARKER = /\bAd\b/; // the approved EPN disclosure label ("Ad · ...", "(Ad)")
const MAX_CAPTION_HASHTAGS = 5; // IG allows up to 5 in the caption body (VERIFIED PROVIDER FACT)
const MAX_FIRSTCOMMENT_HASHTAGS = 30;

// The FROZEN copy the artifact says this platform should carry - so
// caption_frozen can detect drift for X / YouTube too, not just IG/TikTok.
function artifactCopyFor(platform, variant) {
  if (platform === "tiktok") return variant?.caption_tiktok ?? null;
  if (platform === "x_post") return variant?.x?.ok ? variant.x.text : null;
  if (platform === "youtube_short") return variant?.youtube?.ok ? variant.youtube.description : null;
  return variant?.caption_instagram ?? null; // all instagram_*
}

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
//              hashtags, channel_id, snapshot, qa, public_media_url, ...)
//   variant    the normalised artifact variant (media, caption_*, qa, rights, snapshot)
//   flags      readDistributionFlags() result
//   providerConfigured  boolean - getSocialProvider().isConfigured()
//   ledger     the full ledger array (for duplicate detection)
//   force      owner override for the duplicate gate ONLY
//   currentMediaSha  (13E.5C) sha256 of the local media file RIGHT NOW,
//                    re-read by the caller - so asset drift after prepare
//                    is caught before a send. Omit for text-only.
export function runAllGates({ row, variant, flags, providerConfigured, ledger = [], force = false, currentMediaSha = null } = {}) {
  const gates = [];
  const isHttps = (u) => typeof u === "string" && /^https:\/\/\S+$/.test(u);

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
  // Uses the ROW's resolved media (buildRow picks text_only for an X text
  // post, keeps the 9:16 master for Reel/TikTok/YouTube Short).
  const rowMedia = row?.media ?? variant?.media ?? {};
  const pe = placementEligibility({ family: row?.creative_family, mediaKind: rowMedia.kind, platform: row?.platform });
  gates.push(gate("placement_eligible", pe.ok, pe.reason));
  const mc = mediaCompatibility({
    platform: row?.platform,
    text: String(row?.caption ?? ""),
    mediaMeta: {
      kind: rowMedia.kind,
      width: rowMedia.width,
      height: rowMedia.height,
      durationS: rowMedia.durationS,
      itemCount: rowMedia.itemCount,
      files: rowMedia.files,
    },
  });
  gates.push(gate("media_compatible", mc.ok, mc.reason));

  // G10 - the media is present AND PUBLICLY HOSTED. A text-only X post has
  // no file; the caption gate covers it. Every other placement must have
  // the local file on disk AND a frozen public HTTPS URL (13E.5C - Buffer
  // fetches the URL, it does not upload).
  const textOnly = rowMedia.kind === "text_only";
  const localOk = rowMedia.filesExist === true && (rowMedia.files?.length ?? 0) > 0;
  const hostedOk = isHttps(row?.public_media_url);
  gates.push(
    gate(
      "media_present",
      textOnly ? String(row?.caption ?? "").trim().length > 0 : localOk && hostedOk,
      textOnly
        ? "text-only post (no media file expected)"
        : `localFile=${localOk}, publicUrl=${hostedOk ? row.public_media_url : "MISSING - run `social:publish host` first"}`
    )
  );

  // G14 - asset-drift guard (13E.5C). If a public media URL is frozen on
  // the row, the local file's CURRENT sha256 must still match what was
  // hosted + frozen at prepare time. A changed source artifact blocks the
  // send and forces a re-host + re-approve.
  if (!textOnly) {
    const driftOk =
      !row?.public_media_url ||
      (row?.media_sha256 && (currentMediaSha == null || currentMediaSha === row.media_sha256));
    gates.push(
      gate(
        "asset_not_drifted",
        Boolean(driftOk),
        row?.public_media_url
          ? currentMediaSha == null
            ? `frozen sha ${String(row.media_sha256 ?? "?").slice(0, 12)}… (local not re-checked in this call)`
            : currentMediaSha === row.media_sha256
              ? `local sha matches the hosted asset (${currentMediaSha.slice(0, 12)}…)`
              : `DRIFT: local ${currentMediaSha.slice(0, 12)}… != hosted ${String(row.media_sha256 ?? "?").slice(0, 12)}… - re-host + re-approve`
          : "no hosted asset yet (nothing to drift)"
      )
    );
  }

  // G11 - copy FROZEN, non-empty, carries the disclosure, within the
  // platform's hashtag limits, and unchanged vs. what the artifact says
  // this platform should carry (IG/TikTok caption, X post text, or the
  // YouTube description).
  const cap = String(row?.caption ?? "");
  const platform = row?.platform ?? "";
  const capOk = cap.trim().length > 0;
  const discOk = DISCLOSURE_MARKER.test(cap);
  const liveCap = artifactCopyFor(platform, variant);
  const captionUnchanged = liveCap != null && String(liveCap) === cap;
  const nTags = Array.isArray(row?.hashtags) ? row.hashtags.length : 0;
  const inlineTagsInCaption = (cap.match(/#[A-Za-z0-9_]+/g) ?? []).length;
  const inlineCap = platform.startsWith("instagram") ? MAX_CAPTION_HASHTAGS : Infinity; // X/TikTok/YT do not enforce a small inline cap
  const tagsOk = nTags <= MAX_FIRSTCOMMENT_HASHTAGS && inlineTagsInCaption <= inlineCap;
  // X: also enforce the hard char budget (also checked in media_compatible)
  const xLenOk = platform !== "x_post" || cap.length <= LIMITS.X_TEXT_MAX;
  // YouTube: the frozen title must exist and be within 100 chars
  const ytTitleOk = platform !== "youtube_short" || (typeof row?.youtube_title === "string" && row.youtube_title.length > 0 && row.youtube_title.length <= LIMITS.YT_TITLE_MAX);
  gates.push(
    gate(
      "caption_frozen",
      capOk && discOk && captionUnchanged && tagsOk && xLenOk && ytTitleOk,
      `nonEmpty=${capOk}, disclosure=${discOk}, unchangedVsArtifact=${captionUnchanged}, inlineHashtags=${inlineTagsInCaption}, hashtagArray=${nTags}` +
        (platform === "x_post" ? `, xChars=${cap.length}(<=${LIMITS.X_TEXT_MAX})` : "") +
        (platform === "youtube_short" ? `, ytTitle=${row?.youtube_title ? `"${row.youtube_title}"(${row.youtube_title.length})` : "MISSING"}` : "")
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

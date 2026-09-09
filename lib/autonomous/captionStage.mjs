// Phase SOCIAL-AUTOPILOT-1 §9 - CAPTION STAGE.
//
// Thin wrapper around the APPROVED, FROZEN SOCIAL-CREATIVE-5B caption
// director (lib/newsroom/captions/captionDirector.runCaptionDirector) -
// its fact architecture, audits, and disclosure logic are untouched. This
// module's only job is to persist the resulting caption_handoff ONTO the
// story package instead of leaving it a detached stub (the exact blocker
// every prior 4C phase flagged: "caption<->video link is a handoff object
// only, not persisted").

import { runCaptionDirector, buildCaptionHandoff } from "../newsroom/captions/captionDirector.mjs";
import { failure } from "../newsroom/editorial/failureStates.mjs";
import { normalizeSocialCaptionText, verifyCaptionEncoding } from "./captionEncoding.mjs";

export const CAPTION_STAGE_VERSION = "auto4.1";

// SOCIAL-AUTOPILOT-4 §2/§3 - one centralized normalization + verification
// pass, applied to every platform caption this stage returns. See
// captionEncoding.mjs's header for the encoding audit this backs.
function normalizeAndVerify(platformResult) {
  if (!platformResult?.caption_text) return { result: platformResult, encoding: null };
  const normalized = normalizeSocialCaptionText(platformResult.caption_text);
  const encoding = verifyCaptionEncoding(normalized);
  return { result: { ...platformResult, caption_text: normalized }, encoding };
}

export async function resolveCaptions(pkg, { semanticManifest, factTrace = [], cardCatalogRow = null, imageArtifactId = null, env = process.env, budget = null, fetchImpl = fetch } = {}) {
  if (!pkg.snapshot) return { ok: false, ...failure("CAPTION_GENERATION_HOLD", "no locked snapshot - refusing to caption unfrozen facts", { story_id: pkg.story_id }) };

  const result = await runCaptionDirector({
    story: { story_id: pkg.story_id, subject_id: pkg.story_id },
    semanticManifest, factTrace, cardCatalogRow,
    family: layoutFor(pkg.family), platforms: ["instagram", "x"],
    imageArtifactId, env, budget, fetchImpl,
  });

  const instaOk = result.instagram?.status === "READY" || result.instagram?.status == null && result.instagram?.caption_text;
  const xOk = result.x?.status === "READY" || result.x?.status == null && result.x?.caption_text;
  if (!result.ok && !instaOk && !xOk) {
    return { ok: false, ...failure("CAPTION_GENERATION_HOLD", "caption director produced no ready platform caption - never a raw family name / generic fallback", { story_id: pkg.story_id, detail: result.reason }) };
  }

  // §2/§3 - normalize + verify BEFORE this string goes anywhere else
  // (persistence, Buffer payload, the proof pack). A caption that fails
  // encoding verification never becomes a ready caption - it holds.
  const ig = normalizeAndVerify(result.instagram);
  const x = normalizeAndVerify(result.x);
  if (ig.encoding && !ig.encoding.ok) return { ok: false, ...ig.encoding, story_id: pkg.story_id };
  if (x.encoding && !x.encoding.ok) return { ok: false, ...x.encoding, story_id: pkg.story_id };

  const handoff = buildCaptionHandoff({ platformResult: ig.result ?? x.result, storyId: pkg.story_id, imageArtifactId, semanticManifest });
  return {
    ok: true,
    captions: { instagram: ig.result, x: x.result, shared: result.shared },
    caption_handoff: handoff,
    encoding_audit: { instagram: ig.encoding, x: x.encoding },
  };
}

function layoutFor(family) {
  if (family === "deal_drop") return "deal_hero";
  if (family === "three_under_25") return "three_up";
  if (family === "market_snapshot" || family === "price_band_insight") return "market_shape";
  if (family === "asking_vs_sold") return "asking_vs_sold";
  if (family === "printing_compare") return "printing_compare";
  return "market_shape";
}

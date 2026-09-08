// Phase SOCIAL-CREATIVE-5B - caption director barrel.
//
// The caption layer that sits BESIDE an approved FULL_GENERATIVE_SOCIAL
// visual. Fact-locked, platform-native, no raw series names, no hype, no
// fake urgency / scarcity, no investment language, website-first CTA.
// Nothing is published here.

export {
  CAPTION_DIRECTOR_VERSION, buildCaptionBrief, buildCaptionPrompt,
  generateCaptionBundle, assembleCaptionText, disclosureFor,
  semanticHash, buildCaptionHandoff, runCaptionDirector,
} from "./captionDirector.mjs";

export {
  CAPTION_AUDIT_VERSION, RAW_SERIES_LABELS, CAPTION_QUALITY_DIMS,
  extractCaptionClaims, allowedFactsFor, auditCaption, scoreCaption,
  checkRawSeries, checkBannedLanguage, checkSourceTimeframe, checkCta,
  checkFactClaims, checkScope, checkDirection, checkImageConsistency,
} from "./captionAudit.mjs";

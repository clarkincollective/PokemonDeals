// Phase 13E.2.1 - SINGLE SOURCE OF TRUTH for the OpenAI image-generation
// model and request size. No model string appears anywhere else in the
// codebase; scripts/socialAssets.mjs imports these and is the only
// caller.
//
// Model choice, verified against the current official OpenAI image-
// generation documentation
// (https://developers.openai.com/api/docs/guides/image-generation,
// audited 2026-09-06): the state-of-the-art GPT Image model is
// `gpt-image-2` ("our latest"), superseding `gpt-image-1` (the value
// Phase 13E.2 shipped). Portrait sizes the docs list for gpt-image-2 are
// `1024x1536` (standard) and `2160x3840` (4K); we request the standard
// portrait and let the renderer treat it as a 1080x1350 background.
//
// scripts/socialAssets.mjs may override the model via the
// OPENAI_IMAGE_MODEL env var (for a pinned rollback, or an account that
// has only been granted an earlier model). This file itself reads no
// environment and makes no network call.

export const OPENAI_IMAGE_MODEL = "gpt-image-2";

// Kept only so a rollback is a one-word env change with a known-good
// target, and so tests can assert the migration happened.
export const OPENAI_IMAGE_MODEL_PREVIOUS = "gpt-image-1";

// Portrait, ~2:3; the closest the API offers to the 4:5 social frame.
// The deterministic renderer composites over it at 1080x1350.
export const OPENAI_IMAGE_REQUEST_SIZE = "1024x1536";

export const OPENAI_IMAGE_DOCS_URL = "https://developers.openai.com/api/docs/guides/image-generation";
export const OPENAI_IMAGE_DOCS_AUDITED = "2026-09-06";

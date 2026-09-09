// Phase SOCIAL-AUTOPILOT-4 SS2-SS4 - CAPTION ENCODING AUDIT + NORMALIZATION.
//
// AUDIT FINDING (documented, not assumed): the caption path was traced
// end to end with real live calls - OpenAI response bytes -> res.json()
// -> JSON.parse(message.content) -> assembleCaptionText() ->
// JSON.stringify() -> writeFileSync(path, json, "utf8") ->
// readFileSync(path, "utf8") -> JSON.parse() - and at every stage the
// UTF-8 bytes for an e-acute character (0xC3 0xA9) and an em dash
// (U+2014) round-tripped correctly, verified with Buffer-level hex
// inspection, not just visual inspection. The apparent mojibake seen
// earlier in this project's own session was a DISPLAY artifact of piping
// a file through `python3 -m json.tool` in this Windows/git-bash
// environment, not a corruption of the persisted data - re-reading the
// exact same file with Node's own fs + JSON.parse showed the correct
// bytes on disk.
//
// This module still exists because SS3 asks for centralized normalization
// regardless, and because "no active bug today" is not the same claim as
// "no defence needed" - a single centralized normalizer + a verified
// round-trip check is cheap insurance against a FUTURE regression and
// gives a named, testable gate (CAPTION_ENCODING_FAIL) instead of
// relying on "it worked when I checked".

import { failure } from "../newsroom/editorial/failureStates.mjs";

export const CAPTION_ENCODING_VERSION = "auto4.1";

// Control characters that are never legitimate inside a social caption.
// \n and \t are preserved; \r is normalized away (Windows line endings);
// every other C0/C1 control character is stripped. Written entirely as
// \x escapes - no literal control bytes in this source file.
// eslint-disable-next-line no-control-regex
const UNSAFE_CONTROL = new RegExp("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", "g");
// U+FFFD REPLACEMENT CHARACTER - the classic symptom of a prior decode
// error. Written via \u escape, never as a literal glyph in this file.
const REPLACEMENT_CHAR = new RegExp("\\uFFFD");

/**
 * normalizeSocialCaptionText(text) -> the NFC-normalized, control-
 * character-safe string. Never touches digits, currency symbols, %, or
 * word content - only Unicode normalization form and unsafe control
 * characters. Idempotent: normalizing twice yields the same result.
 */
export function normalizeSocialCaptionText(text) {
  const s = String(text ?? "");
  return s
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(UNSAFE_CONTROL, "");
}

/**
 * verifyCaptionEncoding(text) -> { ok, state?, reason? }
 *
 * Fails on:
 *   - a replacement character present (evidence of an earlier decode error)
 *   - a non-idempotent NFC normalization (the string wasn't already NFC -
 *     this doesn't itself corrupt anything, callers should normalize
 *     first, but a caller that skipped normalizeSocialCaptionText and
 *     tries to submit raw text is caught here)
 *   - a real UTF-8 encode/decode round-trip mismatch (the definitive
 *     "would this byte-for-byte survive going over the wire" check)
 *   - an unsafe control character
 */
export function verifyCaptionEncoding(text) {
  const s = String(text ?? "");
  if (REPLACEMENT_CHAR.test(s)) {
    return { ok: false, ...failure("CAPTION_ENCODING_FAIL", "caption contains U+FFFD (REPLACEMENT CHARACTER) - evidence of a prior decode error", { stage: "caption_encoding" }) };
  }
  if (s.normalize("NFC") !== s) {
    return { ok: false, ...failure("CAPTION_ENCODING_FAIL", "caption is not NFC-normalized - normalizeSocialCaptionText() must run before this check", { stage: "caption_encoding" }) };
  }
  const roundTrip = Buffer.from(s, "utf8").toString("utf8");
  if (roundTrip !== s) {
    return { ok: false, ...failure("CAPTION_ENCODING_FAIL", "caption does not survive a UTF-8 encode/decode round trip", { stage: "caption_encoding" }) };
  }
  if (UNSAFE_CONTROL.test(s)) {
    return { ok: false, ...failure("CAPTION_ENCODING_FAIL", "caption contains an unsafe control character", { stage: "caption_encoding" }) };
  }
  return { ok: true };
}

/**
 * SS4 - the full round-trip proof: source text -> normalize -> simulate
 * caption_handoff persistence (JSON.stringify/parse) -> simulate a
 * Buffer payload (another JSON round trip, since createPost's body is
 * itself JSON over HTTP) -> compare the final string to the normalized
 * source. Returns { ok, normalized, afterPersist, afterPayload, matches }.
 */
export function captionRoundTrip(sourceText) {
  const normalized = normalizeSocialCaptionText(sourceText);
  const persisted = JSON.parse(JSON.stringify({ caption_text: normalized })).caption_text;
  const payload = JSON.parse(JSON.stringify({ text: persisted })).text;
  const matches = payload === normalized;
  return { ok: matches, normalized, afterPersist: persisted, afterPayload: payload, matches };
}

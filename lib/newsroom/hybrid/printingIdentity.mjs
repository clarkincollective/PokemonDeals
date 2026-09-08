// Phase SOCIAL-CREATIVE-5A - PRINTING IDENTITY PROOF (§10) + PRINTING IMAGE
// VERIFICATION (§11).
//
// A PRINTING_COMPARE story may not generate until it can PROVE two
// genuinely distinct, related printings: two different canonical records,
// a resolvable printing axis, and materially different card images.
// After generation, each depicted card must match its own canonical input
// (not a duplicate of the other).

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { failure } from "../editorial/failureStates.mjs";
import { printingComparisonRelevance } from "../editorial/printingRelevance.mjs";
import { recordCall } from "./budget.mjs";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.SOCIAL_VISUAL_REVIEW_MODEL || "gpt-4o";
const localOf = (p) => (p ? String(p).replace(/^file:\/\//, "") : null);
const fileSha = (p) => { const f = localOf(p); return f && existsSync(f) ? createHash("sha256").update(readFileSync(f)).digest("hex") : null; };

/**
 * provePrintingPair({ high, low, cardImagePaths }) - DETERMINISTIC pre-gen
 * gate. high/low = resolver rows { tcgplayerId, name, set, number, price_usd, ... }.
 * cardImagePaths = [pathA, pathB] canonical local PNGs.
 * -> { ok:true, proof:{ a, b, axis, evidence } } | { ok:false, ...failure("PRINTING_IDENTITY_FAIL") }
 */
export function provePrintingPair({ high = {}, low = {}, cardImagePaths = [] } = {}) {
  const a = {
    tcgplayer_id: high.tcgplayerId ?? high.tcgplayer_id ?? null,
    name: high.name ?? null, set: high.set ?? null, number: high.number ?? high.card_number ?? null,
    variant: high.variant ?? null, market_value: high.price_usd ?? null,
    image_sha256: fileSha(cardImagePaths[0]) ?? null,
  };
  const b = {
    tcgplayer_id: low.tcgplayerId ?? low.tcgplayer_id ?? null,
    name: low.name ?? null, set: low.set ?? null, number: low.number ?? low.card_number ?? null,
    variant: low.variant ?? null, market_value: low.price_usd ?? null,
    image_sha256: fileSha(cardImagePaths[1]) ?? null,
  };

  const fail = (why) => ({ ok: false, ...failure("PRINTING_IDENTITY_FAIL", why, { stage: "printing_identity", detail: { a, b } }), proof: { a, b } });

  if (!a.tcgplayer_id || !b.tcgplayer_id) return fail("one or both printings have no canonical tcgplayer id");
  if (String(a.tcgplayer_id) === String(b.tcgplayer_id)) return fail(`both sides are the SAME canonical record (${a.tcgplayer_id})`);
  if (a.image_sha256 && b.image_sha256 && a.image_sha256 === b.image_sha256) return fail("both sides use the SAME canonical card image (identical hash) - not two printings");
  if (!a.image_sha256 || !b.image_sha256) return fail("a canonical card image is missing for one or both printings");

  const rel = printingComparisonRelevance(
    { name: a.name, set: a.set, card_number: a.number, rarity: high.rarity, market_price: a.market_value },
    { name: b.name, set: b.set, card_number: b.number, rarity: low.rarity, market_price: b.market_value }
  );
  if (rel.verdict !== "MEANINGFUL") return fail(`no resolvable printing axis (PRINTING_COMPARISON_RELEVANCE_CHECK = ${rel.verdict}: ${rel.reason})`);

  // labels must not conflict with the ids: if the sets are the SAME string
  // but the axis claims an edition/printing difference, that is suspicious
  if (a.set && b.set && a.set === b.set && !/reverse|holo|stamp|1st|first|shadowless/i.test(String(rel.axis))) {
    return fail(`both printings are labelled set "${a.set}" with axis "${rel.axis}" - the visual distinction cannot be proven from the records`);
  }

  return {
    ok: true,
    proof: { a, b, axis: rel.axis, evidence: rel.lesson ?? rel.reason, relevance: rel.verdict },
  };
}

/**
 * §11 - after generation, verify the post shows BOTH distinct cards (not a
 * duplicate). cardImageB64s = [b64A, b64B].
 * -> { ok } | { ok:false, ...failure("CARD_PAIR_FIDELITY_FAIL") }
 */
export async function verifyCardPair({ b64, cardImageB64s = [], identityA = {}, identityB = {}, env = process.env, fetchImpl = fetch, budget = null } = {}) {
  const key = env.SOCIAL_VISUAL_REVIEW_API_KEY || env.OPENAI_API_KEY;
  if (!key) return { ok: false, ...failure("CARD_PAIR_FIDELITY_FAIL", "no key to run the §11 card-pair verification") };
  if (cardImageB64s.length < 2) return { ok: false, ...failure("CARD_PAIR_FIDELITY_FAIL", "need both canonical card images to verify the pair") };
  const t0 = Date.now();
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0, max_tokens: 300, response_format: { type: "json_object" },
        messages: [{ role: "user", content: [
          { type: "text", text:
            `Image 1 is a finished social post comparing TWO cards. Image 2 is the real card that should be on the LEFT (${identityA.name ?? "A"}${identityA.set ? `, ${identityA.set}` : ""}). Image 3 is the real card that should be on the RIGHT (${identityB.name ?? "B"}${identityB.set ? `, ${identityB.set}` : ""}).\n` +
            `Answer: {"left_matches_image2":<bool>,"right_matches_image3":<bool>,"both_sides_are_the_same_card":<bool>,"notes":["short"]}\n` +
            `Respond with ONLY that one JSON object.` },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } },
          { type: "image_url", image_url: { url: `data:image/png;base64,${cardImageB64s[0]}`, detail: "low" } },
          { type: "image_url", image_url: { url: `data:image/png;base64,${cardImageB64s[1]}`, detail: "low" } },
        ] }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (budget) recordCall(budget, "visual_review_call", { ok: res.ok, latencyMs: Date.now() - t0, detail: "card_pair" });
    if (!res.ok) return { ok: false, ...failure("CARD_PAIR_FIDELITY_FAIL", `card-pair verification unavailable (${res.status})`) };
    const body = await res.json();
    const m = (body?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    const p = m ? JSON.parse(m[0]) : {};
    if (p.both_sides_are_the_same_card === true) return { ok: false, ...failure("CARD_PAIR_FIDELITY_FAIL", "the post shows the same card on both sides"), detail: p };
    if (p.left_matches_image2 === false || p.right_matches_image3 === false) return { ok: false, ...failure("CARD_PAIR_FIDELITY_FAIL", `a compared card does not match its canonical input: ${JSON.stringify(p)}`), detail: p };
    return { ok: true, detail: p };
  } catch (e) {
    if (budget) recordCall(budget, "visual_review_call", { ok: false, latencyMs: Date.now() - t0, detail: "card_pair_error" });
    return { ok: false, ...failure("CARD_PAIR_FIDELITY_FAIL", `card-pair verification error: ${String(e?.message ?? e).slice(0, 90)}`) };
  }
}

export { fileSha as _fileSha };
export const PRINTING_IDENTITY_VERSION = "5a.1";

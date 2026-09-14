// OUTREACH-AUTO-1 - validate a generated reply BEFORE it can be sent. PURE.
// Any failure means the reply is NOT sent and the thread escalates.

import { ALLOWED_URL_PREFIXES, VERIFIED_FACTS, VERIFIED_LINKS } from "./kb.mjs";

const FORBIDDEN = [
  [/\b(pay|paid|payment|fee|invoice|sponsor|compensat|price for|rates?)\b/i, "mentions payment"],
  [/\b(reciprocal|link exchange|exchange links|link back|in return|swap)\b/i, "reciprocal link language"],
  [/\b(anchor text|dofollow|do-follow|nofollow)\b/i, "link attribute demand"],
  [/\b(guarantee|promise|contract|agreement|sign)\b/i, "commitment language"],
  [/Pokémon/, "accented Pokemon"],
  [/\bi(?:'ve| have) been using\b|\bi(?:'m| am) a (user|fan|customer) of\b/i, "misleading third-party framing"],
];

export function validateReply(reply, { incomingText = "" } = {}) {
  const problems = [];
  const text = String(reply ?? "").trim();
  if (text.length < 20) problems.push("empty or too short");
  if (text.length > 1600) problems.push("too long for a routine reply");
  for (const [rx, why] of FORBIDDEN) if (rx.test(text)) problems.push(why);
  const allowed = new Set(Object.values(VERIFIED_LINKS));
  for (const u of text.match(/https?:\/\/[^\s)>\]]+/gi) ?? []) {
    const clean = u.replace(/[.,;:!?]+$/, "");
    if (!ALLOWED_URL_PREFIXES.some((p) => clean.startsWith(p)) || !allowed.has(clean)) problems.push(`unverified link ${clean}`);
  }
  // bare domains that are not ours
  for (const d of text.match(/\b[a-z0-9-]+\.(com|net|org|io|co|au|uk)\b/gi) ?? []) {
    if (!/pokemondealfinder\.com/i.test(d) && !incomingText.toLowerCase().includes(d.toLowerCase())) problems.push(`unverified domain ${d}`);
  }
  // every figure must come from the verified facts or the correspondent
  const known = `${VERIFIED_FACTS.join(" ")} ${incomingText}`;
  for (const n of text.match(/\d[\d,.]*%?/g) ?? []) {
    const bare = n.replace(/[.,]+$/, "");
    if (bare.length && !known.includes(bare)) problems.push(`unverified figure ${bare}`);
  }
  return { ok: problems.length === 0, problems };
}

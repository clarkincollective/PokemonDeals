// Phase SOCIAL-DISCOVERY-1 SS6/SS29 - EMOJI PLANS + OVERUSE AUDIT.

export const BRAND_EMOJI = Object.freeze(["\u{1F440}", "\u{1F50E}", "\u{1F4CA}", "\u{1F4C8}", "\u{1F4B0}", "\u{1F4B8}", "\u{1F3AF}"]); // 👀 🔎 📊 📈 💰 💸 🎯
const SPAM_EMOJI_PATTERN = /(\u{1F6A8}|\u{1F525}\u{1F525}|\u{1F4AF})/u; // 🚨 / 🔥🔥 / 💯 chains

export const PLATFORM_EMOJI_LIMITS = Object.freeze({
  instagram: { min: 0, max: 4, preferred: [2, 4] },
  x: { min: 0, max: 2, preferred: [0, 2] },
  tiktok: { min: 0, max: 3, preferred: [1, 3] },
  youtube_shorts: { min: 0, max: 2, preferred: [0, 2] },
});

// hook emoji + one data/insight emoji + CTA/search emoji, in that role
// order - "suggested usage" from the phase spec, expressed as a fixed
// 3-slot plan platforms can take 0-N slots from (never invents new emoji).
export function emojiPlanFor(platform) {
  const limits = PLATFORM_EMOJI_LIMITS[platform] ?? PLATFORM_EMOJI_LIMITS.instagram;
  const roles = [
    { role: "hook", emoji: "\u{1F440}" }, // 👀
    { role: "insight", emoji: "\u{1F4CA}" }, // 📊
    { role: "cta", emoji: "\u{1F50E}" }, // 🔎
  ];
  return { platform, limits, roles: roles.slice(0, limits.max) };
}

function countEmoji(text) {
  const matches = String(text ?? "").match(/\p{Extended_Pictographic}/gu);
  return matches ? matches.length : 0;
}

/**
 * auditEmojiUsage(text, platform) -> { ok, count, findings }
 * INSTAGRAM_EMOJI_OVERUSE_FAIL when count exceeds that platform's max, a
 * repeated-emoji chain is found, or an emoji sits inside a number/URL/
 * card name pattern (the phase's own explicit "never" list).
 */
export function auditEmojiUsage(text, platform) {
  const s = String(text ?? "");
  const limits = PLATFORM_EMOJI_LIMITS[platform] ?? PLATFORM_EMOJI_LIMITS.instagram;
  const count = countEmoji(s);
  const findings = [];
  if (count > limits.max) findings.push({ code: "INSTAGRAM_EMOJI_OVERUSE_FAIL", detail: `${count} emoji used, exceeding the ${platform} max of ${limits.max}` });
  if (SPAM_EMOJI_PATTERN.test(s)) findings.push({ code: "INSTAGRAM_EMOJI_OVERUSE_FAIL", detail: "spam-style emoji chain (🚨/🔥🔥/💯) detected" });
  // emoji breaking a URL or sitting inside digits (e.g. "8👀5.7%")
  if (/\d\p{Extended_Pictographic}|\p{Extended_Pictographic}\d/u.test(s)) findings.push({ code: "INSTAGRAM_EMOJI_OVERUSE_FAIL", detail: "an emoji is inserted inside a numeric value" });
  if (/https?:\/\/\S*\p{Extended_Pictographic}/u.test(s)) findings.push({ code: "INSTAGRAM_EMOJI_OVERUSE_FAIL", detail: "an emoji is inserted inside a URL" });
  // repeated identical emoji back-to-back (e.g. "👀👀👀")
  const repeat = s.match(/(\p{Extended_Pictographic})\1{1,}/u);
  if (repeat) findings.push({ code: "INSTAGRAM_EMOJI_OVERUSE_FAIL", detail: `repeated emoji sequence "${repeat[0]}"` });
  return { ok: findings.length === 0, count, findings };
}

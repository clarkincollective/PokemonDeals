// Phase SOCIAL-DISCOVERY-1 SS23 - SPAM / IRRELEVANCE AUDIT.
//
// Composes EXISTING checks (entity lock, banned language, hashtag spam,
// emoji overuse) into one discovery-metadata gate rather than building a
// parallel audit system.

import { auditKeywordEntityAlignment } from "./keywordEngine.mjs";
import { scoreHashtagCombo, SPAM_HASHTAGS } from "./hashtagPools.mjs";
import { checkBannedLanguage } from "../captions/captionAudit.mjs";
import { auditEmojiUsage } from "./emojiPlans.mjs";

/**
 * auditDiscoveryMetadata(pkg, platformOutputs) -> { ok, findings }
 * platformOutputs: { instagram, x, tiktok, youtube_shorts } - each with
 * whatever subset of {caption, title, description, hashtags, keywords}
 * that platform produced.
 */
export function auditDiscoveryMetadata(pkg, platformOutputs = {}) {
  const findings = [];
  const allKeywords = [];
  const allHashtagsFlat = [];
  const seenTags = new Map();

  for (const [platform, out] of Object.entries(platformOutputs)) {
    if (!out) continue;
    const text = [out.caption, out.title, out.description].filter(Boolean).join(" ");
    const keywords = [...(out.keywords ?? out.caption_keywords ?? []), ...(out.video_tags ?? []), ...(out.topic_keywords ?? [])];
    const hashtags = out.hashtags ?? [];
    allKeywords.push(...keywords);
    allHashtagsFlat.push(...hashtags);

    // entity mismatch (Charizard on a Clefairy story, invented set/printing, ...)
    findings.push(...auditKeywordEntityAlignment([text, ...keywords, ...hashtags], pkg).map((f) => ({ ...f, platform })));

    // hashtag spam / generic growth-bait
    for (const raw of hashtags) {
      const t = String(raw).replace(/^#/, "").toLowerCase();
      if (SPAM_HASHTAGS.includes(t)) findings.push({ code: "HASHTAG_SPAM_FAIL", detail: `#${t} is a generic growth-bait tag`, platform });
    }

    // duplicate tags within one platform's own set
    const dupCheck = new Set();
    for (const raw of hashtags) {
      const t = String(raw).replace(/^#/, "").toLowerCase();
      if (dupCheck.has(t)) findings.push({ code: "DUPLICATE_HASHTAG_FAIL", detail: `#${t} appears more than once`, platform });
      dupCheck.add(t);
    }

    // too-many-tags (hard cap already enforced by selectHashtags, but a
    // manually-assembled platformOutputs object is audited too, not trusted)
    const capMax = { instagram: 5, x: 2, tiktok: 5, youtube_shorts: 4 }[platform] ?? 5;
    if (hashtags.length > capMax) findings.push({ code: "TOO_MANY_HASHTAGS_FAIL", detail: `${hashtags.length} hashtags exceeds the ${platform} cap of ${capMax}`, platform });

    // investment / urgency / scarcity language (reuse, not reinvent)
    if (text) findings.push(...checkBannedLanguage(text).map((f) => ({ ...f, platform })));

    // emoji overuse
    if (text) findings.push(...auditEmojiUsage(text, platform).findings.map((f) => ({ ...f, platform })));

    for (const raw of hashtags) { const t = String(raw).replace(/^#/, "").toLowerCase(); seenTags.set(t, (seenTags.get(t) ?? 0) + 1); }
  }

  return { ok: findings.length === 0, findings, keyword_count: allKeywords.length, hashtag_count: allHashtagsFlat.length };
}

// Phase 13E.5A - ARTIFACT INGEST (read-only).
//
// The distribution layer does NOT render. It consumes the artifacts the
// EXISTING pipelines already produce under .social-preview/ :
//   * daily static  ->  .social-preview/daily/<slug>/{payload.json,
//                        caption-instagram.txt, caption-tiktok.txt,
//                        hashtags.txt, creative-*.png}
//   * 13E.4 video   ->  .social-preview/13e4/manifest.json + *.mp4
//
// Every function here is a pure file read + shape-normalise. It NEVER
// writes, renders, calls a provider, or touches the network. A missing or
// malformed artifact is returned as { ok:false, reason } - the caller
// fails closed.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { buildCreativeIdentifiers, contentGoalFor } from "../creativeSpec.mjs";
import { familyForContentType } from "./artifactMap.mjs";
import { RIGHTS_STATE } from "../rights.mjs";

const CWD = process.cwd();
const ROOT = join(CWD, ".social-preview");
const DAILY_DIR = join(ROOT, "daily");
const VIDEO_MANIFEST = join(ROOT, "13e4", "manifest.json");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
// Manifest asset paths are stored RELATIVE TO THE REPO ROOT (e.g.
// ".social-preview\\13e4\\deal_drop_reel.mp4"); normalise slashes and
// resolve against cwd.
const resolveRepoRel = (p) => (isAbsolute(p) ? p : join(CWD, String(p).replace(/\\/g, "/")));

// content_type -> daily folder slug used by scripts/socialDaily.mjs
const DAILY_SLUG = Object.freeze({
  deal_of_day: "deal-of-day",
  just_found: "just-found",
  market_mover: "market-mover",
  market_snapshot: "market-snapshot",
  pokemon_spotlight: "pokemon-spotlight",
  set_spotlight: "set-spotlight",
});

// A normalised content artifact:
//   { ok, source, content_type, creative_family, content_id, content_goal,
//     variants: [ { creative_variant, media, caption_instagram,
//                   caption_tiktok, hashtags, cta_url, first_comment,
//                   qa, rights, snapshot } ],
//     stale?, reason? }

function frozenSnapshotFromPayload(p) {
  const dd = Array.isArray(p.deal_data) ? p.deal_data[0] : p.deal_data;
  return {
    checkedAt: p.freshness?.checkedAt ?? null,
    market_price: dd?.market_price ?? p.market_data?.reference_usd ?? null,
    discount_pct: dd?.discount_pct ?? null,
    movement: p.movement ? { pct: p.movement.pct, direction: p.movement.direction, windowLabel: p.movement.windowLabel } : null,
    destination_route: p.destination?.route ?? null,
  };
}

// --- daily static artifact ------------------------------------------
export function readDailyArtifact(contentType) {
  const slug = DAILY_SLUG[contentType];
  if (!slug) return { ok: false, reason: `no daily slug for content_type "${contentType}"` };
  const dir = join(DAILY_DIR, slug);
  const payloadPath = join(dir, "payload.json");
  if (!existsSync(payloadPath)) {
    return { ok: false, reason: `no daily artifact at ${payloadPath} - run "npm run social:daily"` };
  }
  let payload;
  try {
    payload = readJson(payloadPath);
  } catch (e) {
    return { ok: false, reason: `daily payload.json unreadable: ${e.message}` };
  }
  const family = familyForContentType(payload.content_type);
  if (!family) return { ok: false, reason: `no creative family for content_type "${payload.content_type}"` };

  // 13E.3D creative identifiers: use the payload's own frozen block if
  // present; otherwise derive deterministically from the SAME pure
  // function the renderer uses (not fabrication) and flag the artifact
  // stale so a gate can insist on a fresh render.
  let ident = payload.creative;
  let stale = false;
  if (!ident || !ident.content_id) {
    stale = true;
    ident = buildCreativeIdentifiers({
      family,
      contentType: payload.content_type,
      subject: payload.subject?.display_name,
      generatedAt: payload.generated_at,
      variant: "A",
    });
  }

  const capIg = existsSync(join(dir, "caption-instagram.txt")) ? readFileSync(join(dir, "caption-instagram.txt"), "utf8") : null;
  const capTt = existsSync(join(dir, "caption-tiktok.txt")) ? readFileSync(join(dir, "caption-tiktok.txt"), "utf8") : null;
  const hashtags = existsSync(join(dir, "hashtags.txt"))
    ? readFileSync(join(dir, "hashtags.txt"), "utf8").trim().split(/\s+/).filter(Boolean)
    : [];

  const isCarousel = family === "hook_carousel";
  const stillFiles = isCarousel
    ? [join(dir, "creative-A.png")] // the daily static run renders one 4:5 still per family; a true multi-slide carousel export is a render-side follow-up (documented)
    : [join(dir, "creative-A.png")];
  const cardFiles = ["creative-card-A.png"].map((f) => join(dir, f)).filter(existsSync);
  const chosen = cardFiles.length ? cardFiles : stillFiles;
  const filesExist = chosen.every(existsSync);

  const media = {
    kind: isCarousel ? "carousel_45" : "image_45",
    files: chosen.map((f) => f.replace(/\\/g, "/")),
    width: 1080,
    height: 1350,
    itemCount: isCarousel ? Math.max(2, chosen.length) : undefined,
    filesExist,
  };

  return {
    ok: true,
    source: `daily:${slug}`,
    content_type: payload.content_type,
    creative_family: family,
    content_id: ident.content_id,
    content_goal: contentGoalFor(payload.content_type),
    stale,
    variants: [
      {
        creative_variant: "A",
        media,
        caption_instagram: capIg,
        caption_tiktok: capTt,
        hashtags,
        cta_url: payload.cta?.url ? `https://${String(payload.cta.url).replace(/^https?:\/\//, "")}` : `https://pokemondealfinder.com${payload.destination?.route ?? "/deals"}`,
        first_comment: null,
        qa: { ok: !stale, passed: stale ? 0 : 1, total: 1, failed: stale ? ["source_artifact_stale"] : [] },
        rights: payload.rights_state ?? null,
        snapshot: frozenSnapshotFromPayload(payload),
      },
    ],
  };
}

// --- 13E.4 video artifact -----------------------------------------
// Returns one artifact per family, with a variant per platform cut
// ("reel" -> creative_variant "9x16-reel", "tiktok" -> "9x16-tiktok").
export function readVideoArtifacts() {
  if (!existsSync(VIDEO_MANIFEST)) {
    return { ok: false, reason: `no video manifest at ${VIDEO_MANIFEST} - run "npm run social:video"` };
  }
  let m;
  try {
    m = readJson(VIDEO_MANIFEST);
  } catch (e) {
    return { ok: false, reason: `video manifest unreadable: ${e.message}` };
  }
  const out = [];
  for (const fam of m.families ?? []) {
    const variants = [];
    for (const [cut, v] of Object.entries(fam.platforms ?? {})) {
      const mp4Abs = resolveRepoRel(v.mp4 ?? "");
      const exists = mp4Abs && existsSync(mp4Abs);
      const probe = v.probe ?? {};
      variants.push({
        creative_variant: `9x16-${cut}`,
        platform_cut: cut, // "reel" | "tiktok"
        media: {
          kind: "video_916",
          files: [mp4Abs.replace(/\\/g, "/")],
          width: probe.width ?? 1080,
          height: probe.height ?? 1920,
          durationS: probe.duration_s ?? v.duration_s ?? null,
          filesExist: Boolean(exists),
          hasAudio: probe.has_audio ?? null,
          sizeBytes: exists ? statSync(mp4Abs).size : (probe.size_bytes ?? null),
        },
        caption_instagram: v.captions?.instagram ?? null,
        caption_tiktok: v.captions?.tiktok ?? null,
        hashtags: v.captions?.hashtags ?? [],
        cta_url: v.cta_url ? `https://${String(v.cta_url).replace(/^https?:\/\//, "")}` : null,
        first_comment: null,
        qa: v.qa ?? { ok: false, passed: 0, total: 0, failed: ["no_qa_block"] },
        rights: RIGHTS_STATE, // the video pipeline shares the same frozen rights state
        snapshot: { checkedAt: null, content_id: v.content_id ?? null, hook: v.hook ?? null },
        content_id: v.content_id ?? null,
      });
    }
    out.push({
      ok: true,
      source: "video:13e4",
      content_type: null,
      creative_family: fam.family,
      content_id: variants[0]?.content_id ?? null,
      content_goal: (fam.platforms?.reel ?? fam.platforms?.tiktok)?.content_goal ?? null,
      stale: false,
      published_flag: Boolean(m.published),
      variants,
    });
  }
  return { ok: true, artifacts: out, published_flag: Boolean(m.published) };
}

// Find one artifact + one variant by a loose id: exact content_id, or
// "<source>/<family>" e.g. "video:13e4/deal_drop", or a daily content_type.
export function resolveArtifactVariant(idOrKey, { platformCut = null } = {}) {
  // daily first
  for (const ct of Object.keys(DAILY_SLUG)) {
    if (idOrKey === ct || idOrKey === DAILY_SLUG[ct]) {
      const a = readDailyArtifact(ct);
      if (a.ok) return { ok: true, artifact: a, variant: a.variants[0] };
      return a;
    }
  }
  const vids = readVideoArtifacts();
  if (vids.ok) {
    for (const a of vids.artifacts) {
      const famKey = `${a.source}/${a.creative_family}`;
      for (const v of a.variants) {
        if (
          idOrKey === v.content_id ||
          idOrKey === a.content_id ||
          idOrKey === famKey ||
          idOrKey === a.creative_family
        ) {
          if (platformCut && v.platform_cut !== platformCut) continue;
          return { ok: true, artifact: a, variant: v };
        }
      }
    }
  }
  // daily by content_id (derived or frozen)
  for (const ct of Object.keys(DAILY_SLUG)) {
    const a = readDailyArtifact(ct);
    if (a.ok && a.content_id === idOrKey) return { ok: true, artifact: a, variant: a.variants[0] };
  }
  return { ok: false, reason: `no artifact/variant matched "${idOrKey}"${platformCut ? ` (cut ${platformCut})` : ""}` };
}

export function listAllArtifacts() {
  const rows = [];
  for (const ct of Object.keys(DAILY_SLUG)) {
    const a = readDailyArtifact(ct);
    if (a.ok) rows.push(a);
  }
  const vids = readVideoArtifacts();
  if (vids.ok) rows.push(...vids.artifacts);
  return rows;
}

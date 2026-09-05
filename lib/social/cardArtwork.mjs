// Phase 13E.2.1 - LAYER 2: real, cleared, canonical card artwork.
//
// The social creative shows the ACTUAL matched printing's artwork - the
// same TCGplayer product image the website already renders for that
// exact card_catalog row. This module:
//   - derives the canonical image URL from the deal's EXACT-printing
//     tcgplayer id (deal.card_tcgplayer_id, set by the P0.3-strict
//     scanner match - never a species-level guess)
//   - validates the printing linkage and FAILS CLOSED on anything
//     doubtful (no id, wrong host, catalogue identity mismatch, missing
//     image, rights not CLEARED) so Version C is simply not produced and
//     Mode B (Version A/B) stands
//   - downloads each needed image ONCE into a local cache keyed by
//     tcgplayer id (.social-preview/card-art-cache/<id>.jpg), reused on
//     every later social:daily run - never a catalogue-wide download
//
// It NEVER touches an eBay seller photo (deal.image_url) and NEVER sends
// anything to OpenAI. The one network call it can make is a GET to the
// TCGplayer product CDN and nowhere else (host-locked).

import https from "node:https";
import { existsSync, mkdirSync, statSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { catalogImageUrl, upgradeCatalogImage } from "../cardImage.js";

export const CANONICAL_IMAGE_HOST = "tcgplayer-cdn.tcgplayer.com";
export const CARD_ART_PROVIDER = "TCGplayer product CDN (canonical catalogue artwork)";
export const CARD_ART_CACHE_DIR = path.join(".social-preview", "card-art-cache");

// A seller photo can NEVER stand in for canonical artwork (SS3, SS14,
// test 5). Any of these hosts -> reject outright.
export const NON_CANONICAL_IMAGE_HOSTS = Object.freeze([
  "i.ebayimg.com",
  "ebayimg.com",
  "thumbs.ebaystatic.com",
  "i.ebaystatic.com",
  "ebay.com",
  "www.ebay.com",
]);

function hostOf(url) {
  try {
    return new URL(String(url)).host.toLowerCase();
  } catch {
    return null;
  }
}

export function isSellerImageUrl(url) {
  const h = hostOf(url);
  return !!h && NON_CANONICAL_IMAGE_HOSTS.some((bad) => h === bad || h.endsWith(`.${bad}`));
}

export function isCanonicalImageUrl(url) {
  return hostOf(url) === CANONICAL_IMAGE_HOST;
}

// lower-case, drop parentheticals + punctuation, collapse whitespace -
// for reconciling a deal's stored name/set against the catalogue row.
function idToken(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// The canonical URL for a deal's EXACT printing, or null. Only ever built
// from the structured tcgplayer id - never from deal.image_url (that is
// the eBay seller photo).
export function canonicalArtworkUrl(deal) {
  const raw = deal?.card_tcgplayer_id;
  if (raw == null || String(raw).trim() === "") return null;
  // guard against a stray URL/host ever sitting in the id column
  if (/^https?:/i.test(String(raw))) {
    return isCanonicalImageUrl(raw) ? upgradeCatalogImage(String(raw)) : null;
  }
  if (!/^\d+$/.test(String(raw).trim())) return null;
  const url = catalogImageUrl(String(raw).trim());
  return isCanonicalImageUrl(url) ? url : null;
}

// Validate that the artwork we are about to use really is THIS card's
// exact printing. `catalogRow` (optional but strongly recommended) is the
// card_catalog row for deal.card_tcgplayer_id: { tcgplayer_id, name,
// set, card_number, image_url }. Returns { ok, reason }.
export function printingMatch(deal, catalogRow) {
  const id = deal?.card_tcgplayer_id != null ? String(deal.card_tcgplayer_id).trim() : "";
  if (!id) return { ok: false, reason: "deal has no exact-printing tcgplayer id (no strict catalogue match) - fail closed" };

  const url = canonicalArtworkUrl(deal);
  if (!url) return { ok: false, reason: `no canonical image URL resolvable for tcgplayer id ${id}` };
  if (isSellerImageUrl(url)) return { ok: false, reason: "resolved image is an eBay seller photo - never canonical" };
  if (!isCanonicalImageUrl(url)) return { ok: false, reason: `resolved image host is not ${CANONICAL_IMAGE_HOST}` };
  // the id embedded in the URL must be the same exact-printing id
  const urlId = (url.match(/\/product\/(\d+)/) || [])[1];
  if (urlId !== id) return { ok: false, reason: `URL product id ${urlId} != deal tcgplayer id ${id}` };

  if (catalogRow) {
    if (String(catalogRow.tcgplayer_id).trim() !== id) {
      return { ok: false, reason: `catalogue row is for id ${catalogRow.tcgplayer_id}, deal is id ${id}` };
    }
    if (!catalogRow.image_url) return { ok: false, reason: `card_catalog row ${id} has no canonical image` };
    if (isSellerImageUrl(catalogRow.image_url)) return { ok: false, reason: `card_catalog row ${id} image is not canonical` };
    // identity reconciliation - a wrong-print id would surface here
    const dn = idToken(deal.card_name);
    const cn = idToken(catalogRow.name);
    if (dn && cn && dn !== cn && !dn.includes(cn) && !cn.includes(dn)) {
      return { ok: false, reason: `printing identity mismatch: deal card_name "${deal.card_name}" vs catalogue "${catalogRow.name}" for id ${id}` };
    }
    const ds = idToken(deal.card_set);
    const cs = idToken(catalogRow.set);
    if (ds && cs && ds !== cs && !ds.includes(cs) && !cs.includes(ds)) {
      return { ok: false, reason: `printing set mismatch: deal set "${deal.card_set}" vs catalogue "${catalogRow.set}" for id ${id}` };
    }
  }
  return {
    ok: true,
    reason: catalogRow
      ? `exact tcgplayer id ${id}; catalogue identity reconciles (${catalogRow.name} - ${catalogRow.set}${catalogRow.card_number ? " #" + catalogRow.card_number : ""})`
      : `exact tcgplayer id ${id}; URL self-consistent (no catalogue row supplied for cross-check)`,
    tcgplayerId: id,
    cardNumber: catalogRow?.card_number ?? null,
  };
}

// The one network call. Host-locked GET; follows up to 3 SAME-HOST
// redirects; writes atomically. Never runs if the file is already cached.
function httpsGetToFile(url, destPath, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    if (!isCanonicalImageUrl(url)) return reject(new Error(`refusing to fetch non-canonical host ${hostOf(url)}`));
    const tmp = destPath + ".part";
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error("too many redirects"));
        const next = new URL(res.headers.location, url).href;
        if (!isCanonicalImageUrl(next)) return reject(new Error(`redirect left the canonical host: ${hostOf(next)}`));
        return resolve(httpsGetToFile(next, destPath, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 512) return reject(new Error(`suspiciously small image (${buf.length} bytes)`));
        try {
          writeFileSync(tmp, buf);
          renameSync(tmp, destPath);
          resolve(destPath);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
  });
}

// Resolve ONE card's canonical artwork for Version C. Async only because
// of the (cached) download. Returns:
//   { status: "ready", localPath, sourceUrl, provider, printingMatch }
//   { status: "failed", reason, provider, printingMatch }
export async function resolveCardArtwork(
  deal,
  { rightsState, catalogRow = null, cacheDir = CARD_ART_CACHE_DIR, cwd = process.cwd(), downloadImpl = httpsGetToFile } = {}
) {
  const base = { provider: CARD_ART_PROVIDER };

  if (!rightsState || rightsState.card_image !== "CLEARED") {
    return { ...base, status: "failed", reason: "card_image rights are not CLEARED - Version C disabled", printingMatch: { ok: false, reason: "rights" } };
  }
  if (rightsState.ebay_seller_images === "CLEARED") {
    // defensive: this clearance is out of scope for 13E.2.1; if it ever
    // flips it must not silently change which image Layer 2 uses.
    return { ...base, status: "failed", reason: "ebay_seller_images unexpectedly CLEARED - stop and re-check the Layer 2 source before proceeding", printingMatch: { ok: false, reason: "rights" } };
  }

  const pm = printingMatch(deal, catalogRow);
  if (!pm.ok) return { ...base, status: "failed", reason: pm.reason, printingMatch: pm };

  const url = canonicalArtworkUrl(deal);
  const id = pm.tcgplayerId;
  const absCacheDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(cwd, cacheDir);
  const localPath = path.join(absCacheDir, `${id}.jpg`);

  if (existsSync(localPath) && safeSize(localPath) > 512) {
    return { ...base, status: "ready", localPath, sourceUrl: url, printingMatch: pm, cached: true };
  }
  try {
    mkdirSync(absCacheDir, { recursive: true });
    await downloadImpl(url, localPath);
    return { ...base, status: "ready", localPath, sourceUrl: url, printingMatch: pm, cached: false };
  } catch (e) {
    try {
      if (existsSync(localPath + ".part")) unlinkSync(localPath + ".part");
    } catch {}
    return { ...base, status: "failed", reason: `canonical image download failed: ${e.message}`, printingMatch: pm, sourceUrl: url };
  }
}

function safeSize(p) {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

// Spotlight families (Pokemon Watch / Set Watch): resolve 2-4 DISTINCT
// exact printings. Never duplicates one card to fake a set. Returns
//   { status: "ready", cards: [{ tcgplayerId, localPath, sourceUrl, printingMatch }], provider }
//   { status: "failed", reason, resolved: [...], skipped: [{ reason }], provider }
export async function resolveMultiCardArtwork(deals, opts = {}) {
  const provider = CARD_ART_PROVIDER;
  const min = opts.min ?? 2;
  const max = opts.max ?? 4;
  const catalogRowFor = opts.catalogRowFor ?? (() => null);
  const seen = new Set();
  const cards = [];
  const skipped = [];
  for (const d of deals ?? []) {
    if (cards.length >= max) break;
    const id = d?.card_tcgplayer_id != null ? String(d.card_tcgplayer_id).trim() : "";
    if (!id || seen.has(id)) {
      skipped.push({ reason: id ? `duplicate printing ${id} skipped (no card is shown twice)` : "no tcgplayer id" });
      continue;
    }
    seen.add(id);
    const r = await resolveCardArtwork(d, { ...opts, catalogRow: catalogRowFor(id) });
    if (r.status === "ready") cards.push({ tcgplayerId: id, localPath: r.localPath, sourceUrl: r.sourceUrl, printingMatch: r.printingMatch });
    else skipped.push({ reason: r.reason });
  }
  if (cards.length < min) {
    return { status: "failed", reason: `only ${cards.length} distinct exact printings resolved (need ${min}) - fail closed`, resolved: cards, skipped, provider };
  }
  return { status: "ready", cards, skipped, provider };
}

export { httpsGetToFile as _httpsGetToFile, idToken as _idToken };

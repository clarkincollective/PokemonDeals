// Phase 13E.5C - PUBLIC MEDIA HOSTING tests.
//
// Hosting = uploading a publish-eligible rendered asset to a PUBLIC URL
// Buffer can fetch. It is NOT publishing. These pin: QA + rights gate the
// upload; content-addressing dedupes identical bytes and forces a new
// object on any change; only safe media types; never a secret / seller
// photo; the frozen URL flows into the distribution ledger; asset drift
// blocks a later send; QUEUED/PUBLISHED media is retention-protected; a
// media placement needs a public URL but a text-only X post does not. No
// network in any test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  sha256,
  storageKeyFor,
  canHost,
  buildHostedRecord,
  assetMatches,
  cleanupCandidates,
  EXT_MIME,
} from "../../lib/social/storage/hostedAssets.mjs";
import { _storage, getStorageProvider } from "../../lib/social/storage/index.mjs";
import { ALLOWED_MIME, MAX_BYTES } from "../../lib/social/storage/supabase.mjs";
import { runAllGates } from "../../lib/social/distribution/gates.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const GOOD_QA = { ok: true, passed: 39, total: 39, failed: [] };
const GOOD_RIGHTS = { ...RIGHTS_STATE };
const VID_BYTES = Buffer.from("fake mp4 bytes ".repeat(50));

function hostArgs(over = {}) {
  return {
    localPath: ".social-preview/13e4/deal_drop_reel.mp4",
    bytes: VID_BYTES,
    mime: "video/mp4",
    qa: GOOD_QA,
    rights: GOOD_RIGHTS,
    currentRights: RIGHTS_STATE,
    ...over,
  };
}

test("13E.5C-1. QA failure blocks hosting", () => {
  const r = canHost(hostArgs({ qa: { ok: false, passed: 10, total: 39, failed: ["mp4_probe"] } }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /QA not passing/);
});

test("13E.5C-2. uncleared / drifted rights block hosting", () => {
  assert.equal(canHost(hostArgs({ rights: { ...GOOD_RIGHTS, card_image: "NOT_CLEARED" } })).ok, false);
  assert.equal(canHost(hostArgs({ rights: { ...GOOD_RIGHTS, ppt_social_data: "PENDING" } })).ok, false);
  // publishing DISABLED is FINE for hosting - hosting is not publishing
  assert.equal(canHost(hostArgs({ rights: { ...GOOD_RIGHTS, publishing: "DISABLED" } })).ok, true);
});

test("13E.5C-3. an approved asset may be hosted while social publishing is DISABLED", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  const r = canHost(hostArgs());
  assert.equal(r.ok, true, r.reason);
});

test("13E.5C-4. identical bytes -> identical content-addressed key (dedupe)", () => {
  const a = Buffer.from("same exact bytes");
  const b = Buffer.from("same exact bytes");
  assert.equal(sha256(a), sha256(b));
  assert.equal(storageKeyFor(sha256(a), ".mp4"), storageKeyFor(sha256(b), ".mp4"));
});

test("13E.5C-5. changed bytes -> a NEW immutable object key (no in-place overwrite)", () => {
  const k1 = storageKeyFor(sha256(Buffer.from("v1")), ".mp4");
  const k2 = storageKeyFor(sha256(Buffer.from("v2")), ".mp4");
  assert.notEqual(k1, k2);
  assert.match(k1, /^by-hash\/[0-9a-f]{64}\.mp4$/);
});

test("13E.5C-6. only safe media types are hostable", () => {
  assert.deepEqual([...ALLOWED_MIME].sort(), ["image/jpeg", "image/png", "video/mp4"]);
  for (const bad of ["text/plain", "application/json", "image/gif", "video/quicktime", "application/octet-stream"]) {
    assert.equal(canHost(hostArgs({ mime: bad })).ok, false, bad);
  }
  assert.equal(canHost(hostArgs({ bytes: Buffer.alloc(MAX_BYTES + 1), mime: "video/mp4" })).ok, false, "oversize");
});

test("13E.5C-7. eBay seller imagery is never hostable", () => {
  assert.equal(canHost(hostArgs({ localPath: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg", mime: "image/jpeg" })).ok, false);
  assert.equal(canHost(hostArgs({ isSellerImage: true, mime: "image/jpeg" })).ok, false);
});

test("13E.5C-8. secret / config / manifest / log files are never hostable", () => {
  for (const p of [
    ".env.local",
    "lib/social/distribution/ledger.json",
    "lib/outreach/records.json",
    ".social-preview/13e4/manifest.json",
    ".social-preview/_video_rerun.log",
    "supabase/scan_allocator_migration.sql",
    "lib/social/storage/hosted-assets.json",
  ]) {
    const r = canHost(hostArgs({ localPath: p, mime: p.endsWith(".png") ? "image/png" : "video/mp4" }));
    assert.equal(r.ok, false, `${p} must be refused`);
  }
});

test("13E.5C-9. buildHostedRecord captures the full documented record shape", () => {
  const rec = buildHostedRecord({
    content_id: "pdf-deal-drop-x",
    creative_family: "deal_drop",
    artifact_type: "video_916",
    platform_eligibility: ["instagram_reel", "tiktok", "youtube_short"],
    localPath: ".social-preview/13e4/deal_drop_reel.mp4",
    bytes: VID_BYTES,
    mime: "video/mp4",
    width: 1080,
    height: 1920,
    durationS: 8,
    qa: GOOD_QA,
    rights: GOOD_RIGHTS,
    sourceCommit: "abc1234",
  });
  for (const k of [
    "asset_id", "content_id", "creative_family", "artifact_type", "platform_eligibility",
    "local_source_path", "sha256", "mime_type", "bytes", "width", "height", "duration_s",
    "storage_provider", "storage_key", "public_url", "uploaded_at", "source_commit",
    "qa_verdict", "rights_state",
  ]) {
    assert.ok(k in rec, `missing ${k}`);
  }
  assert.equal(rec.sha256, sha256(VID_BYTES));
  assert.equal(rec.storage_key, storageKeyFor(rec.sha256, ".mp4"));
  assert.equal(rec.public_url, null, "public_url is null until a real upload");
  assert.equal(rec.storage_provider, null);
});

test("13E.5C-10. asset drift blocks a future send", () => {
  const hosted = { ...buildHostedRecord({ localPath: "x.mp4", bytes: VID_BYTES, mime: "video/mp4", qa: GOOD_QA, rights: GOOD_RIGHTS }), public_url: "https://x/y.mp4" };
  assert.equal(assetMatches(hosted, hosted.sha256).ok, true);
  const drifted = assetMatches(hosted, sha256(Buffer.from("different bytes")));
  assert.equal(drifted.ok, false);
  assert.match(drifted.reason, /drift/i);
  // ...and the gate stack catches it
  const row = {
    platform: "instagram_reel", creative_family: "deal_drop", status: "APPROVED",
    caption: "body\n\nAd · x", hashtags: [], qa: GOOD_QA, rights: GOOD_RIGHTS,
    snapshot: { market_price: 100, discount_pct: 0.5, source_is_live: true, source_captured_at: new Date().toISOString() },
    media: { kind: "video_916", files: ["/local/x.mp4"], width: 1080, height: 1920, durationS: 8, filesExist: true },
    public_media_url: "https://x/y.mp4", media_sha256: hosted.sha256, channel_id: "c1",
  };
  const variant = { media: row.media, qa: GOOD_QA, rights: GOOD_RIGHTS, caption_instagram: row.caption, snapshot: row.snapshot };
  const flags = { publishEnabled: true, dryRun: false, epnAiClassification: "NOT_APPLICABLE_CURRENT_PIPELINE", hasBufferToken: true };
  const clean = runAllGates({ row, variant, flags, providerConfigured: true, ledger: [], currentMediaSha: hosted.sha256 });
  const dirty = runAllGates({ row, variant, flags, providerConfigured: true, ledger: [], currentMediaSha: sha256(Buffer.from("changed")) });
  assert.equal(clean.gates.find((g) => g.id === "asset_not_drifted").ok, true);
  assert.equal(dirty.gates.find((g) => g.id === "asset_not_drifted").ok, false);
});

test("13E.5C-11. QUEUED / PUBLISHED media is retention-protected; old orphans are cleanup candidates", () => {
  const old = new Date(Date.now() - 90 * 864e5).toISOString();
  const recent = new Date().toISOString();
  const hosted = [
    { asset_id: "ha_used", public_url: "https://s/used.mp4", uploaded_at: old },
    { asset_id: "ha_orphan_old", public_url: "https://s/orphan.mp4", uploaded_at: old },
    { asset_id: "ha_orphan_new", public_url: "https://s/new.mp4", uploaded_at: recent },
  ];
  const ledger = [
    { status: "PUBLISHED", hosted_asset_id: "ha_used", public_media_url: "https://s/used.mp4" },
    { status: "DRAFT", hosted_asset_id: "ha_orphan_old" },
  ];
  const cands = cleanupCandidates(hosted, ledger, { olderThanDays: 30 });
  const ids = cands.map((r) => r.asset_id);
  assert.ok(ids.includes("ha_orphan_old"), "old orphan is a candidate");
  assert.ok(!ids.includes("ha_used"), "PUBLISHED-referenced asset is protected");
  assert.ok(!ids.includes("ha_orphan_new"), "recent orphan is not old enough");
});

test("13E.5C-12. a media placement needs a public HTTPS URL; a text-only X post does not", () => {
  const base = {
    creative_family: "deal_drop", status: "APPROVED", caption: "body\n\nAd · x", hashtags: [],
    qa: GOOD_QA, rights: GOOD_RIGHTS, snapshot: { market_price: 100, discount_pct: 0.5, source_is_live: true, source_captured_at: new Date().toISOString() }, channel_id: "c1",
  };
  const flags = { publishEnabled: true, dryRun: false, epnAiClassification: "NOT_APPLICABLE_CURRENT_PIPELINE", hasBufferToken: true };

  // a Reel with a local file but NO public URL -> media_present fails
  const noUrl = {
    ...base, platform: "instagram_reel",
    media: { kind: "video_916", files: ["/local/x.mp4"], width: 1080, height: 1920, durationS: 8, filesExist: true },
    public_media_url: null,
  };
  const v = { media: noUrl.media, qa: GOOD_QA, rights: GOOD_RIGHTS, caption_instagram: noUrl.caption, snapshot: noUrl.snapshot };
  assert.equal(runAllGates({ row: noUrl, variant: v, flags, providerConfigured: true, ledger: [] }).gates.find((g) => g.id === "media_present").ok, false);

  // the same Reel WITH a public URL -> media_present passes
  const withUrl = { ...noUrl, public_media_url: "https://cdn.example.com/by-hash/deadbeef.mp4", media_sha256: "deadbeef" };
  assert.equal(runAllGates({ row: withUrl, variant: v, flags, providerConfigured: true, ledger: [], currentMediaSha: "deadbeef" }).gates.find((g) => g.id === "media_present").ok, true);

  // a text-only X post with NO media URL -> media_present passes (caption covers it)
  const xText = {
    ...base, platform: "x_post", caption: "Just found: Ditto\nListed: $40\n72% below reference\n\nx.com\n\n(Ad)",
    media: { kind: "text_only", files: [], width: 0, height: 0, filesExist: true }, public_media_url: null,
  };
  const xv = { media: xText.media, qa: GOOD_QA, rights: GOOD_RIGHTS, x: { ok: true, text: xText.caption }, snapshot: xText.snapshot };
  assert.equal(runAllGates({ row: xText, variant: xv, flags, providerConfigured: true, ledger: [] }).gates.find((g) => g.id === "media_present").ok, true);
});

test("13E.5C-13. the null storage provider refuses every call (no creds -> nothing uploads)", async () => {
  const s = _storage.nullStorage;
  assert.equal(s.isConfigured(), false);
  assert.equal((await s.upload({})).ok, false);
  assert.equal((await s.head("https://x")).ok, false);
  // the real selector picks supabase only when both env vars are present
  assert.equal(getStorageProvider({}).name, "none");
  assert.equal(getStorageProvider({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }).name, "supabase");
});

test("13E.5C-14. dry-run + host make ZERO createPost calls; renderer imports no storage", () => {
  const cli = read("scripts/socialPublish.mjs");
  const host = cli.slice(cli.indexOf("async function cmdHost"), cli.indexOf("async function cmdVerifyHosts"));
  assert.doesNotMatch(host, /PROVIDER\.createPost\s*\(/, "host must never call createPost");
  const dry = cli.slice(cli.indexOf("function cmdDryRun"), cli.indexOf("function cmdApprove"));
  assert.doesNotMatch(dry, /PROVIDER\.(createPost|listChannels|getPostStatus)\s*\(/);
  // renderer / daily / video are not coupled to storage
  for (const p of ["lib/social/render.mjs", "lib/social/templates.mjs", "scripts/socialDaily.mjs", "scripts/socialVideo.mjs"]) {
    assert.doesNotMatch(read(p), /from ["'][^"']*social\/storage/, `${p} imports storage`);
  }
});

test("13E.5C-15. the Buffer adapter consumes the FROZEN public URL, never a local path, and never uploads at send", () => {
  const cli = read("scripts/socialPublish.mjs");
  const send = cli.slice(cli.indexOf("async function cmdSend"), cli.indexOf("async function cmdSync"));
  assert.match(send, /row\.public_media_url/);
  assert.doesNotMatch(send, /STORAGE\.upload\s*\(/, "send must not upload");
  assert.match(send, /kind === "text_only" \|\| !row\.public_media_url\s*\n?\s*\?\s*\[\]/);
  const buf = read("lib/social/providers/buffer.mjs");
  assert.match(buf, /url: a\.url/); // asset url passed straight through
});

test("13E.5C-16. hosted-asset store: safe shape, public https URLs, no secrets, content-addressed keys", () => {
  const rows = JSON.parse(read("lib/social/storage/hosted-assets.json"));
  assert.ok(Array.isArray(rows));
  const blob = JSON.stringify(rows);
  // never a credential / token / local absolute path leaked into the store
  assert.doesNotMatch(blob, /BUFFER_ACCESS_TOKEN|SERVICE_ROLE|SUPABASE_SERVICE|eyJ[A-Za-z0-9_-]{20}/);
  assert.doesNotMatch(blob, /i\.ebayimg\.com|ebaystatic/i);
  for (const r of rows) {
    assert.match(r.asset_id, /^ha_[0-9a-f]{24}$/);
    assert.match(r.sha256, /^[0-9a-f]{64}$/);
    assert.equal(r.storage_key, `by-hash/${r.sha256}${r.mime_type === "video/mp4" ? ".mp4" : r.mime_type === "image/jpeg" ? ".jpg" : ".png"}`);
    if (r.public_url) {
      assert.match(r.public_url, /^https:\/\/\S+\/storage\/v1\/object\/public\/social-public\/by-hash\/[0-9a-f]{64}\.\w+$/);
      assert.equal(r.storage_provider, "supabase");
      assert.ok(["image/png", "image/jpeg", "video/mp4"].includes(r.mime_type));
      assert.ok(r.qa_verdict && r.qa_verdict.ok === true);
    }
  }
  const sup = read("lib/social/storage/supabase.mjs");
  assert.match(sup, /export const BUCKET = "social-public"/);
  assert.match(sup, /upsert:\s*false/); // immutable objects
});

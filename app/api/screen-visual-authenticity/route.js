import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { catalogImageUrl } from "@/lib/cardImage";
import { isVisualScreeningCandidate, screenDeal } from "@/lib/visualAuthenticity";

// OUT-OF-BAND visual counterfeit screening worker (Phase: bounded visual
// screening). Runs on its own cron - NEVER on the Browse scan path. Each
// invocation screens a small bounded batch of HIGH-RISK deals whose
// listing photo has not been compared to the canonical catalogue image
// recently, and writes a MATCH / MISMATCH / UNKNOWN verdict to
// visual_authenticity_status. lib/dealQuality turns MISMATCH into
// authenticity:proxy_or_counterfeit and a high-value + extreme-discount
// UNKNOWN into authenticity:visual_unverified.
//
// Cost per run: BATCH deals x (2 small image fetches + 2 sharp decodes),
// plus at most BATCH bounded vision calls (only when VISION_API_KEY is
// set and Stage 1 was inconclusive). No eBay Browse calls.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 20;
const RESCREEN_AFTER_DAYS = 21;
// Candidate scan is bounded - we only ever look at this many active rows
// to find BATCH unscreened/stale ones, and stop early once BATCH are in
// hand. Rows sort checked_at-asc-nulls-first so the unscreened ones come
// first, but a candidate is a rare shape (~3% of active deals) and only
// ~half sit in any given 4k slice, so the cap has to comfortably exceed
// the whole active population or the tail candidates are never reached
// (this is how deal 12766's cohort of high-value/sub-steep listings sat
// unscreened). Paging further only happens on runs the early pages don't
// fill.
const SCAN_CAP = 12000;
const PAGE = 1000;

const COLS =
  "id, card_name, card_set, card_tcgplayer_id, image_url, market_price, discount_pct, is_graded, " +
  "disqualified_reason, seller_feedback_score, image_count, returns_accepted, " +
  "visual_authenticity_status, visual_authenticity_checked_at";

async function fetchImage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 8_000_000) throw new Error("img too large");
  return buf;
}

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const staleCutoff = new Date(Date.now() - RESCREEN_AFTER_DAYS * 864e5).toISOString();

  // Gather candidates: active, high-risk, unscreened or stale.
  const candidates = [];
  for (let from = 0; from < SCAN_CAP && candidates.length < BATCH; from += PAGE) {
    const { data, error } = await db
      .from("deals")
      .select(COLS)
      .eq("is_active", true)
      .order("visual_authenticity_checked_at", { ascending: true, nullsFirst: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // pre-migration: the columns don't exist yet
      return Response.json({ ok: false, stage: "select", error: error.message }, { status: 200 });
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (candidates.length >= BATCH) break;
      if (!isVisualScreeningCandidate(row)) continue;
      if (row.visual_authenticity_checked_at && row.visual_authenticity_checked_at > staleCutoff) continue;
      candidates.push(row);
    }
    if (data.length < PAGE) break;
  }

  const results = { MATCH: 0, MISMATCH: 0, UNKNOWN: 0, errors: 0 };
  const detail = [];
  for (const row of candidates) {
    const canonicalUrl = catalogImageUrl(row.card_tcgplayer_id);
    let verdict;
    try {
      verdict = await screenDeal({ row, canonicalUrl }, { fetchImage });
    } catch (e) {
      results.errors++;
      verdict = { status: "UNKNOWN", reason: `worker_error:${String(e.message).slice(0, 80)}` };
    }
    results[verdict.status] = (results[verdict.status] ?? 0) + 1;
    detail.push({ id: row.id, status: verdict.status });
    const { error } = await db
      .from("deals")
      .update({
        visual_authenticity_status: verdict.status,
        visual_authenticity_reason: verdict.reason?.slice(0, 500) ?? null,
        visual_authenticity_checked_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) results.errors++;
  }

  return Response.json({ ok: true, screened: candidates.length, results, detail });
}

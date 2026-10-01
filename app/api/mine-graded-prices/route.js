import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadBoardDealRecords } from "@/lib/boardDeals";
import { savedGradedKind } from "@/lib/savedReference";
import { buildGradedMiningUpdate, anyGradePassesConfidence } from "@/lib/boardGradedMining";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 28 Sep 2026 - owner: "find ways we can keep the market data updated.
// using free sources and webscraping." Refreshes saved_graded:*
// (lib/savedReference) from the board scraper's own already-captured
// graded valuations - see lib/boardGradedMining.js for the full rationale.
// Zero new network requests: reads catalog_snapshot rows the board crons
// already wrote and card_catalog (tcgcsv, free), writes catalog_snapshot.
export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const db = supabaseAdmin();

  const records = [...(await loadBoardDealRecords(db)).values()];
  const candidates = records.filter(
    (r) => r.card?.tcgplayerId && r.captured?.valuation > 0 && r.captured?.valuationBasis && r.variant && !/^(raw|sealed)$/i.test(r.variant)
  );

  const byCard = new Map();
  for (const r of candidates) {
    const language = "english";
    const key = `${r.card.tcgplayerId}|${language}`;
    const entry = byCard.get(key) ?? { tcgplayerId: r.card.tcgplayerId, language, cardName: r.name ?? null, setName: r.set ?? null, boardRows: [] };
    entry.boardRows.push({ valuation: r.captured.valuation, valuationBasis: r.captured.valuationBasis, marketplace: r.marketplace, itemId: r.itemId, at: r.captured.at ?? r.captured.foundAt ?? r.lastSeenOnBoardAt ?? null });
    byCard.set(key, entry);
  }

  const ids = [...new Set([...byCard.values()].map((c) => c.tcgplayerId))];
  const rawNmById = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from("card_catalog").select("tcgplayer_id, market_price").in("tcgplayer_id", ids.slice(i, i + 500));
    for (const row of data ?? []) if (row.market_price > 0) rawNmById.set(String(row.tcgplayer_id), Number(row.market_price));
  }

  const kinds = [...byCard.values()].map((c) => savedGradedKind(c.tcgplayerId, c.language));
  const existingByKind = new Map();
  for (let i = 0; i < kinds.length; i += 200) {
    const { data } = await db.from("catalog_snapshot").select("kind, data").in("kind", kinds.slice(i, i + 200));
    for (const row of data ?? []) existingByKind.set(row.kind, row.data);
  }

  let usable = 0;
  let gradeBuckets = 0;
  const upserts = [];
  for (const c of byCard.values()) {
    const kind = savedGradedKind(c.tcgplayerId, c.language);
    const updated = buildGradedMiningUpdate(existingByKind.get(kind), c.boardRows, {
      tcgplayerId: c.tcgplayerId,
      language: c.language,
      cardName: c.cardName,
      setName: c.setName,
      rawNm: rawNmById.get(String(c.tcgplayerId)) ?? null,
    });
    if (!updated) continue;
    gradeBuckets += Object.keys(updated.salesByGrade).length;
    if (anyGradePassesConfidence(updated)) usable++;
    upserts.push({ kind, data: updated, updated_at: new Date().toISOString() });
  }

  let written = 0;
  const errors = [];
  if (!dry) {
    for (let i = 0; i < upserts.length; i += 200) {
      const slice = upserts.slice(i, i + 200);
      const { error } = await db.from("catalog_snapshot").upsert(slice, { onConflict: "kind" });
      if (error) errors.push(error.message);
      else written += slice.length;
    }
  }

  return Response.json({
    ok: errors.length === 0,
    dry,
    candidates: candidates.length,
    cards: byCard.size,
    rowsToWrite: upserts.length,
    written,
    gradeBuckets,
    usableCards: usable,
    errors,
    tookMs: Date.now() - started,
  });
}

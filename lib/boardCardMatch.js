// Ties an imported board row to ONE catalogue printing (28 Sep 2026, owner:
// board rows "should feed all through the site" -> the card pages too).
//
// A board row is structured, unlike an eBay title: it states a set ("Neo
// Destiny (2002)", "Evolving Skies (2021)"), a name with the collector number
// ("Togepi #56", "Zygarde GX #SV65") and a listing title that usually
// carries "56/105". So the match is a lookup, not a text search:
//
//   set     - the board's set name normalised (year dropped) must equal one
//             of the catalogue set's keys: its full name, the name without
//             the era code ("SWSH07: Evolving Skies" -> "evolving skies",
//             "SM - Cosmic Eclipse" -> "cosmic eclipse") or without a
//             leading "EX " ("EX Hidden Legends" -> "hidden legends");
//   number  - the collector number from the board name ("#56") or, failing
//             that, the title ("56/105"); letters kept, leading zeros
//             dropped ("SV093" == "SV93");
//   name    - the first word of the board name must appear in the
//             catalogue name (so Celebrations #17 "Umbreon" is not tied to
//             the catalogue's #17 "Groudon" when the boards' numbering
//             differs);
//   language- a set the board marks "(Japanese)" only matches a Japanese
//             catalogue row; everything else English.
// Exactly one printing must survive; two or more (or none) is NO match.
// Measured 28 Sep on 15,364 single/graded rows: 11,788 unique matches, 36
// ambiguous, 546 name misses, 204 without a number, 2,790 unknown sets.
//
// Where it runs: scripts/boards/captureJimmy.mjs stamps `card` on every
// record that has never been attempted (stampCatalogMatches), so it costs
// nothing on Vercel; the cached board index then carries the id and a card
// page reads its rows by it. `card: { tcgplayerId: null, at }` means "tried,
// no unique printing" and is not retried until the catalogue changes shape.

function normSet(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\((19|20)\d\d\)/g, "")
    .replace(/\bjapanese\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|and|pokemon)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// the keys a catalogue set answers to
function catalogSetKeys(set) {
  const raw = String(set || "");
  const full = normSet(raw);
  const noCode = normSet(raw.replace(/^[A-Za-z0-9&.\- ]{1,10}:\s*/, ""));
  const noDash = normSet(raw.replace(/^[A-Za-z&]{1,5}\s*-\s*/, ""));
  const noEx = noCode.replace(/^ex /, "");
  return [...new Set([full, noCode, noDash, noEx].filter(Boolean))];
}

function normNumber(n) {
  return String(n || "")
    .toUpperCase()
    .replace(/^([A-Z]*)0+(?=\d)/, "$1");
}

function boardNumber(name, title) {
  const m = /#\s*([A-Za-z]*\d+[A-Za-z]?)\b/.exec(name || "") || /\b([A-Za-z]{0,3}\d{1,3}[A-Za-z]?)\/[A-Za-z]{0,3}\d{2,3}\b/.exec(title || "");
  return m ? normNumber(m[1]) : null;
}

function normName(n) {
  return String(n || "")
    .toLowerCase()
    .replace(/#.*$/, "")
    .replace(/\(jp\)/, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boardLanguage(set) {
  return /japanese/i.test(String(set || "")) ? "japanese" : "english";
}

// rows: card_catalog rows with tcgplayer_id, name, set, card_number, language
function buildCatalogMatchIndex(rows) {
  const bySetNum = new Map();
  const sets = new Set();
  for (const c of rows ?? []) {
    const n = normNumber(String(c.card_number || "").split("/")[0]);
    if (!n) continue;
    for (const key of catalogSetKeys(c.set)) {
      sets.add(key);
      const k = `${key}|${n}`;
      let list = bySetNum.get(k);
      if (!list) bySetNum.set(k, (list = []));
      list.push({ tcgplayerId: String(c.tcgplayer_id), name: c.name, set: c.set, language: c.language ?? "english" });
    }
  }
  return { bySetNum, sets, size: rows?.length ?? 0 };
}

// -> { tcgplayerId } | null
function matchBoardRecord(record, index) {
  if (!record || !index) return null;
  const setKey = normSet(record.set);
  if (!setKey || !index.sets.has(setKey)) return null;
  const n = boardNumber(record.name, record.title);
  if (!n) return null;
  const lang = boardLanguage(record.set);
  const firstWord = normName(record.name).split(" ")[0];
  if (!firstWord) return null;
  const candidates = (index.bySetNum.get(`${setKey}|${n}`) ?? []).filter((c) => (c.language ?? "english") === lang && normName(c.name).includes(firstWord));
  const ids = new Set(candidates.map((c) => c.tcgplayerId));
  if (ids.size !== 1) return null;
  return { tcgplayerId: [...ids][0] };
}

async function loadCatalogForMatching(db) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,language").order("tcgplayer_id").range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// Stamps `card` on every record that has never been attempted. Returns the
// records that changed (the caller saves them). `records` is a Map of
// kind -> record; `overlay` (optional) is a Map of the records this run
// already rewrote, which take precedence.
async function stampCatalogMatches(db, records, { overlay = null, now = new Date().toISOString(), max = 20000 } = {}) {
  const todo = [];
  for (const [kind, base] of records ?? []) {
    const r = overlay?.get(kind) ?? base;
    if (!r || r.card !== undefined) continue;
    if (String(r.variant ?? "").toLowerCase() === "sealed") continue;
    todo.push([kind, r]);
    if (todo.length >= max) break;
  }
  if (!todo.length) return { changed: [], attempted: 0, matched: 0, catalog: 0 };
  const catalog = await loadCatalogForMatching(db);
  if (!catalog.length) return { changed: [], attempted: 0, matched: 0, catalog: 0 };
  const index = buildCatalogMatchIndex(catalog);
  const changed = [];
  let matched = 0;
  for (const [, r] of todo) {
    const m = matchBoardRecord(r, index);
    if (m) matched++;
    changed.push({ ...r, card: { tcgplayerId: m?.tcgplayerId ?? null, at: now } });
  }
  return { changed, attempted: todo.length, matched, catalog: catalog.length };
}

module.exports = {
  normSet,
  catalogSetKeys,
  boardNumber,
  normName,
  boardLanguage,
  buildCatalogMatchIndex,
  matchBoardRecord,
  loadCatalogForMatching,
  stampCatalogMatches,
};

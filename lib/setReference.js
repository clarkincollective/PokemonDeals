// Phase 17C.12 - set-specific reference notes for the collector checklist.
//
// A few short, verified explanations of how ONE set's printed numbering
// maps onto the checklist entries, which entries sit above the printed
// total, and the set-specific distinctions that decide whether two rows
// are the same card. Pilot sets only (Jungle, Neo Destiny, Boundaries
// Crossed); every other set renders nothing - no generic filler.
//
// Two rules keep this honest:
//   1. Every number, name and count in the copy is read from the SAME rows
//      the checklist renders (lib/setChecklist buildChecklistRows), never
//      typed in. The curated part is only WHICH facts to explain.
//   2. Each curated fact is a claim that is VERIFIED against those rows at
//      render time. If the catalogue changes underneath it - a renamed
//      card, a missing secret rare, a different printed total - the whole
//      block is withheld (returns null) rather than shown wrong.
//
// Factual basis, checked 2026-09-12 against the catalogue rows and the
// public set articles on Bulbapedia (Jungle (TCG), Neo Destiny (TCG),
// Boundaries Crossed (TCG)):
//   Jungle          64 cards; Holofoil Rares 1-16 reprinted non-holo as
//                   17-32; 1st Edition + Unlimited; Unlimited holo rares
//                   also printed without the set symbol (error cards).
//   Neo Destiny     113 cards numbered /105; 106-113 are the eight Shining
//                   Pokemon; the last English expansion with a 1st Edition
//                   stamp; Dark and Light Pokemon named with a prefix.
//   Boundaries Crossed  153 cards numbered /149; 150-153 secret (Golurk,
//                   Terrakion, Altaria, Rocky Helmet); introduced ACE SPEC
//                   Item cards (137-140, "Rare Ace"); Full Art EX and
//                   Supporter cards 141-149 carry their own numbers.
// Nothing here infers scarcity, value or completeness from a number.
//
// Pure, relative imports only, so node:test runs it directly.

export const GUIDE_NUMBER_HREF = "/guides/how-to-find-pokemon-card-set-and-number";

export const SET_REFERENCE_SETS = Object.freeze(["Jungle", "Neo Destiny", "Boundaries Crossed"]);

const num = (r) => {
  const m = String(r?.number ?? "").match(/^\s*0*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};
const den = (r) => {
  const m = String(r?.number ?? "").match(/\/\s*0*(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
};
const byNum = (rows) => {
  const map = new Map();
  for (const r of rows) {
    const n = num(r);
    if (n != null && !map.has(n)) map.set(n, r);
  }
  return map;
};
const label = (r) => `${r.name} ${r.number}`;
const list = (parts) =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

// Facts every pilot shares, all derived from the rows.
//   total        entries in the checklist
//   printedTotal the one numbering total printed on the cards (null when
//                the rows carry more than one, which no pilot does)
//   aboveTotal   rows numbered beyond printedTotal, in number order
export function setNumberingFacts(rows) {
  const r = (rows ?? []).filter((x) => x && num(x) != null);
  const dens = new Set(r.map(den).filter((d) => d != null));
  const printedTotal = dens.size === 1 ? [...dens][0] : null;
  const aboveTotal = printedTotal == null ? [] : r.filter((x) => num(x) > printedTotal).sort((a, b) => num(a) - num(b));
  return { total: (rows ?? []).length, printedTotal, aboveTotal };
}

// --- per-set builders. Each returns { items } or null when a claim fails.

function jungle(rows, facts) {
  const { total, printedTotal, aboveTotal } = facts;
  if (printedTotal !== 64 || total !== 64 || aboveTotal.length !== 0) return null;
  const m = byNum(rows);
  // claim: 1-16 are Holo Rare and 17-32 are the same sixteen names as Rare
  const pairs = [];
  for (let i = 1; i <= 16; i++) {
    const holo = m.get(i);
    const plain = m.get(i + 16);
    if (!holo || !plain || holo.name !== plain.name || holo.rarity !== "Holo Rare" || plain.rarity !== "Rare") return null;
    pairs.push({ holo, plain });
  }
  const ex = pairs[0];
  return {
    items: [
      {
        id: "numbering",
        lead: "Numbered 1–64, one entry each",
        text: `Every Jungle card is numbered out of ${printedTotal}. This checklist has ${total} entries, one per collector number, and none above the printed total.`,
      },
      {
        id: "holo-pairs",
        lead: "Holo 1–16, the same sixteen again at 17–32",
        text: `Numbers 1–16 are the holofoil rares. The same sixteen Pokemon appear again at 17–32 as non-holofoil rares: ${ex.holo.name} is ${ex.holo.number} (${ex.holo.rarity}) and ${ex.plain.number} (${ex.plain.rarity}). They are separate entries, so a Jungle ${ex.holo.name} needs its number, not just its name, to be identified.`,
      },
      {
        id: "editions",
        lead: "1st Edition, Unlimited and the no-symbol error share a number",
        text: "Jungle was printed in 1st Edition and Unlimited, and the Unlimited holofoil rares also exist printed without the Jungle set symbol (a documented error). Those printings share one collector number and one entry here; the entry does not say which one you hold. Where a market reference is shown, it names the printing it is for.",
      },
    ],
  };
}

function neoDestiny(rows, facts) {
  const { total, printedTotal, aboveTotal } = facts;
  if (printedTotal !== 105 || total !== 113 || aboveTotal.length !== 8) return null;
  // claim: the eight entries above 105 are the Shining Pokemon, 106-113
  for (let i = 0; i < 8; i++) {
    const r = aboveTotal[i];
    if (num(r) !== 106 + i || !/^Shining /.test(r.name) || r.rarity !== "Secret Rare") return null;
  }
  const first = aboveTotal[0];
  const last = aboveTotal[7];
  // Dark / Light: a prefix that is part of the name; find one species that
  // appears under both prefixes, and one that appears Dark and Shining.
  const prefixed = rows.filter((r) => /^(Dark|Light) /.test(r.name));
  if (prefixed.length === 0) return null;
  const species = new Map();
  for (const r of rows) {
    const mm = r.name.match(/^(Dark|Light|Shining) (.+)$/);
    if (!mm) continue;
    const s = species.get(mm[2]) ?? {};
    s[mm[1]] = r;
    species.set(mm[2], s);
  }
  const darkLight = [...species.values()].find((s) => s.Dark && s.Light);
  const darkShining = [...species.values()].find((s) => s.Dark && s.Shining);
  const examples = [];
  if (darkLight) examples.push(`${label(darkLight.Dark)} and ${label(darkLight.Light)}`);
  if (darkShining) examples.push(`${label(darkShining.Dark)} and ${label(darkShining.Shining)}`);
  return {
    items: [
      {
        id: "above-total",
        lead: `Numbered out of ${printedTotal}, but ${total} entries`,
        text: `Cards are numbered out of ${printedTotal}. The ${aboveTotal.length} entries above it, ${label(first)} to ${label(last)}, are the Shining Pokemon, numbered beyond the printed total. A number above ${printedTotal} is normal in this set.`,
        link: { href: GUIDE_NUMBER_HREF, label: "Why a collector number can be higher than the total" },
      },
      {
        id: "prefixes",
        lead: "Dark, Light and Shining are part of the name",
        text: `${prefixed.length} of the ${total} entries are Dark or Light Pokemon. The prefix is part of the card name, and one species can appear under more than one${examples.length ? `: ${examples.join(", or ")}, are different entries` : ""}. Match the full name and the number.`,
      },
      {
        id: "editions",
        lead: "1st Edition and Unlimited share a number",
        text: "Neo Destiny was the last English expansion printed with a 1st Edition stamp. 1st Edition and Unlimited copies share one collector number and one entry here; the entry does not say which you hold. Where a market reference is shown, it names the printing it is for.",
      },
    ],
  };
}

function boundariesCrossed(rows, facts) {
  const { total, printedTotal, aboveTotal } = facts;
  if (printedTotal !== 149 || total !== 153 || aboveTotal.length !== 4) return null;
  // claim: 150-153 are Secret Rare
  for (let i = 0; i < 4; i++) {
    if (num(aboveTotal[i]) !== 150 + i || aboveTotal[i].rarity !== "Secret Rare") return null;
  }
  const m = byNum(rows);
  // claim: 137-140 are the ACE SPEC Items, recorded as "Rare Ace"
  const ace = [137, 138, 139, 140].map((n) => m.get(n));
  if (ace.some((r) => !r || r.rarity !== "Rare Ace")) return null;
  // same name, two numbers - two regular cards sharing a name, and a secret
  // card that repeats a regular card's name ("<name> (Secret)")
  const byName = new Map();
  for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
  const dupes = [...byName.values()].filter((l) => l.length > 1).map((l) => [...l].sort((a, b) => num(a) - num(b)));
  const commonTwin = dupes.find((l) => l.every((r) => num(r) <= printedTotal));
  const secretTwin = aboveTotal
    .map((r) => {
      const base = (byName.get(r.name.replace(/ \(Secret\)$/, "")) ?? []).filter((b) => num(b) <= printedTotal);
      return base.length === 1 ? { regular: base[0], secret: r } : null;
    })
    .find(Boolean);
  // claim: 141-149 are the Full Art cards ("<name> (<n> Full Art)"); the
  // example is one whose regular card is also listed
  const fullArt = [141, 142, 143, 144, 145, 146, 147, 148, 149].map((n) => m.get(n));
  if (fullArt.some((r) => !r || !/ \(\d+ Full Art\)$/.test(r.name))) return null;
  const withRegular = fullArt
    .map((r) => {
      const base = byName.get(r.name.replace(/ \(\d+ Full Art\)$/, ""));
      return base && base.length === 1 ? { regular: base[0], full: r } : null;
    })
    .filter(Boolean);
  const exFull = withRegular.find((p) => / EX$/.test(p.regular.name)) ?? withRegular[0];
  if (!exFull) return null;
  const twinText = [
    commonTwin ? `${commonTwin[0].name} is ${commonTwin[0].number} and ${commonTwin[1].number}` : null,
    secretTwin ? `${secretTwin.regular.name} is ${secretTwin.regular.number} and, as a secret card, ${secretTwin.secret.number}` : null,
  ].filter(Boolean);
  return {
    items: [
      {
        id: "above-total",
        lead: `Numbered out of ${printedTotal}, plus ${aboveTotal.length} secret cards`,
        text: `Cards are numbered out of ${printedTotal}. The ${aboveTotal.length} entries above it are the secret cards, ${list(aboveTotal.map(label))}, so the checklist has ${total} entries.`,
        link: { href: GUIDE_NUMBER_HREF, label: "Why a collector number can be higher than the total" },
      },
      {
        id: "same-name",
        lead: "Same name, different number, different entry",
        text: `${dupes.length} names appear on two cards with different numbers${twinText.length ? `: ${twinText.join("; ")}` : ""}. The nine Full Art cards, ${fullArt[0].number} to ${fullArt[8].number}, are separate entries from the regular cards of the same name: ${label(exFull.regular)} and ${exFull.full.number}. Each number is its own entry, so the name alone does not identify a Boundaries Crossed card.`,
      },
      {
        id: "ace-spec",
        lead: "ACE SPEC Items, 137–140",
        text: `Boundaries Crossed introduced ACE SPEC Item cards: ${list(ace.map((r) => r.name))} (${ace[0].number} to ${ace[3].number}). Our catalogue records their rarity as "${ace[0].rarity}", which is how they appear in the Rarity column.`,
      },
    ],
  };
}

const BUILDERS = { Jungle: jungle, "Neo Destiny": neoDestiny, "Boundaries Crossed": boundariesCrossed };

// rows: buildChecklistRows(cards). Returns
//   { setName, total, printedTotal, aboveTotal: number, items: [{ id, lead, text, link? }] }
// or null - for a non-pilot set, or when any curated claim fails against
// the rows (the block is withheld rather than shown wrong).
export function buildSetReference(setName, rows) {
  const build = BUILDERS[setName];
  if (!build) return null;
  const list_ = (rows ?? []).filter(Boolean);
  if (list_.length === 0) return null;
  const facts = setNumberingFacts(list_);
  const built = build(list_, facts);
  if (!built) return null;
  return {
    setName,
    total: facts.total,
    printedTotal: facts.printedTotal,
    aboveTotal: facts.aboveTotal.length,
    items: built.items,
  };
}

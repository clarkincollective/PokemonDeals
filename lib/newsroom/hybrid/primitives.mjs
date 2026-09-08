// Phase SOCIAL-CREATIVE-4B.1 - DETERMINISTIC VISUAL PRIMITIVE LIBRARY (§5).
//
// The AI art director SELECTS and ARRANGES these; it never draws factual
// content itself. Each primitive renders an inner HTML fragment from
// values PASSED IN by the freeform renderer, which sources every value
// from the FACT_LOCK or a sanctioned resolver. A primitive whose required
// `factSlots` are not all supplied throws (caught by the renderer ->
// COMPOSITION_REJECT / withhold).
//
// Pure string building. No I/O. Colours/type come from creativeSpec TOKENS
// (passed in as C / S so this module has no import cycle risk).

const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usd = (n) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`;
const pctTxt = (n) => `${Math.round(Number(n))}%`;

// Each entry: { factSlots:[required prop names], render(props, ctx) }
// ctx = { C (colour tokens), S (type sizes), zone:{width,height}, fit(fn) }
const P = {};

const label = (t, C, S, col) => `<div style="font-size:${Math.max(16, S.label ?? 22)}px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:${col ?? C.inkFaint}">${e(t)}</div>`;

P.eyebrow = {
  factSlots: ["text"],
  render: ({ text }, { C, S }) => label(text, C, S, C.inkFaint),
};

P.headline = {
  factSlots: ["text"],
  render: ({ text }, { C, S, zone, fit }) => {
    const f = fit(text, { boxW: zone.width, boxH: zone.height, minPx: 34, maxPx: Math.min(92, Math.round(zone.height * 0.6)), maxLines: 3, tracking: -0.03, lineHeight: 1.04 });
    return `<div style="font-weight:800;letter-spacing:-0.03em;line-height:1.04;color:${C.ink};font-size:${f.px}px">${f.lines.map(e).join("<br>")}</div>`;
  },
};
P.subheadline = {
  factSlots: ["text"],
  render: ({ text }, { C, S, zone, fit }) => {
    const f = fit(text, { boxW: zone.width, boxH: zone.height, minPx: 20, maxPx: 40, maxLines: 3, tracking: -0.01, lineHeight: 1.3 });
    return `<div style="font-weight:400;line-height:1.3;color:${C.inkSub};font-size:${f.px}px">${f.lines.map(e).join("<br>")}</div>`;
  },
};
P.hero_stat = {
  factSlots: ["value"],
  render: ({ value, caption }, { C, S, zone, fit }) => {
    const f = fit(String(value), { boxW: zone.width, minPx: 56, maxPx: Math.min(200, Math.round(zone.height * (caption ? 0.66 : 0.9))), maxLines: 1, tracking: -0.04 });
    return `<div style="display:flex;flex-direction:column;justify-content:center;height:100%">
      <div style="font-weight:800;letter-spacing:-0.04em;line-height:.95;color:${C.up};font-size:${f.px}px;font-variant-numeric:tabular-nums">${e(value)}</div>
      ${caption ? `<div style="margin-top:8px;font-size:${Math.max(18, S.body ?? 30)}px;color:${C.inkSub};line-height:1.25">${e(caption)}</div>` : ""}</div>`;
  },
};
P.secondary_stat = {
  factSlots: ["value"],
  render: ({ value, label: lab }, { C, S, zone, fit }) => {
    const f = fit(String(value), { boxW: zone.width, minPx: 32, maxPx: Math.min(84, Math.round(zone.height * 0.6)), maxLines: 1, tracking: -0.03 });
    return `<div>${lab ? label(lab, C, S) : ""}<div style="font-weight:800;letter-spacing:-0.03em;color:${C.ink};font-size:${f.px}px;font-variant-numeric:tabular-nums">${e(value)}</div></div>`;
  },
};
P.hero_card = {
  // artUrl is NOT a hard slot - the primitive degrades to a labelled box,
  // and the renderer's own needArt gate withholds real card stories.
  factSlots: [],
  render: ({ artUrl, name }, { C }) =>
    artUrl
      ? `<img src="${e(artUrl)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:16px">`
      : `<div style="width:100%;height:100%;border:1px dashed ${C.hair};border-radius:16px;display:flex;align-items:center;justify-content:center;color:${C.inkFaint};font-size:22px;text-align:center">${e(name ?? "canonical art")}<br>unavailable</div>`,
};
P.secondary_card = P.hero_card;
P.card_triptych = {
  factSlots: ["cards"],
  render: ({ cards = [] }, { C, S, zone }) => {
    const w = Math.floor((zone.width - 32) / 3);
    return `<div style="display:flex;gap:16px;height:100%">${cards.slice(0, 3).map((c) => `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px">
        ${c.artUrl ? `<img src="${e(c.artUrl)}" style="width:${w}px;flex:1;min-height:0;object-fit:contain;border-radius:12px" alt="">` : `<div style="width:${w}px;flex:1;border:1px dashed ${C.hair};border-radius:12px"></div>`}
        ${c.price != null ? `<div style="font-weight:800;color:${C.up};font-size:${Math.max(26, S.metric ? S.metric * 0.5 : 34)}px">${usd(c.price)}</div>` : ""}
        ${c.label ? `<div style="font-size:18px;color:${C.inkSub};text-align:center">${e(c.label)}</div>` : ""}
      </div>`).join("")}</div>`;
  },
};
P.price_pair = {
  factSlots: ["a", "b"],
  render: ({ a, b, aLabel = "Listed", bLabel = "Market" }, { C, S, zone, fit }) => {
    const fa = fit(usd(a), { boxW: zone.width * 0.5, minPx: 36, maxPx: 96, maxLines: 1, tracking: -0.03 });
    const fb = fit(usd(b), { boxW: zone.width * 0.5, minPx: 30, maxPx: 76, maxLines: 1, tracking: -0.02 });
    return `<div style="display:flex;gap:24px;align-items:flex-end;height:100%">
      <div>${label(aLabel, C, S, C.up)}<div style="font-weight:800;color:${C.up};font-size:${fa.px}px;letter-spacing:-0.03em">${usd(a)}</div></div>
      <div>${label(bLabel, C, S)}<div style="font-weight:800;color:${C.inkSub};text-decoration:line-through;font-size:${fb.px}px;letter-spacing:-0.02em">${usd(b)}</div></div>
    </div>`;
  },
};
P.market_range = {
  factSlots: ["min", "max"],
  render: ({ min, max, mid }, { C, S, zone }) => {
    const midPct = mid != null && max > min ? Math.max(4, Math.min(96, ((mid - min) / (max - min)) * 100)) : null;
    return `<div>${label("Recent sold range", C, S)}
      <div style="margin-top:12px;height:14px;border-radius:8px;background:${C.surfaceHi};position:relative">
        <div style="position:absolute;left:8%;right:8%;top:0;bottom:0;background:${C.up};opacity:.35;border-radius:8px"></div>
        ${midPct != null ? `<div style="position:absolute;left:${midPct}%;top:-6px;width:4px;height:26px;background:${C.ink};border-radius:2px"></div>` : ""}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;color:${C.inkSub};font-size:${Math.max(18, S.fine ?? 22)}px;font-variant-numeric:tabular-nums">${usd(min)}<span>${usd(max)}</span></div></div>`;
  },
};
P.price_gap_bar = {
  factSlots: ["listed", "market"],
  render: ({ listed, market, pct }, { C, S }) => {
    const paidPct = market > 0 ? Math.max(4, Math.min(100, (listed / market) * 100)) : 100;
    const belowPct = pct != null ? Math.round(Number(pct)) : Math.round(100 - paidPct);
    return `<div>${label(`${belowPct}% below market`, C, S, C.up)}
      <div style="margin-top:10px;height:20px;border-radius:10px;background:${C.surfaceHi};overflow:hidden">
        <div style="width:${paidPct}%;height:100%;background:${C.up}"></div></div>
      <div style="margin-top:8px;color:${C.inkSub};font-size:${Math.max(18, S.fine ?? 22)}px">${usd(listed)} paid &middot; ${usd(market)} market</div></div>`;
  },
};
P.distribution_bar = {
  factSlots: ["segments"],
  render: ({ segments = [] }, { C, S }) => `<div>
    <div style="display:flex;height:24px;border-radius:8px;overflow:hidden">${segments.map((s) => `<div style="width:${Math.max(0, Number(s.pct))}%;background:${s.color === "up" ? C.up : s.color === "brand" ? C.brand : C.surfaceHi}"></div>`).join("")}</div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;color:${C.inkFaint};font-size:${Math.max(16, S.fine ?? 22)}px">${segments.map((s) => `<span>${e(s.label ?? "")}</span>`).join("")}</div></div>`,
};
P.percentile_badge = { factSlots: ["value"], render: ({ value, label: l }, { C, S }) => badge(`${e(l ?? "percentile")} ${e(value)}`, C, S) };
P.rank_badge = { factSlots: ["value"], render: ({ value }, { C, S }) => badge(`#${e(value)}`, C, S, C.brand) };
P.difference_arrow = {
  factSlots: ["from", "to"],
  render: ({ from, to, note }, { C, S }) => `<div style="display:flex;align-items:center;gap:16px;height:100%">
    <span style="font-weight:800;color:${C.inkSub};font-size:${Math.max(28, S.metric ? S.metric * 0.5 : 40)}px">${e(from)}</span>
    <span style="color:${C.brand};font-size:${Math.max(28, S.metric ? S.metric * 0.55 : 44)}px">&rarr;</span>
    <span style="font-weight:800;color:${C.up};font-size:${Math.max(28, S.metric ? S.metric * 0.6 : 48)}px">${e(to)}</span>
    ${note ? `<span style="color:${C.inkFaint};font-size:${Math.max(16, S.fine ?? 22)}px">${e(note)}</span>` : ""}</div>`,
};
P.comparison_axis = {
  factSlots: ["left", "right"],
  render: ({ left, right, leftLabel = "A", rightLabel = "B" }, { C, S }) => `<div style="display:flex;justify-content:space-between;align-items:center;height:100%">
    <div style="text-align:left">${label(leftLabel, C, S)}<div style="font-weight:800;color:${C.ink};font-size:${Math.max(30, S.metric ? S.metric * 0.55 : 44)}px">${e(left)}</div></div>
    <div style="width:2px;height:60%;background:${C.hair}"></div>
    <div style="text-align:right">${label(rightLabel, C, S)}<div style="font-weight:800;color:${C.ink};font-size:${Math.max(30, S.metric ? S.metric * 0.55 : 44)}px">${e(right)}</div></div></div>`,
};
P.variant_badge = { factSlots: ["text"], render: ({ text }, { C, S }) => badge(e(text), C, S, C.brand) };
P.set_era_tag = { factSlots: ["text"], render: ({ text }, { C, S }) => badge(e(text), C, S) };
P.sample_size_badge = { factSlots: ["value"], render: ({ value, noun = "samples" }, { C, S }) => badge(`${e(value)} ${e(noun)}`, C, S) };
P.metric_strip = {
  factSlots: ["items"],
  render: ({ items = [] }, { C, S }) => `<div style="display:flex;gap:28px;height:100%;align-items:center">${items.slice(0, 4).map((it) => `
    <div>${label(it.label ?? "", C, S)}<div style="font-weight:800;color:${C.ink};font-size:${Math.max(24, S.metric ? S.metric * 0.42 : 30)}px;font-variant-numeric:tabular-nums">${e(it.value)}</div></div>`).join("")}</div>`,
};
P.mini_timeline = {
  factSlots: ["points"],
  render: ({ points = [] }, { C, S }) => `<div style="display:flex;align-items:center;gap:0;height:100%">${points.slice(0, 5).map((p, i) => `
    ${i ? `<div style="flex:1;height:2px;background:${C.hair}"></div>` : ""}
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
      <div style="width:12px;height:12px;border-radius:50%;background:${i === points.length - 1 ? C.brand : C.inkFaint}"></div>
      <div style="font-size:${Math.max(15, S.fine ? S.fine - 4 : 18)}px;color:${C.inkFaint};white-space:nowrap">${e(p)}</div></div>`).join("")}</div>`,
};
P.why_this_matters_box = {
  factSlots: ["text"],
  render: ({ text, title = "Why this matters" }, { C, S, zone, fit }) => {
    const f = fit(text, { boxW: zone.width - 48, boxH: zone.height - 60, minPx: 20, maxPx: 32, maxLines: 4, lineHeight: 1.35 });
    return `<div style="height:100%;border-left:3px solid ${C.brand};padding:14px 0 14px 24px;background:${C.surface};border-radius:0 14px 14px 0">
      ${label(title, C, S, C.brand)}
      <div style="margin-top:8px;color:${C.ink};font-size:${f.px}px;line-height:1.35">${f.lines.map(e).join("<br>")}</div></div>`;
  },
};
P.collector_tip = P.why_this_matters_box;
P.source_note = {
  factSlots: ["text"],
  render: ({ text }, { C, S }) => `<div style="color:${C.inkFaint};font-size:${Math.max(16, S.fine ?? 22)}px;line-height:1.3">${e(text)}</div>`,
};
P.cta = {
  factSlots: ["text"],
  render: ({ text }, { C, S, zone, fit }) => {
    const t = `${text} →`;
    const f = fit(t, { boxW: (zone?.width ?? 320) - 46, minPx: 20, maxPx: Math.max(22, S.cta ?? 34), maxLines: 1, tracking: -0.01 });
    return `<div style="display:flex;align-items:center;gap:12px;justify-content:flex-end;height:100%">
    <span style="width:34px;height:1px;background:${C.hair};flex:0 0 auto"></span>
    <span style="font-weight:800;letter-spacing:-0.01em;color:${C.ink};font-size:${f.px}px;white-space:nowrap">${e(text)} &rarr;</span></div>`;
  },
};
P.brand_mark = {
  factSlots: [],
  render: (_p, { C, S, zone, fit }) => {
    const f = fit("PokemonDealFinder", { boxW: (zone?.width ?? 220) - 4, minPx: 15, maxPx: Math.max(18, S.fine ?? 22), maxLines: 1, tracking: 0.02 });
    return `<div style="font-weight:800;letter-spacing:.02em;color:${C.inkSub};font-size:${f.px}px;white-space:nowrap;text-align:right">PokemonDealFinder</div>`;
  },
};
P.website_footer = {
  factSlots: [],
  render: (_p, { C, S }) => `<div style="display:flex;justify-content:space-between;color:${C.inkFaint};font-size:${Math.max(16, S.fine ?? 22)}px">
    <span>Market references, not listing prices.</span><span>pokemondealfinder.com</span></div>`,
};
P.small_icon = { factSlots: [], render: (_p, { C }) => `<div style="width:100%;height:100%;border:2px solid ${C.hair};border-radius:8px"></div>` };
P.separator_rule = { factSlots: [], render: (_p, { C }) => `<div style="width:100%;height:2px;background:${C.hair}"></div>` };
P.spotlight_panel = {
  factSlots: ["title"],
  render: ({ title, value, sub }, { C, S }) => `<div style="height:100%;background:${C.surface};border:1px solid ${C.hair};border-radius:16px;padding:24px;display:flex;flex-direction:column;justify-content:center">
    ${label(title, C, S, C.up)}
    ${value != null ? `<div style="font-weight:800;color:${C.ink};font-size:${Math.max(40, S.metric ? S.metric * 0.7 : 52)}px;letter-spacing:-0.03em">${e(value)}</div>` : ""}
    ${sub ? `<div style="margin-top:6px;color:${C.inkSub};font-size:${Math.max(18, S.body ? S.body * 0.7 : 22)}px">${e(sub)}</div>` : ""}</div>`,
};
P.data_card = P.spotlight_panel;
P.chart_panel = {
  factSlots: ["bars"],
  render: ({ bars = [], title }, { C, S }) => `<div style="height:100%;display:flex;flex-direction:column">
    ${title ? label(title, C, S) : ""}
    <div style="flex:1;display:flex;align-items:flex-end;gap:10px;margin-top:12px">${bars.slice(0, 8).map((b) => `<div style="flex:1;background:${b.accent ? C.brand : C.surfaceHi};height:${Math.max(6, Math.min(100, Number(b.pct)))}%;border-radius:4px 4px 0 0"></div>`).join("")}</div></div>`,
};

function badge(text, C, S, accent) {
  const t = String(text ?? "");
  const clipped = t.length > 42 ? t.slice(0, 40).trimEnd() + "…" : t;
  return `<span style="display:inline-block;max-width:100%;background:${accent ? accent : C.surfaceHi};color:${accent ? "#04150c" : C.ink};font-weight:700;font-size:${Math.max(15, (S.label ?? 22) - 2)}px;letter-spacing:.04em;border-radius:999px;padding:6px 16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${clipped}</span>`;
}

export const PRIMITIVES = new Map(Object.entries(P));

export function isPrimitive(name) {
  return PRIMITIVES.has(String(name || ""));
}

export function primitiveFactSlots(name) {
  return PRIMITIVES.get(String(name || ""))?.factSlots ?? null;
}

// Render one primitive; throws if a required factSlot is missing (the
// renderer catches -> COMPOSITION_REJECT).
export function renderPrimitive(name, props = {}, ctx = {}) {
  const prim = PRIMITIVES.get(String(name || ""));
  if (!prim) throw new Error(`renderPrimitive: unknown primitive "${name}"`);
  for (const slot of prim.factSlots) {
    if (props[slot] == null || (Array.isArray(props[slot]) && props[slot].length === 0)) {
      throw new Error(`primitive "${name}" is missing required real-data slot "${slot}"`);
    }
  }
  return prim.render(props, ctx);
}

export const PRIMITIVE_NAMES = Object.freeze([...PRIMITIVES.keys()]);
export const PRIMITIVES_VERSION = "4b1.1";

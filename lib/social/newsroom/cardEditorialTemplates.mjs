// Phase SOCIAL-CREATIVE-3 - CARD-FORWARD editorial layout families.
//
// Real canonical card artwork is a PRIMARY visual asset (SS4). Every
// family here places a large real card (or several) + real numbers, with
// an intentional density band structure (SS12): hero 40-60%, primary data
// large, secondary supporting, branding restrained. NO empty black
// fields, NO decorative AI texture, NO fake data.
//
// `cardArt` is a map { <tcgplayerId>: "file:///abs/path.jpg" } of
// already-resolved LOCAL canonical images (lib/social/cardArtwork). A
// missing entry -> the family falls back to a labelled silhouette box, and
// the collectible-appeal gate will WATCH it.
//
// Pure string building. Fonts embedded (FONT_FACE_CSS). Only file:// card
// images - no remote URL, no seller photo, no GenAI redraw.

import { TOKENS } from "../creativeSpec.mjs";
import { FONT_FACE_CSS } from "../fontData.mjs";

const C = TOKENS.color;
// TOKENS.type.* are objects ({size,weight,...}); flatten to scalar px / font
// strings so `${S.label}px` is real CSS, not `[object Object]px`.
const S = Object.fromEntries(
  Object.entries(TOKENS.type).map(([k, v]) => [k, v && typeof v === "object" ? v.size : v])
);

export const CARD_LAYOUTS = Object.freeze([
  "deal_hero",
  "bid_vs_total",
  "asking_vs_sold",
  "printing_compare",
  "market_shape",
  "three_up",
  "movers_countdown",
]);

export const CARD_TARGETS = Object.freeze({
  ig_45: { w: 1080, h: 1350, pad: 76, ratio: "4:5" },
  x_16x9: { w: 1200, h: 675, pad: 64, ratio: "16:9" },
  short_916: { w: 1080, h: 1920, pad: 96, ratio: "9:16" },
});

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usd = (n) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`;

function shell({ target, inner, bg = C.bg }) {
  const t = CARD_TARGETS[target] ?? CARD_TARGETS.ig_45;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${t.w}px;height:${t.h}px;background:${bg};color:${C.ink};font-family:${S.family};-webkit-font-smoothing:antialiased;overflow:hidden}
.frame{position:absolute;inset:${t.pad}px;display:flex;flex-direction:column}
.eyebrow{font-size:${S.label}px;letter-spacing:.16em;text-transform:uppercase;color:${C.inkFaint};font-weight:700}
.wm{font-size:${S.fine}px;letter-spacing:.02em;color:${C.inkFaint};font-weight:700}
.mono{font-family:${S.mono};font-variant-numeric:tabular-nums}
.card{border-radius:16px;background:${C.surface};border:1px solid ${C.hair};object-fit:contain;display:block}
.bignum{font-weight:800;letter-spacing:-0.03em;line-height:.95;font-variant-numeric:tabular-nums}
.eqnum{font-family:${S.mono};font-weight:800;letter-spacing:-0.02em;line-height:.92;font-variant-numeric:tabular-nums}
.cardbox{border-radius:16px;background:${C.surface};border:1px dashed ${C.hair};display:flex;align-items:center;justify-content:center;color:${C.inkFaint};font-size:${S.fine}px;text-align:center;padding:20px}
.spring{flex:1 1 auto}
</style></head><body><div class="frame">${inner}</div></body></html>`;
}

function cardImg(cardArt, id, style) {
  const src = cardArt?.[String(id)];
  return src
    ? `<img class="card" src="${esc(src)}" style="${style}" alt="">`
    : `<div class="cardbox" style="${style}">canonical art<br>unavailable</div>`;
}

// One restrained call-to-action, styled as a label not a tappable button
// (SS on static images). Sits on the bottom row.
function ctaPill(text) {
  return `<div style="display:flex;justify-content:flex-end;align-items:center;gap:12px">
    <span style="width:34px;height:1px;background:${C.hair}"></span>
    <span style="font-size:${S.cta}px;font-weight:800;letter-spacing:-0.01em;color:${C.ink}">${esc(text)} &rarr;</span>
  </div>`;
}

// --- 1. deal_hero - large card + ONE unmistakable listed-vs-market
// contrast + ONE saving callout (the QUALITY FLOOR). SOCIAL-CREATIVE-3B:
// the hook no longer restates the % (that was a duplicated price fact);
// the market reference is now large and legible, not a tiny strike-through
// footnote; the saving chip is the single derived callout.
export function dealHero({ target = "ig_45", cardArt = {}, card = {}, priceUsd, marketUsd, discountPct } = {}) {
  const savedPct = discountPct ?? Math.round((1 - Number(priceUsd) / Number(marketUsd)) * 100);
  const sh = target === "short_916";
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="eyebrow">Deal drop &middot; live now</div><div class="wm">PokemonDealFinder</div>
    </div>
    <div style="display:flex;gap:44px;align-items:center;flex:1;margin-top:20px">
      ${cardImg(cardArt, card.tcgplayerId, `height:${sh ? 1040 : 820}px;width:auto;flex:0 0 auto`)}
      <div style="flex:1;display:flex;flex-direction:column;gap:${sh ? 8 : 6}px">
        <div style="font-size:${sh ? 44 : 38}px;font-weight:800;line-height:1.06;letter-spacing:-0.02em">${esc(card.name)}</div>
        <div style="font-size:${S.fine}px;color:${C.inkSub};margin-bottom:${sh ? 26 : 22}px">${esc(card.set ?? "")}</div>

        <div class="eyebrow" style="color:${C.inkFaint}">Recent market</div>
        <div class="bignum" style="font-size:${sh ? 78 : 64}px;color:${C.inkSub};text-decoration:line-through;margin-bottom:${sh ? 20 : 16}px">${usd(marketUsd)}</div>

        <div class="eyebrow" style="color:${C.up}">Deal price</div>
        <div class="bignum" style="font-size:${sh ? 172 : 148}px;color:${C.up}">${usd(priceUsd)}</div>

        <div style="margin-top:${sh ? 24 : 20}px;align-self:flex-start;background:${C.up};color:#04150c;font-weight:800;font-size:${sh ? 52 : 44}px;letter-spacing:-0.01em;border-radius:12px;padding:10px 24px">${savedPct}% below market</div>
      </div>
    </div>
    ${ctaPill("View on eBay")}
  ` });
}

// --- 2. bid_vs_total - large real card + a literal vertical equation:
// CURRENT BID + SHIPPING = YOU PAY, with the total as the single biggest
// element. SOCIAL-CREATIVE-3B: real "+" and "=" operators, a rule line
// instead of a decorative box, one non-numeric hook so the numbers only
// appear once (in the equation).
export function bidVsTotal({ target = "ig_45", cardArt = {}, card = {}, bidUsd, shippingUsd, landedUsd, marketRefUsd } = {}) {
  const sh = target === "short_916";
  const opRow = (op, label, val, opts = {}) => {
    const big = opts.big === true;
    const col = opts.col ?? C.inkSub;
    return `<div style="display:flex;align-items:baseline;gap:${sh ? 24 : 20}px">
      <span class="eqnum" style="font-size:${big ? (sh ? 84 : 72) : (sh ? 54 : 46)}px;font-weight:700;color:${big ? C.brand : C.inkFaint};width:${sh ? 48 : 40}px;flex:0 0 auto;text-align:center">${op}</span>
      <div style="flex:1">
        <div class="eyebrow" style="color:${big ? C.ink : C.inkFaint};letter-spacing:.09em">${esc(label)}</div>
        <div class="eqnum" style="font-size:${big ? (sh ? 148 : 128) : (sh ? 64 : 56)}px;color:${col}">${usd(val)}</div>
      </div>
    </div>`;
  };
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="eyebrow">Auction math</div><div class="wm">PokemonDealFinder</div>
    </div>
    <h1 style="font-size:${sh ? 84 : 70}px;font-weight:800;line-height:1;letter-spacing:-0.03em;margin-top:14px;max-width:12ch">The bid isn't the price.</h1>
    <div style="display:flex;gap:${sh ? 44 : 40}px;align-items:center;flex:1;margin-top:${sh ? 24 : 16}px">
      ${cardImg(cardArt, card.tcgplayerId, `height:${sh ? 960 : 680}px;width:auto;flex:0 0 auto`)}
      <div style="flex:1;display:flex;flex-direction:column;gap:${sh ? 18 : 12}px">
        ${opRow("&nbsp;", "Current bid", bidUsd, { col: C.ink })}
        ${opRow("+", "Shipping", shippingUsd)}
        <div style="height:3px;background:${C.hair};margin:${sh ? 8 : 4}px 0 ${sh ? 2 : 0}px"></div>
        ${opRow("=", "You pay", landedUsd, { big: true, col: C.brand })}
        ${marketRefUsd ? `<div class="eqnum" style="font-size:${S.fine + 2}px;font-weight:600;color:${C.inkFaint};margin-top:${sh ? 8 : 4}px;margin-left:${sh ? 72 : 60}px">market reference ${usd(marketRefUsd)}</div>` : ""}
      </div>
    </div>
    <div style="font-size:${S.fine + 2}px;color:${C.inkSub}">${esc(card.name)}${card.set ? ` &middot; ${esc(card.set)}` : ""} &nbsp;&mdash;&nbsp; we reprice every auction on the landed total.</div>
  ` });
}

// --- 3. asking_vs_sold - card + ASKING vs recent SOLD refs ----------
export function askingVsSold({ target = "ig_45", cardArt = {}, card = {}, askingUsd, soldPoints = [], marketRefUsd } = {}) {
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="eyebrow">Why sold prices matter</div><div class="wm">PokemonDealFinder</div>
    </div>
    <h1 style="font-size:${target === "short_916" ? 64 : 50}px;font-weight:800;line-height:1.08;margin-top:14px;max-width:18ch">Asking price is not market value.</h1>
    <div style="display:flex;gap:40px;align-items:center;flex:1;margin-top:18px">
      ${cardImg(cardArt, card.tcgplayerId, `height:${target === "short_916" ? 860 : 600}px;width:auto;flex:0 0 auto`)}
      <div style="flex:1;display:flex;flex-direction:column;gap:26px">
        <div>
          <div class="eyebrow" style="color:${C.inkFaint}">A listing asks</div>
          <div class="mono" style="font-size:${target === "short_916" ? 120 : 100}px;font-weight:800;line-height:.9;color:${C.inkSub}">${usd(marketRefUsd ? Math.round(marketRefUsd * 1.35) : askingUsd * 2)}</div>
        </div>
        <div>
          <div class="eyebrow" style="color:${C.up}">Recent sold</div>
          <div class="mono" style="font-size:${target === "short_916" ? 84 : 68}px;font-weight:800;color:${C.up};line-height:1">${soldPoints.map((p) => usd(p)).join("  ")}</div>
        </div>
        <div style="font-size:${S.fine + 4}px;color:${C.inkSub};line-height:1.35;max-width:24ch">We reference what cards actually sell for &mdash; not the highest ask.</div>
      </div>
    </div>
    <div style="font-size:${S.fine}px;color:${C.inkFaint}">${esc(card.name)} &middot; ${esc(card.set ?? "")}</div>
  ` });
}

// --- 4. printing_compare - two real printings, real prices ----------
export function printingCompare({ target = "ig_45", cardArt = {}, species, high = {}, low = {}, multiple } = {}) {
  const col = (c, accent) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:14px">
      ${cardImg(cardArt, c.tcgplayerId, `height:${target === "short_916" ? 760 : 520}px;width:auto;border-top:4px solid ${accent}`)}
      <div style="font-size:${S.fine + 2}px;color:${C.inkSub};text-align:center;max-width:18ch">${esc(c.set)}${c.number ? ` &middot; ${esc(c.number)}` : ""}</div>
      <div class="mono" style="font-size:${target === "short_916" ? 78 : 64}px;font-weight:800;color:${accent}">${usd(c.price_usd)}</div>
    </div>`;
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="eyebrow">Exact printing matters</div><div class="wm">PokemonDealFinder</div>
    </div>
    <h1 style="font-size:${target === "short_916" ? 60 : 48}px;font-weight:800;line-height:1.1;margin-top:14px;text-transform:capitalize">Same ${esc(species)}. Different printing. Different value.</h1>
    <div style="display:flex;gap:40px;align-items:flex-start;flex:1;margin-top:24px">
      ${col(high, C.brand)}
      <div style="display:flex;align-items:center;padding-top:200px"><div class="mono" style="font-size:${S.metric}px;font-weight:800;color:${C.inkFaint}">${multiple}&times;</div></div>
      ${col(low, C.inkFaint)}
    </div>
    <div style="font-size:${S.fine}px;color:${C.inkFaint}">Market references. A name match is not a printing match.</div>
  ` });
}

// --- 5. market_shape - big stat + distribution bar + featured card --
export function marketShape({ target = "ig_45", cardArt = {}, pricedCards, under25Pct, over100Pct, featured = null } = {}) {
  const midPct = Math.max(0, 100 - Number(under25Pct) - Number(over100Pct));
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="eyebrow">Pokemon market &mdash; this week</div><div class="wm">PokemonDealFinder</div>
    </div>
    <h1 style="font-size:${target === "short_916" ? 62 : 50}px;font-weight:800;line-height:1.05;margin-top:14px;max-width:17ch">Most Pokemon cards cost less than people think.</h1>
    <div style="display:flex;align-items:baseline;gap:16px;margin-top:18px">
      <div class="mono" style="font-size:${target === "short_916" ? 128 : 112}px;font-weight:800;line-height:.85;color:${C.up}">${under25Pct}%</div>
      <div style="font-size:${S.body}px;color:${C.inkSub};max-width:12ch">of ${Number(pricedCards).toLocaleString("en-US")} tracked singles sell under $25</div>
    </div>
    <div style="margin-top:24px">
      <div style="display:flex;height:52px;border-radius:12px;overflow:hidden;border:1px solid ${C.hair}">
        <div style="width:${under25Pct}%;background:${C.up}"></div>
        <div style="width:${midPct}%;background:${C.surfaceHi}"></div>
        <div style="width:${over100Pct}%;background:${C.brand}"></div>
      </div>
      <div class="mono" style="display:flex;justify-content:space-between;font-size:${S.label}px;color:${C.inkFaint};margin-top:10px">
        <span>under $25</span><span>$25&ndash;100</span><span>${over100Pct}% over $100</span>
      </div>
    </div>
    <div style="flex:1 1 auto;min-height:20px"></div>
    ${featured
      ? `<div style="display:flex;gap:30px;align-items:center;background:${C.surface};border:1px solid ${C.hair};border-radius:16px;padding:24px">
          ${cardImg(cardArt, featured.tcgplayerId, `height:${target === "short_916" ? 380 : 300}px;width:auto;flex:0 0 auto`)}
          <div style="flex:1">
            <div class="eyebrow" style="color:${C.up}">Standout deal right now</div>
            <div style="font-size:${S.title}px;font-weight:800;margin-top:8px;line-height:1.05">${esc(featured.card_name)}</div>
            <div class="mono" style="font-size:${S.metric}px;font-weight:800;color:${C.up};margin-top:8px">${usd(featured.asking_usd)} <span style="color:${C.inkFaint};font-size:.5em;text-decoration:line-through">${usd(featured.market_ref_usd)}</span></div>
          </div>
        </div>`
      : `<div style="border-top:1px solid ${C.hair};padding-top:22px;font-size:${S.fine}px;color:${C.inkFaint}">Market references via PokemonPriceTracker &middot; catalogue snapshot</div>`}
  ` });
}

// --- 6. three_up - "three real deals under $CAP": three strong canonical
// cards, one readable price each, a per-card saving badge, market ref
// secondary. SOCIAL-CREATIVE-3C: sans price numbers with -0.03em tracking,
// bolder card names, a green saving pill per card, minimal branding.
export function threeUp({ target = "ig_45", cardArt = {}, cap, items = [] } = {}) {
  const sh = target === "short_916";
  const shown = items.slice(0, 3);
  const maxOff = Math.max(...shown.map((i) => Number(i.discount_pct) || 0));
  const cell = (it) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:${sh ? 16 : 12}px">
      ${cardImg(cardArt, it.tcgplayerId, `height:${sh ? 680 : 480}px;width:auto;border-bottom:4px solid ${C.up}`)}
      <div style="font-size:${sh ? 28 : 24}px;font-weight:700;letter-spacing:-0.01em;color:${C.ink};text-align:center;max-width:15ch;line-height:1.2">${esc(it.card_name)}</div>
      <div class="bignum" style="font-size:${sh ? 84 : 70}px;color:${C.up}">${usd(it.price_usd)}</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="background:${C.up};color:#04150c;font-weight:800;font-size:${S.fine}px;border-radius:8px;padding:3px 12px">&minus;${it.discount_pct}%</span>
        <span class="mono" style="font-size:${S.fine}px;color:${C.inkFaint};text-decoration:line-through">${usd(it.market_usd)}</span>
      </div>
    </div>`;
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="eyebrow">Three under $${cap}</div><div class="wm">PokemonDealFinder</div>
    </div>
    <h1 style="font-size:${sh ? 72 : 58}px;font-weight:800;line-height:1.02;letter-spacing:-0.02em;margin-top:12px">What $${cap} buys right now</h1>
    <div style="font-size:${S.body}px;color:${C.inkSub};margin-top:8px">3 live deals &middot; up to ${maxOff}% below market reference</div>
    <div style="display:flex;gap:${sh ? 36 : 30}px;align-items:flex-start;flex:1;margin-top:${sh ? 30 : 24}px">${shown.map(cell).join("")}</div>
    ${ctaPill("Live on eBay")}
  ` });
}

// --- 7. movers_countdown - N real printings, real confident from -> to move
export function moversCountdown({ target = "ig_45", cardArt = {}, movers = [], windowLabel } = {}) {
  const shown = movers.slice(0, 3);
  const cell = (m) => {
    const up = String(m.direction) === "up" || Number(m.pct) > 0;
    const col = up ? C.up : C.brand;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:14px">
      ${cardImg(cardArt, m.tcgplayerId, `height:${target === "short_916" ? 620 : 430}px;width:auto;border-bottom:4px solid ${col}`)}
      <div style="font-size:${S.fine}px;color:${C.inkSub};text-align:center;max-width:16ch;line-height:1.25">${esc(m.name ?? "")}</div>
      <div class="mono" style="font-size:${target === "short_916" ? 72 : 60}px;font-weight:800;color:${col};line-height:1">${up ? "+" : ""}${m.pct}%</div>
      <div class="mono" style="font-size:${S.fine}px;color:${C.inkFaint}">${usd(m.from_usd)} &rarr; ${usd(m.to_usd)}</div>
    </div>`;
  };
  return shell({ target, inner: `
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="eyebrow">Price movers${windowLabel ? ` &mdash; ${esc(windowLabel)}` : ""}</div><div class="wm">PokemonDealFinder</div>
    </div>
    <h1 style="font-size:${target === "short_916" ? 66 : 54}px;font-weight:800;line-height:1.04;margin-top:12px;max-width:16ch">What actually moved this week</h1>
    <div style="font-size:${S.body}px;color:${C.inkSub};margin-top:8px">Confident moves only &middot; merged sold-price history</div>
    <div style="display:flex;gap:32px;align-items:flex-start;flex:1;margin-top:26px">${shown.map(cell).join("")}</div>
    <div style="font-size:${S.fine}px;color:${C.inkFaint}">Observations, not advice. Windows shown where a trend clears our confidence gate.</div>
  ` });
}

const DISPATCH = { deal_hero: dealHero, bid_vs_total: bidVsTotal, asking_vs_sold: askingVsSold, printing_compare: printingCompare, market_shape: marketShape, three_up: threeUp, movers_countdown: moversCountdown };

export function renderCardEditorialHtml(layout, props = {}) {
  const fn = DISPATCH[layout];
  if (!fn) throw new Error(`unknown card-forward layout: ${layout}`);
  const html = fn(props);
  // SOCIAL-CREATIVE-4B - HYBRID_BACKGROUND: an AI-generated, safety-scanned
  // DECORATIVE background sits behind the deterministic frame. It carries
  // NO facts. Absent -> byte-identical to before. Only an inline data:
  // image is accepted (the compositor guarantees this).
  const bg = props.backgroundDataUrl;
  if (!bg || !/^data:image\//.test(String(bg))) return html;
  const bgLayer =
    `<div style="position:absolute;inset:0;z-index:0;background:${C.bg} url('${String(bg).replace(/'/g, "%27")}') center/cover no-repeat"></div>` +
    `<div style="position:absolute;inset:0;z-index:0;background:linear-gradient(180deg,rgba(11,11,13,.60),rgba(11,11,13,.40) 42%,rgba(11,11,13,.74))"></div>`;
  return html
    .replace("</head>", "<style>.frame{z-index:1}</style></head>")
    .replace('<body><div class="frame">', `<body>${bgLayer}<div class="frame">`);
}

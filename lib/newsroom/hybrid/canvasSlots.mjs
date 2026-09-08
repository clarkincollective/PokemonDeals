// Phase SOCIAL-CREATIVE-4B.2 - FACTUAL SAFE-ZONE SPEC (§4) for the
// GENERATIVE DESIGN CANVAS.
//
// The gpt-image-2 model designs the WHOLE non-factual visual around a set
// of RESERVED CONCEPTUAL REGIONS. Those regions are fixed rectangles on
// the 1080x1350 canvas: the image model is told to keep them calm and
// integrate its design around them, and the deterministic compositor
// (canvasCompositor.mjs) then overlays the real card art + exact facts
// into those exact rects. The image model never gets a value and never
// fills a slot.
//
// Pure data.

export const CANVAS_W = 1080;
export const CANVAS_H = 1350;

// The semantic slot vocabulary (§4).
export const CANVAS_SLOTS = Object.freeze([
  "HERO_CARD_SLOT",
  "SECONDARY_CARD_SLOT",
  "CARD_TRIPTYCH_SLOT",
  "HEADLINE_SLOT",
  "HERO_STAT_SLOT",
  "SUPPORTING_STAT_SLOT",
  "CHART_SLOT",
  "COMPARISON_SLOT",
  "WHY_THIS_MATTERS_SLOT",
  "CTA_SLOT",
  "BRAND_SLOT",
  "FOOTER_SLOT",
]);

const R = (x, y, w, h) => Object.freeze({ x, y, w, h });

// Per card-forward layout family: which slots exist and where. These are
// the reserved regions - the image model designs a rich composition
// AROUND and integrating them; the compositor targets them exactly.
export const SLOT_LAYOUTS = Object.freeze({
  deal_hero: {
    BRAND_SLOT: R(760, 56, 264, 44),
    HEADLINE_SLOT: R(600, 150, 424, 220),
    HERO_CARD_SLOT: R(72, 150, 468, 1010),
    HERO_STAT_SLOT: R(600, 400, 424, 240),
    SUPPORTING_STAT_SLOT: R(600, 660, 424, 200),
    CHART_SLOT: R(600, 880, 424, 120),
    WHY_THIS_MATTERS_SLOT: R(72, 1180, 700, 118),
    CTA_SLOT: R(792, 1200, 216, 70),
    FOOTER_SLOT: R(72, 1300, 936, 34),
  },
  market_shape: {
    BRAND_SLOT: R(800, 56, 224, 44),
    HEADLINE_SLOT: R(72, 120, 720, 230),
    HERO_STAT_SLOT: R(72, 360, 660, 260),
    CHART_SLOT: R(72, 640, 936, 150),
    SUPPORTING_STAT_SLOT: R(72, 810, 620, 120),
    SECONDARY_CARD_SLOT: R(720, 800, 300, 320),
    WHY_THIS_MATTERS_SLOT: R(72, 1150, 936, 120),
    FOOTER_SLOT: R(72, 1300, 936, 34),
  },
  asking_vs_sold: {
    BRAND_SLOT: R(800, 56, 224, 44),
    HEADLINE_SLOT: R(72, 120, 936, 160),
    HERO_CARD_SLOT: R(72, 320, 440, 760),
    COMPARISON_SLOT: R(560, 320, 448, 300),
    CHART_SLOT: R(560, 640, 448, 150),
    HERO_STAT_SLOT: R(560, 820, 448, 200),
    WHY_THIS_MATTERS_SLOT: R(72, 1120, 936, 150),
    FOOTER_SLOT: R(72, 1300, 936, 34),
  },
  printing_compare: {
    BRAND_SLOT: R(800, 56, 224, 44),
    HEADLINE_SLOT: R(72, 120, 936, 180),
    CARD_TRIPTYCH_SLOT: R(72, 320, 936, 620),
    COMPARISON_SLOT: R(72, 960, 640, 110),
    HERO_STAT_SLOT: R(740, 950, 268, 130),
    WHY_THIS_MATTERS_SLOT: R(72, 1100, 936, 150),
    FOOTER_SLOT: R(72, 1300, 936, 34),
  },
  three_up: {
    BRAND_SLOT: R(800, 56, 224, 44),
    HEADLINE_SLOT: R(72, 120, 936, 150),
    CARD_TRIPTYCH_SLOT: R(72, 300, 936, 660),
    SUPPORTING_STAT_SLOT: R(72, 990, 936, 120),
    HERO_STAT_SLOT: R(72, 1130, 420, 130),
    WHY_THIS_MATTERS_SLOT: R(520, 1120, 488, 150),
    FOOTER_SLOT: R(72, 1300, 936, 34),
  },
});

export function slotLayoutFor(layout) {
  return SLOT_LAYOUTS[String(layout || "")] ?? null;
}

// Turn a slot layout into the prompt clause the image model receives
// (§4). Rects are described as fractional bands so the model reasons
// about them spatially without being handed a value.
export function reservedRegionsClause(layout) {
  const slots = SLOT_LAYOUTS[layout];
  if (!slots) return "";
  const band = (r) => {
    const cx = (r.x + r.w / 2) / CANVAS_W;
    const cy = (r.y + r.h / 2) / CANVAS_H;
    const h = r.y < CANVAS_H * 0.28 ? "upper" : r.y > CANVAS_H * 0.72 ? "lower" : "middle";
    const v = cx < 0.38 ? "left" : cx > 0.62 ? "right" : "centre";
    return `${h}-${v}`;
  };
  const human = {
    HERO_CARD_SLOT: "a large empty vertical panel for one real trading card (composited later - leave it EMPTY, no card, no rectangle-as-card, just a calm framed void)",
    SECONDARY_CARD_SLOT: "a smaller empty framed panel for one real card image",
    CARD_TRIPTYCH_SLOT: "a wide empty area for two or three real card images side by side (empty framed voids only)",
    HEADLINE_SLOT: "a calm area for a bold white headline (no text - just the treatment / underline / bar it will sit on)",
    HERO_STAT_SLOT: "a prominent area for ONE very large number (no digits - just the framing / emphasis treatment)",
    SUPPORTING_STAT_SLOT: "a strip for 2-4 small supporting figures with labels (no text)",
    CHART_SLOT: "a horizontal data-visualisation container - a clean empty bar / track / plot frame with NO values or numbers on it",
    COMPARISON_SLOT: "a comparison structure - two blocks with a connector / arrow between them (no text, no numbers)",
    WHY_THIS_MATTERS_SLOT: "an editorial 'why this matters' context panel - a subtle box with an accent edge (no text)",
    CTA_SLOT: "a small restrained call-to-action area, bottom",
    BRAND_SLOT: "a small brand wordmark area, top",
    FOOTER_SLOT: "a thin footer strip",
  };
  return (
    "RESERVED REGIONS - design a rich, finished composition that FRAMES and INTEGRATES these, " +
    "but keep each one calm and low-detail so bright text / a real card image / real data can be composited over it later. " +
    "Do NOT put any text, number, card, or character inside any reserved region:\n" +
    Object.entries(slots).map(([name, r]) => `- ${name} (${band(r)} of frame): ${human[name] ?? "a reserved area"}`).join("\n")
  );
}

export const CANVAS_SLOTS_VERSION = "4b2.1";

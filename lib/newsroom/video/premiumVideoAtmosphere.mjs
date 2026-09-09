// Phase SOCIAL-CREATIVE-4C.5 - PREMIUM VIDEO ATMOSPHERE (§6, §7).
//
// Black stays the brand canvas, but EMPTY black reads as unfinished. Every
// major composition gets a subtle, INTENTIONAL atmospheric treatment,
// rendered locally with CSS only (no API):
//   * dark charcoal base + faint depth gradient
//   * one or two low-opacity red accent glows
//   * a soft radial spotlight behind the hero card / stat
//   * a restrained vignette
//   * very fine grain (SVG fractal noise, data: URI)
//   * an optional barely-there drifting dust layer (on the shared paused
//     timeline so the renderer seeks it deterministically)
//
// ONE system, used by every video family and by the CTA end screen, so the
// brand feels consistent. Restraint is the rule - none of these effects
// should be individually noticeable.

export const PREMIUM_VIDEO_ATMOSPHERE_VERSION = "4c5.1";

// a tiny tile of fractal noise -> repeated as fine grain (kept small so
// the document stays light). Deterministic, no network.
const GRAIN_SVG =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="140" height="140" filter="url(#n)" opacity="0.5"/></svg>`,
  ).toString("base64");

/**
 * buildAtmosphere({ variant, W, H, spotlights, accent, grain, dust, durationMs })
 *
 * variant: "story" | "cta"
 * spotlights: [{ xPct, yPct, radiusPct, kind:"light"|"red" }]  - soft radial
 *   pools placed behind hero content (defaults chosen per variant)
 *
 * -> { css, html, className, version }   (a self-contained background layer;
 *      the caller drops `html` as the first child of the scene and includes
 *      `css` in the document <style>. All animation is play-state:paused.)
 */
export function buildAtmosphere({
  variant = "story",
  W = 1080,
  H = 1920,
  spotlights = null,
  accent = "#e8493d",
  grain = true,
  dust = true,
  bright = false,      // 4C.6 §17/§24 - the CTA must be the BRIGHTEST moment
  durationMs = 9000,
} = {}) {
  const cls = variant === "cta" ? "atmo atmo-cta" : "atmo atmo-story";
  const pools = spotlights ?? (variant === "cta"
    ? (bright
        ? [
            { xPct: 50, yPct: 50, radiusPct: 72, kind: "red" },
            { xPct: 50, yPct: 44, radiusPct: 46, kind: "light" },
            { xPct: 50, yPct: 26, radiusPct: 34, kind: "light" },
          ]
        : [
            { xPct: 50, yPct: 52, radiusPct: 62, kind: "red" },
            { xPct: 50, yPct: 30, radiusPct: 40, kind: "light" },
          ])
    : [
        { xPct: 38, yPct: 44, radiusPct: 52, kind: "light" },
        { xPct: 78, yPct: 66, radiusPct: 34, kind: "red" },
      ]);

  const poolHtml = pools
    .map((p, i) => `<span class="pool p${i}"></span>`)
    .join("");
  const redA = bright ? 0.34 : 0.20;
  const litA = bright ? 0.18 : 0.09;
  const poolCss = pools
    .map((p, i) => {
      const color = p.kind === "red"
        ? `radial-gradient(circle at center, ${hexA(accent, redA)} 0%, ${hexA(accent, redA * 0.28)} 42%, transparent 72%)`
        : `radial-gradient(circle at center, rgba(255,255,255,${litA}) 0%, rgba(255,255,255,${(litA * 0.35).toFixed(3)}) 45%, transparent 74%)`;
      const d = Math.round((p.radiusPct / 100) * W * 2);
      return `.${cls.split(" ")[1]} .p${i}{left:${p.xPct}%;top:${p.yPct}%;width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px;background:${color}}`;
    })
    .join("\n");

  const dustHtml = dust ? `<span class="dust"></span>` : "";
  const grainHtml = grain ? `<span class="grain"></span>` : "";

  const html = `<div class="${cls}">${poolHtml}${grainHtml}${dustHtml}</div>`;

  const base = variant === "cta"
    ? (bright
        ? `radial-gradient(135% 95% at 50% 42%, #33333c 0%, #191920 46%, #0c0c0f 76%)`
        : `radial-gradient(125% 85% at 50% 34%, #1b1b21 0%, #0a0a0c 62%)`)
    : `radial-gradient(120% 78% at 50% 30%, #17171c 0%, #0b0b0d 60%)`;
  const vignette = bright
    ? `inset 0 0 220px 70px rgba(0,0,0,0.42), inset 0 0 80px rgba(0,0,0,0.3)`
    : `inset 0 0 260px 90px rgba(0,0,0,0.55), inset 0 0 90px rgba(0,0,0,0.4)`;

  const css = `
  .atmo{position:absolute;inset:0;overflow:hidden;background:${base};pointer-events:none;z-index:0}
  .atmo::after{content:"";position:absolute;inset:0;box-shadow:${vignette}}
  .atmo .pool{position:absolute;border-radius:50%;filter:blur(14px);mix-blend-mode:screen}
  ${poolCss}
  .atmo .grain{position:absolute;inset:-20px;background-image:url('${GRAIN_SVG}');background-size:280px 280px;
    opacity:0.05;mix-blend-mode:overlay}
  .atmo .dust{position:absolute;inset:0;opacity:0.5;
    background-image:
      radial-gradient(1.4px 1.4px at 18% 30%, rgba(255,255,255,0.5), transparent 60%),
      radial-gradient(1.2px 1.2px at 62% 18%, rgba(255,255,255,0.35), transparent 60%),
      radial-gradient(1.6px 1.6px at 80% 62%, rgba(255,255,255,0.30), transparent 60%),
      radial-gradient(1.1px 1.1px at 40% 78%, rgba(255,255,255,0.28), transparent 60%),
      radial-gradient(1.3px 1.3px at 30% 55%, rgba(255,255,255,0.22), transparent 60%);
    animation-name:atmodust;will-change:transform}
  @keyframes atmodust{0%{transform:translate3d(0,0,0)}50%{transform:translate3d(-10px,-14px,0)}100%{transform:translate3d(0,0,0)}}
  `;

  return Object.freeze({ css, html, className: cls, version: PREMIUM_VIDEO_ATMOSPHERE_VERSION, variant, spotlights: pools, grain, dust, bright });
}

// #rrggbb + alpha -> rgba()
function hexA(hex, a) {
  const h = String(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// A structural check the QA layer can call: does this scene declare an
// atmosphere layer at all? (An undecorated flat-black stage is a
// DEAD_BLACK_SPACE_FAIL risk regardless of content density.)
export function hasAtmosphere(sceneMeta = {}) {
  return Boolean(sceneMeta && sceneMeta.atmosphere && sceneMeta.atmosphere.className);
}

// Phase 13E.2.1 - VERSION D architecture: the BRAND AD format.
//
//   Layer 1  OpenAI background (or the deterministic Mode-B ground)
//   Layer 2  a REAL screenshot of pokemondealfinder.com, inside a
//            deterministic device/browser frame drawn in CSS/SVG
//   Layer 3  deterministic branding + copy
//
// OpenAI NEVER generates the site UI - that is why the screenshot is a
// real capture of the live site: it structurally rules out fake
// listings, fake prices, fake cards, and a fake interface.
//
// This module is ARCHITECTURE + a resolver. It performs NO OpenAI call
// and, in the standard `social:daily` run, NO live capture - it only
// wires a screenshot that already exists on disk into the renderer. A
// capture step (using the existing local Chrome in lib/social/render.mjs)
// is available but must be invoked deliberately; it is never part of the
// daily loop.

import { existsSync, statSync } from "node:fs";
import path from "node:path";

export const BRAND_AD_SCREENSHOT_SOURCE = Object.freeze({
  // The real site. A screenshot MUST come from here (or a same-origin
  // route) - never a mock, never a generated UI.
  origin: "https://pokemondealfinder.com",
  allowedRoutes: ["/", "/deals", "/best-finds", "/market-data"],
  // where a captured screenshot is cached (gitignored, like every other
  // .social-preview artifact)
  cacheDir: path.join(".social-preview", "brand-ad"),
  frame: "browser", // "browser" | "phone" - deterministic CSS/SVG chrome, not generated
});

export const BRAND_AD_SPEC = Object.freeze({
  version: "D",
  layers: ["openai_or_modeb_background", "real_site_screenshot_in_deterministic_frame", "deterministic_brand_copy"],
  openai_generates: "background environment only - NEVER the site UI, a phone, listings, prices, cards, or text",
  screenshot_rule: "must be a real capture of BRAND_AD_SCREENSHOT_SOURCE.origin; a missing screenshot fails closed (D is simply not offered)",
  copy: ["headline (deterministic)", "one-line value proposition", "PokemonDealFinder wordmark", "Ad disclosure"],
});

// Resolve a screenshot for Version D. Never captures here - it only
// checks whether a real screenshot is available on disk.
//   { status: "ready", screenshotPath, route, frame }
//   { status: "unavailable", reason }   -> D is not offered (fail closed)
export function resolveBrandScreenshot({ route = "/", cwd = process.cwd(), screenshotPath = null } = {}) {
  if (!BRAND_AD_SCREENSHOT_SOURCE.allowedRoutes.includes(route)) {
    return { status: "unavailable", reason: `route ${route} is not an allowed brand-ad route` };
  }
  const candidate =
    screenshotPath ??
    path.join(cwd, BRAND_AD_SCREENSHOT_SOURCE.cacheDir, `${route === "/" ? "home" : route.replace(/\W+/g, "-").replace(/^-|-$/g, "")}.png`);
  const abs = path.isAbsolute(candidate) ? candidate : path.join(cwd, candidate);
  if (!existsSync(abs)) {
    return { status: "unavailable", reason: `no real screenshot cached at ${path.relative(cwd, abs)} - run the capture step first` };
  }
  let size = 0;
  try {
    size = statSync(abs).size;
  } catch {}
  if (size < 1024) return { status: "unavailable", reason: "cached screenshot is empty/too small" };
  return { status: "ready", screenshotPath: abs, route, frame: BRAND_AD_SCREENSHOT_SOURCE.frame, origin: BRAND_AD_SCREENSHOT_SOURCE.origin };
}

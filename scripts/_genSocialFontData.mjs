// Regenerates lib/social/fontData.mjs from lib/social/fonts/*.woff2.
// Run: node scripts/_genSocialFontData.mjs
import { readFileSync, writeFileSync } from "node:fs";

const sans = readFileSync("lib/social/fonts/geist-sans.woff2").toString("base64");
const mono = readFileSync("lib/social/fonts/geist-mono.woff2").toString("base64");

const out = `// Phase 13E.3 - self-hosted Geist (variable, weight 100-900) + Geist Mono,
// embedded as base64 so lib/social/templates.mjs can @font-face them into a
// bare file:// document with NO network fetch at render time. Same family
// the live site loads via next/font; copied into lib/social/fonts/ and
// inlined here. Geist is SIL OFL 1.1. Regenerate with
// scripts/_genSocialFontData.mjs - do not hand-edit the base64 strings.

export const GEIST_SANS_WOFF2_BASE64 = ${JSON.stringify(sans)};

export const GEIST_MONO_WOFF2_BASE64 = ${JSON.stringify(mono)};

export const FONT_FACE_CSS =
  "@font-face{font-family:'Geist';font-style:normal;font-weight:100 900;font-display:block;" +
  "src:url(data:font/woff2;base64," + GEIST_SANS_WOFF2_BASE64 + ") format('woff2');}" +
  "@font-face{font-family:'Geist Mono';font-style:normal;font-weight:100 900;font-display:block;" +
  "src:url(data:font/woff2;base64," + GEIST_MONO_WOFF2_BASE64 + ") format('woff2');}";
`;

writeFileSync("lib/social/fontData.mjs", out);
console.log("wrote lib/social/fontData.mjs", out.length, "chars");

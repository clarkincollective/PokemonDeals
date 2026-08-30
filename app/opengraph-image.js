import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated programmatically (not a static asset) so it stays in sync
// with the actual brand colors/wordmark used everywhere else on the site
// (see components/Logo.js) instead of drifting out of date.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width={110} height={110} viewBox="0 0 150 150">
            <circle cx="58" cy="58" r="40" fill="none" stroke="#DC2626" strokeWidth="13" />
            <line x1="87" y1="87" x2="128" y2="128" stroke="#DC2626" strokeWidth="17" strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>
            <span style={{ color: "#DC2626" }}>Pokemon&nbsp;</span>
            <span style={{ color: "#18181b" }}>Deal Finder</span>
          </div>
        </div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#52525b" }}>
          Live below-market Pokemon card listings from eBay
        </div>
      </div>
    ),
    { ...size }
  );
}

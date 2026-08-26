import { createHash } from "crypto";

// eBay requires every app to have this endpoint before it can fully use
// their APIs - GDPR/CCPA-style requirement so eBay can tell apps when a
// user has deleted their eBay account and wants associated data erased.
//
// We don't store any eBay user personal data ourselves (this app has no
// eBay user login/OAuth - it only searches public listing data), so
// there's nothing for us to actually delete. This just satisfies the
// verification handshake and acknowledges notifications.

export async function GET(request) {
  const url = new URL(request.url);
  const challengeCode = url.searchParams.get("challenge_code");
  if (!challengeCode) {
    return Response.json({ error: "Missing challenge_code" }, { status: 400 });
  }

  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  // Must exactly match the HTTPS endpoint URL you paste into the eBay
  // Developer dashboard for this notification - including no trailing slash.
  const endpoint = process.env.EBAY_ACCOUNT_DELETION_ENDPOINT;

  const hash = createHash("sha256");
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);

  return Response.json({ challengeResponse: hash.digest("hex") });
}

export async function POST(request) {
  await request.json().catch(() => null);
  return new Response(null, { status: 200 });
}

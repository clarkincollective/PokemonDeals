import { getUsdRates } from "@/lib/fx";
import { viewerCurrency } from "@/lib/viewerCurrency";

export const dynamic = "force-dynamic";

// Tiny read-only endpoint so client components (the homepage "saved" /
// "recently viewed" strips) can show prices in the viewer's currency the
// same way the server-rendered pages do. No secrets, no writes.
//   { viewer: "AUD", rates: { USD: 1, GBP: 0.79, ... } }
export async function GET() {
  const [viewer, rates] = await Promise.all([viewerCurrency(), getUsdRates()]);
  return Response.json(
    { viewer, rates },
    { headers: { "Cache-Control": "private, max-age=900" } }
  );
}

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyTokenLookup, writeSucceeded } from "@/lib/newsletterFlow";

export const dynamic = "force-dynamic";

const SITE_URL = "https://pokemondealfinder.com";
const INFRA_ERROR_MESSAGE = "Something went wrong on our end. Please try again in a few minutes.";

// GET /api/newsletter?token=...&action=confirm|unsubscribe
// Used by links in the weekly digest and (future) a standalone signup.
export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");
  if (!token) return html("Missing token.", 400);

  const db = supabaseAdmin();
  // A genuine "this token doesn't exist" (expired/already-used/bad link)
  // must read differently from "the database/table itself is broken" -
  // conflating the two (see the P1 audit) means a real infrastructure
  // failure gets reported to the visitor as if their link were merely
  // stale, which is false and hides the failure from anyone watching.
  const lookup = classifyTokenLookup(
    await db.from("newsletter_subscribers").select("id, email").eq("token", token).maybeSingle()
  );
  if (lookup.kind === "infra_error") return html(INFRA_ERROR_MESSAGE, 500);
  if (lookup.kind === "not_found") return html("This link is no longer valid.", 404);
  const row = lookup.row;

  if (action === "unsubscribe") {
    const unsubResult = await db
      .from("newsletter_subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (!writeSucceeded(unsubResult)) return html(INFRA_ERROR_MESSAGE, 500);
    return html("You've been unsubscribed from the weekly deals email.");
  }

  const confirmResult = await db
    .from("newsletter_subscribers")
    .update({ confirmed: true, confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq("id", row.id);
  if (!writeSucceeded(confirmResult)) return html(INFRA_ERROR_MESSAGE, 500);
  return html("You're subscribed to the weekly Pokemon deals email.");
}

function html(message, status = 200) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pokemon Deal Finder</title>
<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.25rem;text-align:center">
  <p style="font-size:1.05rem;line-height:1.5">${message.replace(/[<>&]/g, "")}</p>
  <p><a href="${SITE_URL}" style="color:#d62828;font-weight:600">← Back to Pokemon Deal Finder</a></p>
</div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

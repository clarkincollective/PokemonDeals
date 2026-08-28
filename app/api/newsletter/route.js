import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const SITE_URL = "https://pokemondealfinder.com";

// GET /api/newsletter?token=...&action=confirm|unsubscribe
// Used by links in the weekly digest and (future) a standalone signup.
export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");
  if (!token) return html("Missing token.", 400);

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("newsletter_subscribers")
    .select("id, email")
    .eq("token", token)
    .maybeSingle();
  if (!row) return html("This link is no longer valid.", 404);

  if (action === "unsubscribe") {
    await db
      .from("newsletter_subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("id", row.id);
    return html("You've been unsubscribed from the weekly deals email.");
  }

  await db
    .from("newsletter_subscribers")
    .update({ confirmed: true, confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq("id", row.id);
  return html("You're subscribed to the weekly Pokémon deals email.");
}

function html(message, status = 200) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pokémon Deal Finder</title>
<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.25rem;text-align:center">
  <p style="font-size:1.05rem;line-height:1.5">${message.replace(/[<>&]/g, "")}</p>
  <p><a href="${SITE_URL}" style="color:#d62828;font-weight:600">← Back to Pokémon Deal Finder</a></p>
</div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

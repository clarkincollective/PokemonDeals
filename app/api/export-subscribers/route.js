import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// GET /api/export-subscribers  (Authorization: Bearer <CRON_SECRET>)
// CSV of confirmed, still-subscribed newsletter addresses.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://pokemondealfinder.com/api/export-subscribers
export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("newsletter_subscribers")
      .select("email, confirmed_at, source, created_at")
      .eq("confirmed", true)
      .is("unsubscribed_at", null)
      .order("confirmed_at", { ascending: true })
      .range(from, from + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const csv = [
    "email,confirmed_at,source,created_at",
    ...rows.map((r) =>
      [r.email, r.confirmed_at ?? "", r.source ?? "", r.created_at ?? ""]
        .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v))
        .join(",")
    ),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

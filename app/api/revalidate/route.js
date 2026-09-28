import { revalidateTag, revalidatePath } from "next/cache";
import { BOARD_DEALS_TAG } from "@/lib/boardDeals";

// Cache expiry on behalf of the scheduled jobs that run on the owner's PC
// (scripts/crons, 28 Sep 2026). A job that used to run as a Vercel function
// called revalidateTag itself; run on the PC its calls are collected and
// posted here in one request at the end of the run, and this route makes
// the same calls inside Next. CRON_SECRET, like the jobs themselves.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX = 500;

export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const tags = [...new Set((Array.isArray(body?.tags) ? body.tags : []).map(String).filter(Boolean))].slice(0, MAX);
  const paths = [...new Set((Array.isArray(body?.paths) ? body.paths : []).map(String).filter((p) => p.startsWith("/")))].slice(0, MAX);
  const errors = [];
  let expired = 0;
  for (const t of tags) {
    try {
      // 28 Sep 2026: the board tag expires stale-while-revalidate ("max") -
      // its index is a 1.5 MB row and a hard expiry made the next visitor
      // wait on it ("/" p75 10 s that day). Every other tag keeps the hard
      // expiry its flow was built on.
      revalidateTag(t, t === BOARD_DEALS_TAG ? "max" : { expire: 0 });
      expired++;
    } catch (e) {
      errors.push(`${t}: ${e?.message ?? e}`);
    }
  }
  for (const p of paths) {
    try {
      revalidatePath(p);
      expired++;
    } catch (e) {
      errors.push(`${p}: ${e?.message ?? e}`);
    }
  }
  return Response.json({ ok: errors.length === 0, expired, tags: tags.length, paths: paths.length, errors });
}

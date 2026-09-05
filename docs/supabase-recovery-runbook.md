# Supabase disaster recovery runbook

Status: **documentation only**. Written during the Supabase Pro production-readiness
audit (2026-09-05) because no recovery runbook existed. This file does not itself
change any database, backup, or PITR setting — see the audit report for what is
and isn't currently verified about backup/PITR configuration on the live project.

This is a "what to do when something is wrong with the database" checklist, not a
guarantee that every step below is already possible on the current plan/config —
several steps require confirming project state in the Supabase dashboard first,
which this audit could not do directly (no authenticated dashboard/Management API
access was available in that session). Confirm the bracketed `[VERIFY]` items the
first time you actually need this document, and update it once you have.

## 1. What to check first

Before touching anything, establish whether this is a **database** incident or an
**application** incident — they look similar from the outside (pages erroring,
deals not updating) but need different responses.

1. **Vercel first.** Check the Vercel dashboard for the project:
   - Are deployments succeeding?
   - Are the cron jobs in `vercel.json` completing (not erroring, not timing out)?
   - Is there a recent deploy that correlates with when things broke?
2. **Supabase status.** Check https://status.supabase.com for an active incident
   affecting your project's region.
3. **Supabase dashboard → Database → Health/Reports.** `[VERIFY]` — confirm this
   view is available on the current plan and look at CPU, memory, disk, and active
   connections for a spike or a flat-line (flat-line at 0 often means the app
   can't reach the database at all, which is a different failure mode than a
   database that's just slow).
4. **Supabase dashboard → Logs → Postgres logs / API logs.** Look for the
   error class: connection refused, out of connections, disk full, permission
   denied, statement timeout, or a specific query failing.
5. **A specific table or the whole database?** Try a trivial read
   (`select 1`, or a `head:true` count on a small table like `watchlist`) from
   the Supabase SQL Editor. If that works but the app is still broken, the
   problem is almost certainly in application code or environment variables, not
   the database itself.

Do **not** jump to restoring from backup before you've distinguished "the
database is actually damaged" from "the app can't reach a healthy database" or
"a migration was run that broke a query." A restore is the most drastic tool
here and should be the last resort, not the first troubleshooting step.

## 2. How to confirm backup health (before you need it)

This should be checked periodically, not for the first time during an incident.

1. Supabase dashboard → **Database → Backups**. Confirm:
   - The plan's backup type: Pro includes daily backups; Point-in-Time Recovery
     (PITR) is a separate paid add-on and is **not** on by default just because
     the project is on Pro. `[VERIFY]` whether PITR is enabled on this project.
   - The timestamp of the most recent successful backup.
   - The retention window (how far back you can restore).
2. There is currently no automated alert configured (per the audit) for a failed
   or missing backup. Until one exists, this page should be checked manually on
   some regular cadence (e.g. monthly) rather than assumed to be silently fine.
3. **Restore capability has not been tested** as of this writing (per the audit
   — "NOT PROVEN"). A backup nobody has ever restored from is a plan, not a
   proven capability. When it's safe to do so (see below), test a restore into a
   **separate temporary project**, never into production, and record the result
   (date, what was restored, how long it took, what was verified afterward) at
   the bottom of this file.

## 3. How to restore safely (without a destructive test)

**Never restore directly on top of the production project as a first move.**

1. If Supabase Support or the dashboard allows restoring to a **new** project:
   do that first. This gives you a safe copy to inspect and verify before any
   production data is touched.
2. If only an in-place restore is available for this plan `[VERIFY]`:
   - Take note of the exact current state first (a quick export of anything
     written since the backup point that you cannot afford to lose, if
     possible — e.g. the last hour of `deals` inserts/updates, if the
     incident allows time for that).
   - Confirm with a second person (or re-read this checklist yourself, slowly)
     before confirming the restore. It is very hard to undo.
   - Prefer PITR to a specific timestamp over "restore to last daily backup"
     when precision matters — a daily backup can be up to ~24h stale.
3. After any restore, verify the restored environment before pointing
   production traffic at it (see §4).
4. Never restore "to be safe" when the actual problem turns out to be
   application-side (bad deploy, wrong env var, a bad migration) — restoring
   does not fix those and does throw away real data since the backup point.

## 4. How to verify a restored environment

Before trusting a restored database:

- Row counts on the core tables (`deals`, `watchlist`, `card_catalog`) are in a
  plausible range, not zero and not obviously truncated.
- `deals.is_active` / `exact_verified_at` are populated as expected — a restore
  from a stale-enough backup will resurrect deals that have since sold; the
  next `verify-deals` and `sweep-stale-deals` cron cycles will re-correct this
  over time, but it's worth knowing that's what you're seeing rather than
  mistaking it for another bug.
- The four RLS-relevant tables' policies survived the restore as expected:
  `deals`/`cards`/`watchlist`/`card_catalog` should still be publicly
  readable; `price_alerts`/`newsletter_subscribers` should still deny anon
  access entirely. A restore should carry policies with it, but confirm rather
  than assume.
- The app can actually connect (env vars still point at the right project
  URL/keys — a restore to a **new** project changes the project URL, which
  means `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in Vercel's
  environment variables must be updated before traffic is cut over).

## 5. Credentials needed

- Supabase dashboard access (organization + project) for whoever performs the
  restore.
- Vercel dashboard/project access, to update environment variables if the
  restore target is a new project, and to redeploy.
- The service-role key is **not** needed to perform a dashboard-driven backup
  restore — that's a project-level operation, not a table-level query. It is
  needed afterward for the app to keep functioning.
- Never paste the service-role key, database password, or any Supabase access
  token into a chat, ticket, or this document. Reference "the project's
  service-role key in Vercel env vars" rather than the value itself.

## 6. When to involve Supabase Support

- The dashboard shows the database as unreachable/degraded and it has not
  recovered after a reasonable wait (rule of thumb: 15-30 minutes) with no
  matching status-page incident.
- A restore is needed and the self-service restore flow in the dashboard is
  unavailable, fails, or its outcome is unclear.
- You suspect data corruption at the storage/WAL level rather than an
  application-caused bad write (the former is Supabase's to fix; the latter is
  yours, and a support ticket won't undo a bad application write anyway — a
  restore or manual correction will).
- Any doubt about whether an action is reversible. Support can usually tell
  you before you find out the hard way.

## Restore-test log

_(Append an entry here every time a restore is actually tested or performed —
date, target (temp project vs. production), what was verified, outcome. Empty
as of this writing — no restore has been tested yet; see the audit report.)_

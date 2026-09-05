// Supabase P1 closeout (newsletter_subscribers schema drift) - pure
// decision helpers factored out of app/api/newsletter, app/api/alerts,
// and app/api/send-digest so the "is this a genuine invalid/expired
// token vs. an infrastructure/database failure" distinction, and the
// digest's non-2xx-on-real-failure rule, are unit-testable without a
// live database or a mocking framework. Mirrors this repo's existing
// pattern of pure logic in lib/, thin route handlers in app/.
//
// None of these functions perform I/O - each takes the {data, error}
// shape a Supabase query already returned and decides what the caller
// should do with it.

// A token lookup (confirm/unsubscribe) has exactly three outcomes, and
// they must never be conflated:
//   - infra_error: the query itself failed (missing table, connection
//     issue, etc.) - the visitor's token may well be fine, we just
//     couldn't check. Must read as a server error, not "invalid link".
//   - not_found:   the query succeeded and found no matching row - a
//     genuinely expired/already-used/bad token.
//   - found:       the row exists: proceed.
function classifyTokenLookup({ data, error }) {
  if (error) return { kind: "infra_error" };
  if (!data) return { kind: "not_found" };
  return { kind: "found", row: data };
}

// A write (update/insert) either succeeded or it didn't - a lookup
// succeeding does not guarantee the following write will.
function writeSucceeded({ error }) {
  return !error;
}

// The digest cron's subscriber-list read: a genuine query/database
// failure must always be reported as a server error (5xx), never
// disguised as a normal 200 - that disguise is exactly what let the
// newsletter_subscribers drift stay invisible for days.
function digestSubscriberQueryStatus({ error }) {
  return error ? 500 : 200;
}

// The alerts POST's optional newsletter opt-in: must never report
// "subscribed"/"resubscribed" when the underlying write silently
// failed, but must also never be asked to fail the price alert itself -
// callers decide that separately. `requested` is the visitor's own
// checkbox state; everything else mirrors the three-branch flow in
// app/api/alerts/route.js (lookup -> insert-if-new -> update-if-
// previously-unsubscribed -> otherwise already pending on this row).
function newsletterOptInStatus({ requested, lookupError, existing, insertError, updateError }) {
  if (!requested) return null; // visitor didn't opt in - nothing to report
  if (lookupError) return "failed";
  if (!existing) return insertError ? "failed" : "subscribed";
  if (existing.confirmed) return updateError ? "failed" : "resubscribed";
  return "pending"; // an unconfirmed row already exists; the confirm click activates it
}

module.exports = { classifyTokenLookup, writeSucceeded, digestSubscriberQueryStatus, newsletterOptInStatus };

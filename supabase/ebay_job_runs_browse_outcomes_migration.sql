-- browse-outcomes-r1: how each ANSWERED Browse request came back.
--
-- Why: the closed 16-17 Sep window reconciled exactly internally (ledger
-- 5,075 = job attempts 5,075) while eBay's own counter showed 4,760 charged
-- - a 315-request difference no retained record could attribute, because
-- nothing stored the response class of an answered request.
--
-- browse_calls keeps its existing meaning exactly: every Browse request that
-- REACHED eBay and got a response, retries included. These columns split that
-- same total by status class, and the identity is closed:
--
--   browse_ok + browse_401 + browse_403 + browse_429
--             + browse_4xx + browse_5xx + browse_other_status = browse_calls
--
-- browse_other_status catches any answered status outside the named buckets
-- (1xx, 3xx, anything unexpected) so every answered request lands in exactly
-- one bucket and a genuine gap can never hide as an unnamed status.
--
-- browse_transport_failures is deliberately OUTSIDE that identity: a request
-- that never received a response is not in browse_calls either.
--
-- NULLABLE ON PURPOSE, with no default. Rows written before this telemetry
-- shipped must stay distinguishable from a run that genuinely observed zero
-- of something: historical rows keep NULL, instrumented runs write an
-- integer (0 included). There is NO backfill - a NULL means "not measured",
-- never "measured none".
--
-- Additive and non-destructive: ADD COLUMN IF NOT EXISTS only. No existing
-- column is altered, renamed, reordered or dropped; no data is rewritten; no
-- constraint, index or default is added to an existing column. Re-runnable.
--
-- Status class only - no URL, token, header or body is ever stored.
ALTER TABLE ebay_job_runs
  ADD COLUMN IF NOT EXISTS browse_ok integer,
  ADD COLUMN IF NOT EXISTS browse_401 integer,
  ADD COLUMN IF NOT EXISTS browse_403 integer,
  ADD COLUMN IF NOT EXISTS browse_429 integer,
  ADD COLUMN IF NOT EXISTS browse_4xx integer,
  ADD COLUMN IF NOT EXISTS browse_5xx integer,
  ADD COLUMN IF NOT EXISTS browse_other_status integer,
  ADD COLUMN IF NOT EXISTS browse_transport_failures integer;

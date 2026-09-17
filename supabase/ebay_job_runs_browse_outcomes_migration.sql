-- browse-outcomes-r1: how each ANSWERED Browse request came back.
--
-- Why: a closed window reconciled exactly internally (ledger 5,075 = job
-- attempts 5,075) while eBay's own counter showed 4,760 charged - a 315
-- request difference that no retained record could attribute, because
-- nothing stored the response class of an answered request.
--
-- browse_calls keeps its existing meaning exactly: every Browse request that
-- REACHED eBay and got a response, retries included. These columns split that
-- same total by status class, so browse_ok + browse_401 + browse_403 +
-- browse_429 + browse_4xx + browse_5xx = browse_calls.
--
-- browse_transport_failures is deliberately OUTSIDE that identity: a request
-- that never received a response is not in browse_calls either.
--
-- Status class only - no URL, token, header or body is ever stored.
ALTER TABLE ebay_job_runs
  ADD COLUMN IF NOT EXISTS browse_ok integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS browse_401 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS browse_403 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS browse_429 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS browse_4xx integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS browse_5xx integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS browse_transport_failures integer NOT NULL DEFAULT 0;

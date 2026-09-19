-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- 2026-09-19 growth brief §6 - alert criteria.
--
-- Additive and backward compatible: every column is nullable or defaulted,
-- so existing rows keep their exact meaning (a USD target in
-- target_price_usd, or "any below-market listing" when null) and the
-- cron's legacy-dormant rule for bare `target_price` rows is untouched.
--
-- New contract (lib/alertMatch.js):
--   marketplace      only offers scanned from this eBay site count
--   condition        'NM' | 'LP' | 'graded' (+ optional grader / grade)
--   target_amount    the threshold in target_currency; compared at CHECK
--   target_currency  time against the listing's USD total converted with the
--                    server's rate table - never converted at entry. A USD
--                    alert also keeps target_price_usd so older code paths
--                    read it unchanged.
--   target_scope     'all_in' (delivered total; unknown shipping NEVER
--                    satisfies it) | 'item' (item price alone)
--   alert_kind       'card' (card_slug = the card) | 'set' (card_slug =
--                    'set:<set-slug>', criteria.set_name carries the set)
--   min_discount     an untargeted alert's own floor (0.1 / 0.2 / 0.3)
--   criteria         jsonb bag for kind-specific fields (set_name, set_slug)
--   digest           true = one email per check run for this subscriber
--                    covering every matched alert, instead of one per alert
--
-- The application probes for `digest` before writing any of these; until
-- this has run, /api/alerts stores default-criteria alerts exactly as
-- before and answers 503 criteria_unavailable for anything narrower.

alter table price_alerts add column if not exists marketplace text;
alter table price_alerts add column if not exists condition text;
alter table price_alerts add column if not exists grader text;
alter table price_alerts add column if not exists grade text;
alter table price_alerts add column if not exists target_amount numeric;
alter table price_alerts add column if not exists target_currency text not null default 'USD';
alter table price_alerts add column if not exists target_scope text not null default 'all_in';
alter table price_alerts add column if not exists alert_kind text not null default 'card';
alter table price_alerts add column if not exists min_discount numeric;
alter table price_alerts add column if not exists criteria jsonb;
alter table price_alerts add column if not exists digest boolean not null default false;

alter table price_alerts drop constraint if exists price_alerts_target_scope_check;
alter table price_alerts add constraint price_alerts_target_scope_check check (target_scope in ('all_in', 'item'));
alter table price_alerts drop constraint if exists price_alerts_alert_kind_check;
alter table price_alerts add constraint price_alerts_alert_kind_check check (alert_kind in ('card', 'set'));
alter table price_alerts drop constraint if exists price_alerts_target_currency_check;
alter table price_alerts add constraint price_alerts_target_currency_check check (target_currency in ('USD', 'GBP', 'EUR', 'AUD', 'CAD'));

comment on column price_alerts.target_amount is
  'Alert threshold in target_currency. Compared at check time against the listing USD total (or item share) converted with the server rate table. Null = untargeted (min_discount floor).';
comment on column price_alerts.target_scope is
  'all_in = delivered total incl. shipping (a listing with unrecorded shipping never satisfies it); item = item price alone.';
comment on column price_alerts.digest is
  'true = the subscriber receives one email per check run listing every matched alert, instead of one email per alert.';

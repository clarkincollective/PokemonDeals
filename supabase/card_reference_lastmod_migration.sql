-- SEO-3: card sitemap <lastmod> source.
--
-- One read-only, STABLE function that returns, for a keyset page of
-- English catalogue cards, the most recent day on which each card's
-- displayed Near Mint catalogue price MATERIALLY changed, as proven by two
-- of the site's OWN daily 'catalog' observations: the price moved by at
-- least $0.05 AND at least 2% away from the last COUNTED price (the
-- anchor, so slow drift accumulates until it is material, then counts).
-- A card with no such change gets NO entry (no <lastmod>, never a
-- fallback). This is exactly lib/cardSitemap.js cardReferenceLastmod(),
-- the unit-tested JS reference implementation.
--
-- Exposes ONLY tcgplayer_id -> lastmod date - never a price or a raw row.
--
-- Phase 17B history:
--
--   * v1 (row set, paged with PostgREST .range()) - never applied: every
--     page re-ran the whole query with no stable order.
--   * v2 (one jsonb object, whole table) - applied, then measured: exceeds
--     the API's 8 s statement timeout (57014). Dropped.
--   * v3 (keyset pages, "any change incl. backfill + first recorded day")
--     - applied and measured: 12 pages, <= 3.1 s each, 25,666 dates, 0
--     duplicates / malformed / future. But ~96% were early-September
--     dates: the site's own daily recording expanded from ~4.9k to ~24.8k
--     cards on 2026-09-02, so the backfill -> first-party step and the
--     "first recorded day" both stamped a change on the day recording
--     began, when the page itself had not changed. Artificial freshness.
--   * v4 (this file) - same keyset paging and security; counts ONLY
--     material catalog -> catalog changes (owner decision 2026-09-11:
--     >= 2% and >= $0.05; ~31% of cards on a 400-card sample).
--
-- Keyset paging: p_after = the last tcgplayer_id of the previous page (''
-- for the first), p_limit = cards per page (default 2500, clamped to
-- 1..5000). The page's key range comes from the card_catalog primary key;
-- price_history is then read by index for exactly (p_after, last_key],
-- ordered by (tcgplayer_id, observed_on) - one row per card per day by
-- price_history_daily_uniq (tcgplayer_id, condition, source, observed_on).
-- Consecutive pages partition the key space, so every card is computed
-- exactly once, inside one statement. Returns
--   {"cards": <ids in page>, "last_key": <text|null>,
--    "lastmod": {"<tcgplayer_id>": "YYYY-MM-DD", ...}}
--
-- Why plpgsql: the anchor rule is sequential (each decision depends on the
-- last counted price), which a window function cannot express; a single
-- ordered pass is O(rows). Still no dynamic SQL (no EXECUTE), parameters
-- used only as values, no INSERT / UPDATE / DELETE / DDL inside.
--
-- Security (unchanged): SECURITY INVOKER; EXECUTE for service_role ONLY
-- (price_history is deny-all to anon - RLS on, no policy - so an anon
-- caller would get an empty result, not an error; the sitemap calls this
-- with the service-role client, as the card pages read price_history);
-- search_path = '' so every relation is schema-qualified and everything
-- else resolves from pg_catalog. No table, no view, no data written.

create or replace function public.card_reference_lastmod(p_after text, p_limit integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_after  text    := coalesce(p_after, '');
  v_limit  integer := least(greatest(coalesce(p_limit, 2500), 1), 5000);
  v_cards  integer;
  v_last   text;
  v_ids    text[]  := '{}';
  v_days   text[]  := '{}';
  v_cur    text    := null;
  v_anchor numeric;
  v_lm     date;
  r        record;
begin
  select count(*), max(t.tcgplayer_id)
    into v_cards, v_last
  from (
    select c.tcgplayer_id
    from public.card_catalog c
    where c.language = 'english'
      and c.tcgplayer_id > v_after
    order by c.tcgplayer_id
    limit v_limit
  ) t;

  if v_cards = 0 then
    return jsonb_build_object('cards', 0, 'last_key', null, 'lastmod', '{}'::jsonb);
  end if;

  for r in
    select ph.tcgplayer_id, ph.observed_on, ph.price
    from public.price_history ph
    where ph.tcgplayer_id > v_after
      and ph.tcgplayer_id <= v_last
      and ph.source = 'catalog'
      and ph.condition = 'Near Mint'
      and ph.language = 'english'
      and ph.price > 0
      and ph.price not in (999, 999.99, 9999, 9999.99, 99999, 99999.99)
      and ph.observed_on <= current_date + 1
    order by ph.tcgplayer_id, ph.observed_on
  loop
    if v_cur is distinct from r.tcgplayer_id then
      if v_lm is not null then
        v_ids  := v_ids  || v_cur;
        v_days := v_days || to_char(v_lm, 'YYYY-MM-DD');
      end if;
      v_cur    := r.tcgplayer_id;
      v_anchor := r.price;   -- first recorded day: the anchor, never a change
      v_lm     := null;
    elsif abs(r.price - v_anchor) >= 0.05
      and abs(r.price - v_anchor) * 50 >= v_anchor then   -- >= $0.05 and >= 2%
      v_lm     := r.observed_on;
      v_anchor := r.price;
    end if;
  end loop;

  if v_lm is not null then
    v_ids  := v_ids  || v_cur;
    v_days := v_days || to_char(v_lm, 'YYYY-MM-DD');
  end if;

  return jsonb_build_object(
    'cards', v_cards,
    'last_key', v_last,
    'lastmod', coalesce(jsonb_object(v_ids, v_days), '{}'::jsonb)
  );
end;
$$;

comment on function public.card_reference_lastmod(text, integer) is
  'SEO-3: keyset page of {tcgplayer_id: YYYY-MM-DD} = latest MATERIAL (>= 2% and >= $0.05 vs last counted price) change between the site''s own daily catalog observations; no entry if none. Read-only, service-role only; used for card sitemap <lastmod>.';

-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon + authenticated, and Postgres grants it to PUBLIC. Re-asserted on
-- every run (idempotent); only the server-side sitemap calls this.
revoke execute on function public.card_reference_lastmod(text, integer) from public, anon, authenticated;
grant execute on function public.card_reference_lastmod(text, integer) to service_role;

-- Post-apply check (read-only):
--   explain (analyze, buffers) select public.card_reference_lastmod('', 2500);

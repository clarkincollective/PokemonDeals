-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- The watchlist table had RLS enabled (in the original schema.sql) but was
-- never given a public read policy - the original comment there said
-- "the watchlist itself is an internal detail, not shown to visitors", but
-- every deal card publicly joins deals -> watchlist to get the card's
-- clean name/set. With no policy, that join silently returns null for the
-- public anon key (the deny-by-default behavior of RLS with zero
-- policies), and every deal card has been falling back to the raw eBay
-- listing title instead - explains both the TCGPlayer search-link failures
-- (raw eBay titles are messy free text, unlike our clean watchlist names)
-- and why the card-set subtitle has never shown up on any deal card.
--
-- No actual sensitive data lives in this table (card names, sets, and a
-- public TCGPlayer catalog ID) - the original "internal" framing was about
-- not having a page that lists the raw watchlist, not about the data being
-- secret, so a public read policy is safe here, same pattern as the
-- existing "deals" and "cards" table policies.
create policy "Public read access to watchlist"
  on watchlist for select
  using (true);

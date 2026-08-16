-- STEP 1 of 2 — run this one now. Nothing here can break anything.
--
-- Every statement below only ADDS a capability or TIGHTENS a rule that the app
-- was never using. The two permissive policies that have to be removed are in
-- step B, which runs after the new site is deployed — otherwise a phone still
-- running the old bundle would lose its unsubscribe button in the gap between
-- the two.
--
-- Four holes were found, all reachable with nothing but the anon key that is
-- printed in every visitor's JavaScript bundle. Each fix was chosen after
-- tracing the callers that legitimately use the table, named in the comments.

------------------------------------------------------------------------------
-- 1. A stranger could enrol their own phone into the admins' alert feed.
--
-- «device_tokens: public insert» is WITH CHECK (true) on a table that has an
-- is_admin column. The app sends {token, platform} and nothing more, so adding
-- "is_admin": true to that same request subscribes the sender to every
-- complaint and every station registration from then on.
--
-- Nothing the app does changes: components/NativePush.tsx:51 sends only
-- {token, platform}, and is_admin DEFAULTs to false, so it passes the check.
-- The admin's own phone is claimed by an UPDATE at app/admin/page.tsx:76, and
-- «device_tokens: admin claim» already limits UPDATE to role='admin'.
------------------------------------------------------------------------------
drop policy if exists "device_tokens: public insert" on device_tokens;
create policy "device_tokens: public insert" on device_tokens
  for insert to public
  with check (is_admin is not true);

------------------------------------------------------------------------------
-- 2. Unsubscribing from one station, without being able to unsubscribe everyone.
--
-- «push_subscriptions: public delete own» is USING (true) — "own" was the
-- intention, never the rule. The same request with its filters removed empties
-- the table for every user. Unsubscribing is genuinely anonymous here
-- (lib/push.ts, no account is involved), so the capability moves into a
-- function that can only reach the single row the caller names. This mirrors
-- alerts_unsubscribe(), which already solves the identical problem.
--
-- The old policy is NOT dropped here — see step B.
------------------------------------------------------------------------------
create or replace function public.push_unsubscribe(
  p_station_id uuid,
  p_endpoint   text,
  p_role       text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from push_subscriptions
   where station_id = p_station_id
     and endpoint   = p_endpoint
     and role       = p_role;
$$;

revoke all on function public.push_unsubscribe(uuid, text, text) from public;
grant execute on function public.push_unsubscribe(uuid, text, text) to anon, authenticated;

------------------------------------------------------------------------------
-- 3. Any visitor could publish a review that was already marked approved.
--
-- station_reviews_guard() opened with:
--
--     if auth.uid() is null or exists (… role = 'admin') then return new;
--
-- The null branch was meant to wave through the service role. But reviews are
-- written by visitors who have no account, and auth.uid() is null for them
-- too — so the guard waved through precisely the callers it existed to
-- constrain, and «station_reviews: public insert» WITH CHECK (true) let a
-- status ride along in the request body. Public SELECT is limited to
-- status='approved', so a self-approved review went live immediately.
--
-- No edge function and no script writes to station_reviews, so the service
-- role branch was protecting nothing; it is removed rather than repaired.
--
-- Nothing the app does changes: lib/reviews.ts:42 never sends a status, and
-- moderation in components/ReviewsPanel.tsx runs as an admin, which still
-- takes the first branch.
------------------------------------------------------------------------------
create or replace function public.station_reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
  else
    new.status := old.status;
  end if;
  return new;
end $$;

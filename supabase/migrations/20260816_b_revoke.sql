-- STEP 2 of 2 — run this ONLY after muhta.online has been redeployed with the
-- lib/push.ts change that calls push_unsubscribe().
--
-- These two statements remove capability. Run early, and a browser still
-- holding the previous bundle silently loses its unsubscribe. Run after the
-- deploy and nothing notices, because nothing the app does needs either one.

------------------------------------------------------------------------------
-- Anyone could delete every push token in the system.
--
-- USING (true) on DELETE: one request with no filter empties the table, and
-- the platform goes quiet on every phone with no error raised anywhere — the
-- notifications simply stop arriving and nothing says why.
--
-- Nothing in app/, components/ or lib/ deletes from this table. The only
-- deletes are the dead-token pruning inside the notify / announce /
-- admin-alert edge functions, and those run on the service role, which
-- bypasses RLS entirely. Removing the policy removes the ability without
-- removing any behaviour.
------------------------------------------------------------------------------
drop policy if exists "device_tokens: public delete" on device_tokens;

------------------------------------------------------------------------------
-- The same unrestricted delete on the web-push table. Replaced in step A by
-- push_unsubscribe(), which can only reach the one row the caller names.
------------------------------------------------------------------------------
drop policy if exists "push_subscriptions: public delete own" on push_subscriptions;

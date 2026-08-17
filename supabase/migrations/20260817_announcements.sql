-- Official notices about fuel arriving at stations that are NOT on the platform.
--
-- notify() refuses to announce a station it cannot verify — it checks the row
-- exists, is approved, and the fuel is genuinely in stock, so a forged call
-- cannot send people to an empty forecourt. That guarantee must not be bent to
-- carry a distributor's notice, because the notice is a different kind of
-- claim: it comes from the oil products directorate, not from the station, and
-- the station has not joined yet.
--
-- So it gets its own record, and the app says plainly who is speaking.

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  -- the honest footnote shown under the announcement in the app
  note        text,
  -- which cities it was sent to, for display; null = everyone
  cities      text[],
  product     text,
  source      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists announcements_recent on public.announcements (created_at desc)
  where active;

alter table public.announcements enable row level security;

-- Anyone may read an active notice: it is the page the notification opens, and
-- the reader has no account.
drop policy if exists "announcements: public read" on public.announcements;
create policy "announcements: public read" on public.announcements
  for select to public
  using (active);

-- Only an admin writes one.
drop policy if exists "announcements: admin write" on public.announcements;
create policy "announcements: admin write" on public.announcements
  for all to public
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

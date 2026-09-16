-- «غسيل» M9: موظّفو المغسلة — يحدّثون الحجوزاتِ ويسجّلون السيّاراتِ ولا يمسّون الاشتراكَ ولا الأسعار (§3.3).
--
-- نسخةُ station_managers: صفٌّ لكلّ حسابِ موظّف (رقمٌ أو اسمُ دخول)، و`manages_wash`
-- تشمل الموظّفَ النشط، و`owns_wash` للمالك والإدارة وحدَهما فتُحصر بها الكتابةُ
-- الحسّاسة (بياناتُ المغسلة، الخدماتُ، العروضُ، الإغلاقات، إخفاءُ التقييم).
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جدولٌ ودالّةٌ وسياساتُ wash_* فقط. manages_station لا تُمسّ. التراجع:
--   drop table wash_managers; drop function owns_wash(uuid,uuid); إعادةُ manages_wash وmy_wash من 20260917 والسياساتِ من 20260917/20260917c/20260919b.
begin;

create table if not exists public.wash_managers (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  wash_id  uuid not null references public.car_washes(id) on delete cascade,
  phone    text,
  username text,
  label    text check (label is null or char_length(label) <= 20),
  active   boolean not null default true,
  added_at timestamptz not null default now(),
  added_by uuid,
  constraint wash_managers_login_check check (
    (phone is null or phone ~ '^07\d{9}$')
    and (username is null or (username ~ '^[a-z][a-z0-9_.]{3,19}$' and username !~ '^p\d+$'))
    and (phone is not null or username is not null)
  )
);
create index if not exists wash_managers_wash_idx on public.wash_managers(wash_id);
create unique index if not exists wash_managers_username_uniq on public.wash_managers(username) where username is not null;
alter table public.wash_managers enable row level security;
revoke all on public.wash_managers from anon, authenticated;
-- لا insert من المتصفّح: الإضافةُ من station-phone (add_wash_staff) بمفتاح الخدمة.
grant select, update (active, label), delete on public.wash_managers to authenticated;

/** صاحبُ المغسلة أو الإدارة — للكتابة الحسّاسة. */
create or replace function public.owns_wash(p_wash uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_user is null then false else
       exists (select 1 from car_washes w where w.id = p_wash and w.owner_id = p_user)
    or exists (select 1 from profiles p where p.id = p_user and p.role = 'admin')
  end;
$$;
revoke all on function public.owns_wash(uuid, uuid) from public;
grant execute on function public.owns_wash(uuid, uuid) to anon, authenticated, service_role;

/** المالكُ أو الإدارةُ أو موظّفٌ نشط — للحجوزات واللوحة. */
create or replace function public.manages_wash(p_wash uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_user is null then false else
       exists (select 1 from car_washes w where w.id = p_wash and w.owner_id = p_user)
    or exists (select 1 from profiles p where p.id = p_user and p.role = 'admin')
    or exists (select 1 from wash_managers m where m.wash_id = p_wash and m.user_id = p_user and m.active)
  end;
$$;

drop policy if exists "wash_managers: managers read" on public.wash_managers;
create policy "wash_managers: managers read" on public.wash_managers for select using (manages_wash(wash_id));
drop policy if exists "wash_managers: owner writes" on public.wash_managers;
create policy "wash_managers: owner writes" on public.wash_managers for update using (owns_wash(wash_id)) with check (owns_wash(wash_id));
drop policy if exists "wash_managers: owner deletes" on public.wash_managers;
create policy "wash_managers: owner deletes" on public.wash_managers for delete using (owns_wash(wash_id));

-- الكتابةُ الحسّاسة للمالك والإدارة؛ القراءةُ والحجوزاتُ لكلّ من يدير.
drop policy if exists "car_washes: owner and admin update" on public.car_washes;
create policy "car_washes: owner and admin update" on public.car_washes for update using (owns_wash(id));
drop policy if exists "wash_services: owner writes own" on public.wash_services;
create policy "wash_services: owner writes own" on public.wash_services for all using (owns_wash(wash_id)) with check (owns_wash(wash_id));
drop policy if exists "wash_offers: owner writes own" on public.wash_offers;
create policy "wash_offers: owner writes own" on public.wash_offers for all using (owns_wash(wash_id)) with check (owns_wash(wash_id));
drop policy if exists "wash_closures: owner writes own" on public.wash_closures;
create policy "wash_closures: owner writes own" on public.wash_closures for all using (owns_wash(wash_id)) with check (owns_wash(wash_id));
drop policy if exists "wash_reviews: owner and admin hide" on public.wash_reviews;
create policy "wash_reviews: owner and admin hide" on public.wash_reviews for update using (owns_wash(wash_id)) with check (owns_wash(wash_id));

-- الموظّفُ يدخل فيجد مغسلتَه.
create or replace function public.my_wash()
returns setof public.car_washes language sql stable security definer set search_path = public as $$
  select w.* from car_washes w where w.owner_id = auth.uid()
  union all
  select w.* from car_washes w join wash_managers m on m.wash_id = w.id
   where m.user_id = auth.uid() and m.active and not exists (select 1 from car_washes o where o.owner_id = auth.uid())
  order by created_at limit 1;
$$;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'manages_wash') = 1, 'manages_wash مكرّرة';
  assert (select prosrc from pg_proc where proname = 'manages_wash') like '%wash_managers%', 'manages_wash لا تشمل الموظّفين';
  assert (select prosrc from pg_proc where proname = 'manages_station') not like '%wash%', 'manages_station مُسّت';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
end $$;

commit;

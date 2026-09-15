-- أرقامُ الورديات: أكثرُ من رقمٍ يدير محطةً واحدة، يُوقَف ويُشغَّل كلٌّ على
-- حدة أو الكلُّ معاً، وسجلٌّ بالتحديثات منسوبٌ إلى الرقم.
--
-- «إمكانيّةُ إضافة أكثر من رقمٍ لإدارة المحطة لأنّ يوجد أكثرُ من أوقات دوام،
-- وإمكانيّةُ إيقاف رقمٍ وتشغيل آخر أو تشغيلهنّ جميعاً، ويكون لدينا سجلٌّ
-- بالتحديثات على حسب الرقم» — صاحبُ المنصّة، ١٥ أيلول.
--
-- ── المبدأ ─────────────────────────────────────────────────────────────────
--
-- الرقمُ الأساسيُّ يبقى stations.owner_id وstations.phone كما هما: هويّةُ
-- المحطة عند البوتات والاسترجاع والإشعارات. والأرقامُ الإضافيّةُ صفوفٌ في
-- station_managers، ومسندٌ واحدٌ manages_station() يحلّ محلَّ
-- «owner_id = auth.uid()» في كلّ سياسةٍ ودالّةٍ تسأل «أهو صاحبُها؟» — فلا
-- يبقى بابٌ يفتح لمالكٍ ويُغلق على ورديته، ولا يُفتح لرقمٍ موقوف.
--
-- الإضافةُ بيد الإدارة وحدَها (تحتاج مفتاحَ الخدمة لإنشاء الحساب، والمنصّةُ
-- تعاني من تسجيلاتٍ مزيّفة). والإيقافُ والتشغيلُ بيد صاحب المحطة والإدارة.
begin;

-- ── ١ · الجدول ─────────────────────────────────────────────────────────────
create table if not exists public.station_managers (
  -- رقمٌ واحدٌ ↔ محطةٌ واحدة: حسابٌ يدير محطتين يفتح بابَ الاستيلاء.
  user_id    uuid primary key references auth.users(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  phone      text not null check (phone ~ '^07\d{9}$'),
  label      text check (char_length(label) <= 20),
  active     boolean not null default true,
  added_at   timestamptz not null default now(),
  added_by   uuid
);
create index if not exists station_managers_station_idx on public.station_managers(station_id);
alter table public.station_managers enable row level security;
revoke all on public.station_managers from anon, authenticated;
-- لا insert لأحد من المتصفّح: الإضافةُ من station-phone بمفتاح الخدمة.
grant select, update (active, label), delete on public.station_managers to authenticated;

comment on table public.station_managers is
  'أرقامٌ إضافيّة تدير محطة (ورديات). الأساسيُّ في stations.owner_id. active=false يوقف الدخولَ والإشعارات.';

-- ── ٢ · المسندُ الواحد ────────────────────────────────────────────────────
-- يُمنح لـanon عمداً: يقع داخل سياساتٍ بلا «to» (stations: owner read own،
-- station_products: owner write own)، وPostgres يفحص EXECUTE عند بناء
-- الخطّة لا عند التقييم — فبلا المنح تسقط كلُّ قراءةٍ عامّة. وCASE يضمن
-- أنّ المجهولَ لا يلمس جدولاً.
create or replace function public.manages_station(p_station uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_user is null then false else
       exists (select 1 from stations s where s.id = p_station and s.owner_id = p_user)
    or exists (select 1 from station_managers m
                where m.station_id = p_station and m.user_id = p_user and m.active)
  end;
$$;
revoke all on function public.manages_station(uuid, uuid) from public;
grant execute on function public.manages_station(uuid, uuid) to anon, authenticated, service_role;

/** صاحبُ المحطة الأساسيّ — للإيقاف والتشغيل. */
create or replace function public.owns_station(p_station uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from stations s where s.id = p_station and s.owner_id = auth.uid());
$$;
revoke all on function public.owns_station(uuid) from public;
grant execute on function public.owns_station(uuid) to anon, authenticated, service_role;

drop policy if exists "station_managers: members and admin read" on public.station_managers;
create policy "station_managers: members and admin read" on public.station_managers
  for select using (
    user_id = auth.uid() or manages_station(station_id)
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
-- الإيقافُ والتشغيلُ: صاحبُ المحطة الأساسيّ أو الإدارة — لا الورديةُ نفسُها.
drop policy if exists "station_managers: owner and admin toggle" on public.station_managers;
create policy "station_managers: owner and admin toggle" on public.station_managers
  for update using (
    owns_station(station_id)
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "station_managers: admin removes" on public.station_managers;
create policy "station_managers: admin removes" on public.station_managers
  for delete using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── ٣ · الحارس: الورديةُ لا تبدّل رقمَ المحطة ────────────────────────────
-- نسخةُ 20260908_fuel_schedule.sql:103-150 حرفيّاً مع سطرٍ واحدٍ مضاف:
-- new.phone := old.phone لغير الإدارة. لمّا صار للورديات تحديثُ stations، صار
-- رقمُ المحطة (هويّتُها عند واتساب والاسترجاع والنقل) في متناولها — فيُثبَّت.
CREATE OR REPLACE FUNCTION public.stations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  candidate text;
  n int := 0;
begin
  new.name := btrim(new.name);
  if new.name <> '' and new.name !~ 'محط[ةه]' then
    new.name := 'محطة ' || new.name;
  end if;

  if new.slug is null or btrim(new.slug) = '' then
    candidate := station_slug(new.name, new.id);
    while candidate in ('login','register','owner','admin','station','offline','api',
                        'icons','ads','alerts','download','privacy','subscribe',
                        'reset','test-push','about','news','road','branch','sounds',
                        'schedule','manifest.json','sw.js')
          or exists (select 1 from stations s where s.slug = candidate and s.id <> new.id)
    loop
      n := n + 1;
      candidate := station_slug(new.name, new.id) || '-' || n::text;
    end loop;
    new.slug := candidate;
  end if;

  -- service-role callers (edge functions) and admins are trusted
  if auth.uid() is null
     or exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
  else
    new.status := old.status;
    new.owner_id := old.owner_id;
    -- الرقمُ يتغيّر عبر الإدارة (station-phone) لا من اللوحة — للمالك وورديته سواء.
    new.phone := old.phone;
  end if;
  return new;
end $function$;

-- المُشغّلُ قائمٌ حيّاً باسمه (HANDOVER.md:126) ولم يُكتب في المستودع: يُنشأ
-- إن غاب، ولا يُمسّ إن وُجد.
do $$ begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.stations'::regclass and tgname = 'stations_guard_trg') then
    create trigger stations_guard_trg before insert or update on public.stations
      for each row execute function public.stations_guard();
  end if;
end $$;

-- ── ٤ · السياساتُ السبع التي كانت «owner_id = auth.uid()» ───────────────
-- schema.sql:145
drop policy if exists "stations: owner read own" on public.stations;
create policy "stations: owner read own" on public.stations
  for select using (manages_station(id));
-- schema.sql:147
drop policy if exists "stations: owner update own" on public.stations;
create policy "stations: owner update own" on public.stations
  for update using (manages_station(id));
-- schema.sql:155-157
drop policy if exists "station_products: owner write own" on public.station_products;
create policy "station_products: owner write own" on public.station_products
  for all using (manages_station(station_id));
-- 20260829_station_messages.sql:64-67
drop policy if exists "station_messages: owner reads own" on public.station_messages;
create policy "station_messages: owner reads own" on public.station_messages
  for select using (manages_station(station_id));
-- 20260829_station_messages.sql:81-85
drop policy if exists "station_messages: owner writes own" on public.station_messages;
create policy "station_messages: owner writes own" on public.station_messages
  for insert with check (sender = 'owner' and kind is null and read_at is null and manages_station(station_id));
-- 20260829_station_messages.sql:97-101
drop policy if exists "station_messages: owner marks read" on public.station_messages;
create policy "station_messages: owner marks read" on public.station_messages
  for update using (sender <> 'owner' and manages_station(station_id));
-- 20260911_complaints_owner_read.sql:10-18
drop policy if exists complaints_owner_read on public.complaints;
create policy complaints_owner_read on public.complaints
  for select to authenticated using (manages_station(complaints.station_id));

-- ── ٥ · الدوالُّ التي كانت تفحص المالك ──────────────────────────────────
-- الجهازُ يعرف صاحبَه: الإيقافُ يفصل أجهزةَ الرقم وحدَه لا أجهزةَ المحطة كلِّها.
alter table public.device_tokens add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists device_tokens_user_idx on public.device_tokens(user_id) where user_id is not null;

-- 20260819g_owner_web_push.sql:44-77 — التوقيعُ نفسُه، فالمنحُ يبقى.
create or replace function public.claim_owner_device(
  p_token      text,
  p_station_id uuid,
  p_platform   text default null,
  p_keys       jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not manages_station(p_station_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_platform is null then
    update device_tokens set station_id = p_station_id, user_id = auth.uid() where token = p_token;
    return;
  end if;

  insert into device_tokens (token, platform, station_id, keys, user_id)
  values (p_token, p_platform, p_station_id, p_keys, auth.uid())
  on conflict (token) do update
     set station_id = excluded.station_id,
         user_id    = excluded.user_id,
         keys       = coalesce(excluded.keys, device_tokens.keys);
end
$fn$;

-- 20260819e_station_audience.sql — السطرُ الواحد يتبدّل.
create or replace function public.station_audience(p_station uuid)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  st stations;
  caller_role text;
begin
  select * into st from stations where id = p_station;
  if not found then raise exception 'no station' using errcode = '42704'; end if;

  select p.role::text into caller_role from profiles p where p.id = auth.uid();
  if not manages_station(p_station) and caller_role is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return json_build_object(
    'watchers', (
      select count(distinct a.address) from alerts a
       where a.station_id is null
         and (a.city is null or a.city = st.city)
    ),
    'followers', (
      select count(distinct a.address) from alerts a where a.station_id = st.id
    ),
    'city', st.city
  );
end
$fn$;

-- 20260915c_silence_views.sql — السطرُ نفسُه.
create or replace function public.silence_seen_count(p_station uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not manages_station(p_station)
     and (select p.role from public.profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select v.views into n from public.silence_views v where v.station_id = p_station;
  return coalesce(n, 0);
end;
$$;

-- ── ٦ · محطتي — تحلّ محلّ .eq('owner_id', uid) في لوحة المالك ──────────
-- ما يملكه قبل ما يديره، والأقدمُ كما كان (app/owner/page.tsx: الأقدم).
create or replace function public.my_station()
returns setof public.stations
language sql
stable
security definer
set search_path = public
as $$
  select s.* from stations s
   where s.owner_id = auth.uid()
      or s.id = (select m.station_id from station_managers m where m.user_id = auth.uid() and m.active)
   order by (s.owner_id = auth.uid()) desc, s.created_at
   limit 1;
$$;
revoke all on function public.my_station() from public, anon;
grant execute on function public.my_station() to authenticated;

-- ── ٧ · الإيقافُ يفصل أجهزةَ الرقم وتيليغرامَه، والتشغيلُ يعيدها ────────
create or replace function public.station_manager_toggle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.active then
    update device_tokens set station_id = new.station_id
     where user_id = new.user_id and station_id is null;
    return null;
  end if;
  if tg_op = 'UPDATE' and old.active = new.active then
    return null;
  end if;
  update device_tokens set station_id = null where user_id = old.user_id;
  -- telegram_links.phone تحمل النواة 7XXXXXXXXX (telegram/index.ts: core)
  delete from telegram_links where station_id = old.station_id and phone = substr(old.phone, 2);
  return null;
end;
$$;
drop trigger if exists station_managers_toggle_trg on public.station_managers;
create trigger station_managers_toggle_trg
  after update of active or delete on public.station_managers
  for each row execute function public.station_manager_toggle();

-- ── ٨ · السجلّ ─────────────────────────────────────────────────────────────
create table if not exists public.station_updates (
  id         bigint generated always as identity primary key,
  station_id uuid not null references public.stations(id) on delete cascade,
  product    public.fuel_product,  -- null = على مستوى المحطة أو «تأكيد»
  change     jsonb not null,       -- {"is_available": true} … أو {"confirm": true}
  actor      uuid,                 -- auth.uid()؛ null = النظام (كرون) أو البوتات
  created_at timestamptz not null default now()
);
create index if not exists station_updates_station_idx on public.station_updates(station_id, created_at desc);
-- «تأكيدُ التوفّر» يختم صفوفَ المنتجات كلَّها → صفٌّ واحدٌ في الدقيقة لكلّ فاعل.
-- date_trunc على timestamptz «مستقرّة» لا «ثابتة» (تتبع المنطقة الزمنيّة) فلا
-- تصلح في فهرس؛ بتحويلها إلى UTC أوّلاً تصير ثابتة.
create unique index if not exists station_updates_confirm_once_idx
  on public.station_updates (station_id,
      coalesce(actor, '00000000-0000-0000-0000-000000000000'::uuid),
      date_trunc('minute', created_at at time zone 'UTC'))
  where change ? 'confirm';
alter table public.station_updates enable row level security;
revoke all on public.station_updates from anon, authenticated;
grant select on public.station_updates to authenticated;
drop policy if exists "station_updates: members and admin read" on public.station_updates;
create policy "station_updates: members and admin read" on public.station_updates
  for select using (
    manages_station(station_id)
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

comment on table public.station_updates is
  'سجلُّ تحديثات المحطة: من (actor = حسابُ الرقم) غيّر ماذا ومتى. يُقلَّم بعد ٩٠ يوماً.';

create or replace function public.log_station_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff jsonb;
  sid uuid;
  prod public.fuel_product;
begin
  select jsonb_object_agg(n.key, n.value) into diff
    from jsonb_each(to_jsonb(new)) n
   where n.key in ('is_available','traffic_level','runs_out_at','expected_at',
                   'expected_period','expected_time','temp_closed','manual_traffic_level')
     and n.value is distinct from (to_jsonb(old) -> n.key);
  if tg_table_name = 'station_products' then
    sid := new.station_id; prod := new.product;
    if diff is null and new.updated_at is distinct from old.updated_at then
      diff := '{"confirm": true}'::jsonb; prod := null;
    end if;
  else
    sid := new.id;
  end if;
  if diff is null then return null; end if;
  -- clear_stale_traffic كلَّ خمس دقائق: مسحُ الازدحام بلا فاعلٍ ضجيجٌ لا خبر.
  if auth.uid() is null and (diff - 'traffic_level' - 'manual_traffic_level') = '{}'::jsonb then
    return null;
  end if;
  insert into station_updates (station_id, product, change, actor)
  values (sid, prod, diff, auth.uid())
  on conflict do nothing;
  return null;
end;
$$;
drop trigger if exists station_products_log_trg on public.station_products;
create trigger station_products_log_trg
  after update on public.station_products
  for each row execute function public.log_station_update();
drop trigger if exists stations_log_trg on public.stations;
create trigger stations_log_trg
  after update of temp_closed, manual_traffic_level on public.stations
  for each row execute function public.log_station_update();

-- ── ٩ · التقليم: ٩٠ يوماً ────────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'station-updates-prune';
select cron.schedule('station-updates-prune', '17 3 * * *',
  $$delete from public.station_updates where created_at < now() - interval '90 days'$$);

-- ── ١٠ · يسقط الترحيلُ هنا لا الزرُّ لاحقاً ─────────────────────────────
do $$ begin
  assert public.manages_station(gen_random_uuid(), null) = false;
  assert (select count(*) from pg_policies
           where policyname in ('stations: owner read own','stations: owner update own',
                                'station_products: owner write own','station_messages: owner reads own',
                                'station_messages: owner writes own','station_messages: owner marks read',
                                'complaints_owner_read')
             and (coalesce(qual,'') || coalesce(with_check,'')) like '%manages_station%') = 7;
  assert exists (select 1 from pg_trigger where tgrelid = 'public.stations'::regclass and tgname = 'stations_guard_trg');
  assert exists (select 1 from cron.job where jobname = 'station-updates-prune');
end $$;

commit;

-- «غسيل» M3: الإغلاقُ الاستثنائيّ، إيقافُ الحجوزات، والحجزُ اليدويّ (Walk-in).
--
-- الوثيقة §57–60: عيدٌ أو صيانة = wash_closures بلا مساسٍ بالدوام؛ «إيقاف استقبال
-- الحجوزات» ٣٠ دقيقة/ساعة/اليوم/حتى الإلغاء = bookings_paused_until؛ وسيّارةٌ دخلت
-- بلا تطبيق يسجّلها الموظّف فيُحجز مسربُها ولا يُعرض للناس.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جداولُ wash_* وحدَها. التراجع: drop function add_walk_in(...); drop table wash_closures;
--   alter table car_washes drop column bookings_paused_until; إعادةُ wash_slots من 20260918b.
begin;

create table if not exists public.wash_closures (
  id        uuid primary key default gen_random_uuid(),
  wash_id   uuid not null references public.car_washes(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null check (ends_at > starts_at),
  reason    text check (reason is null or char_length(reason) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists wash_closures_wash_idx on public.wash_closures(wash_id, starts_at);
alter table public.wash_closures enable row level security;
grant select on public.wash_closures to anon, authenticated;
grant insert, update, delete on public.wash_closures to authenticated;
drop policy if exists "wash_closures: public read published" on public.wash_closures;
create policy "wash_closures: public read published" on public.wash_closures for select
  using (wash_is_published(wash_id) or manages_wash(wash_id));
drop policy if exists "wash_closures: owner writes own" on public.wash_closures;
create policy "wash_closures: owner writes own" on public.wash_closures for all
  using (manages_wash(wash_id)) with check (manages_wash(wash_id));

alter table public.car_washes add column if not exists bookings_paused_until timestamptz;
comment on column public.car_washes.bookings_paused_until is 'لا حجوزاتٍ جديدةً حتى هذا الوقت — الصفحةُ تبقى ظاهرة.';

-- الحجزُ اليدويّ بلا هاتف.
alter table public.wash_bookings alter column phone drop not null;
alter table public.wash_bookings drop constraint if exists wash_bookings_phone_check;
alter table public.wash_bookings add constraint wash_bookings_phone_check check (phone is null or phone ~ '^07\d{9}$');

-- ── العرضُ العامّ: paused في آخره ──────────────────────────────────────────
create or replace view public.washes_public with (security_invoker = false) as
  select w.id, w.name, w.city, w.address, w.lat, w.lng, w.image_url, w.is_24h, w.opens_at, w.closes_at,
         w.temp_closed, w.bays, w.slot_minutes, w.loyalty_target, w.created_at,
         case when w.phone_hidden then null else w.phone end as phone,
         exists (select 1 from wash_offers o where o.wash_id = w.id and o.active
                    and (o.ends_at is null or o.ends_at >= (now() at time zone 'Asia/Baghdad')::date)) as has_offer,
         coalesce(w.bookings_paused_until > now(), false) as paused
    from car_washes w
   where wash_published(w);
grant select on public.washes_public to anon, authenticated;

-- ── المواعيد: لا شيءَ أثناء الإيقاف، ولا داخلَ إغلاقٍ استثنائيّ ─────────────
create or replace function public.wash_slots(p_wash uuid, p_day date, p_service uuid default null)
returns table (slot time, free integer)
language plpgsql stable security definer set search_path = public as $$
declare
  w car_washes;
  dur int; open_m int; close_m int; m int; n int;
  now_bgd timestamp := (now() at time zone 'Asia/Baghdad');
  min_m int; s_at timestamptz;
begin
  select * into w from car_washes x where x.id = p_wash;
  if not found or not wash_published(w) or w.temp_closed then return; end if;
  if w.bookings_paused_until is not null and w.bookings_paused_until > now() then return; end if;
  dur := coalesce((select s.minutes from wash_services s where s.id = p_service and s.wash_id = p_wash), w.slot_minutes);
  open_m := extract(hour from w.opens_at)::int * 60 + extract(minute from w.opens_at)::int;
  close_m := extract(hour from w.closes_at)::int * 60 + extract(minute from w.closes_at)::int;
  if w.is_24h then open_m := 0; close_m := 1440; end if;
  min_m := case when p_day = now_bgd::date then extract(hour from now_bgd)::int * 60 + extract(minute from now_bgd)::int + 20
                when p_day < now_bgd::date then 100000 else -1 end;
  for m in select generate_series(0, 1439, w.slot_minutes) loop
    if not (w.is_24h
            or (close_m > open_m and m >= open_m and m + dur <= close_m)
            or (close_m <= open_m and (m >= open_m or m + dur <= close_m))) then continue; end if;
    if m < min_m then continue; end if;
    s_at := (p_day::timestamp + make_interval(mins => m)) at time zone 'Asia/Baghdad';
    if exists (select 1 from wash_closures c where c.wash_id = p_wash and c.starts_at < s_at + make_interval(mins => dur) and c.ends_at > s_at) then continue; end if;
    select count(*)::int into n from wash_bookings b
     where b.wash_id = p_wash and b.status in ('pending','confirmed','arrived','in_service')
       and b.starts_at < s_at + make_interval(mins => dur) and coalesce(b.ends_at, b.starts_at + interval '30 minutes') > s_at;
    slot := make_time(m / 60, m % 60, 0);
    free := w.bays - n;
    if free > 0 then return next; end if;
  end loop;
end $$;

-- ── الحجزُ اليدويّ: الموظّفُ يسجّل سيّارةً دخلت الآن ──────────────────────
create or replace function public.add_walk_in(
  p_wash uuid, p_service uuid, p_day date, p_slot time, p_name text,
  p_phone text default null, p_car text default null, p_vehicle text default null
)
returns json language plpgsql security definer set search_path = public set lock_timeout = '2s' as $$
declare w car_washes; s wash_services; b wash_bookings; core text; starts timestamptz; n int; new_code text; price int;
begin
  if not manages_wash(p_wash) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'اكتب اسم الزبون'; end if;
  if p_phone is not null and btrim(p_phone) <> '' then
    core := '0' || regexp_replace(regexp_replace(regexp_replace(p_phone, '\D', '', 'g'), '^(00)?964', ''), '^0+', '');
    if core !~ '^07\d{9}$' then raise exception 'رقم الهاتف غير صحيح'; end if;
  end if;
  select * into w from car_washes x where x.id = p_wash for update;
  select * into s from wash_services x where x.id = p_service and x.wash_id = p_wash;
  if not found then raise exception 'اختر خدمة'; end if;
  starts := (p_day::timestamp + p_slot) at time zone 'Asia/Baghdad';
  -- السعةُ فقط: لا حدودَ مواطنٍ ولا إيقافٌ يمنع الموظّف.
  select count(*)::int into n from wash_bookings x
   where x.wash_id = p_wash and x.status in ('pending','confirmed','arrived','in_service')
     and x.starts_at < starts + make_interval(mins => s.minutes) and coalesce(x.ends_at, x.starts_at + interval '30 minutes') > starts;
  if n >= w.bays then raise exception 'المساربُ مشغولةٌ في هذا الوقت'; end if;
  price := coalesce((s.prices->>p_vehicle)::int, s.price);
  loop
    new_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from wash_bookings x where x.code = new_code);
  end loop;
  insert into wash_bookings (code, wash_id, service_id, service_name, price, starts_at, ends_at, name, phone, car, vehicle, status, status_at, walk_in)
  values (new_code, p_wash, s.id, s.name, price, starts, starts + make_interval(mins => s.minutes), btrim(p_name), core,
          nullif(btrim(coalesce(p_car, '')), ''), case when p_vehicle in ('sedan','suv','pickup','van','other') then p_vehicle end, 'arrived', now(), true)
  returning * into b;
  return json_build_object('id', b.id, 'code', b.code, 'starts_at', b.starts_at, 'service', b.service_name, 'price', b.price);
end $$;
revoke all on function public.add_walk_in(uuid, uuid, date, time, text, text, text, text) from public;
grant execute on function public.add_walk_in(uuid, uuid, date, time, text, text, text, text) to authenticated;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'wash_slots') = 1, 'wash_slots مكرّرة';
  assert (select count(*) from pg_proc where proname = 'add_walk_in') = 1, 'add_walk_in غائبة';
  assert (select count(*) from information_schema.columns where table_name = 'washes_public' and column_name = 'paused') = 1, 'paused غائب';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
end $$;

commit;

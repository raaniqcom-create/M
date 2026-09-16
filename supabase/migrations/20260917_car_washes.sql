-- «غسيل»: دليلُ مغاسل السيارات وحجزُ المواعيد — قسمٌ منفصلٌ عن الوقود تماماً.
--
-- «قسمٌ غيرُ منشور للإدارة فقط: مغاسلُ السيارات تسجّل مقابل اشتراكٍ شهريّ،
-- والمواطنُ يحجز موعداً مجّاناً داخل المنصّة، وأولويّةٌ لمشتركي المحطة التقنية،
-- وعروضٌ مثل ٥ غسلات والسادسة مجّاناً» — صاحبُ المنصّة، ١٦ أيلول.
--
-- ── المبادئ ────────────────────────────────────────────────────────────────
-- · صاحبُ المغسلة يسجّل بنفسه (حسابُ هاتفٍ كالمحطات) والإدارةُ تعتمد بعد الدفع:
--   المغسلةُ تظهر للناس فقط إن كانت approved و paid_until لم يمضِ — يُقيَّم عند
--   القراءة بلا كرون.
-- · الحجزُ «بانتظار التأكيد» حتى يقبله صاحبُ المغسلة. المواطنُ بلا حساب: الاسمُ
--   والهاتفُ يُكتبان، والهاتفُ مفتاحُ التكرار والولاء والغياب.
-- · الأولويّة: من عنوانُه في alerts أو device_tokens (مشتركُ التنبيهات) يحجز
--   حتى ثلاثة أيّامٍ مقدّماً وحجزين نشطين؛ غيرُه اليومَ والغدَ وحجزاً واحداً.
-- · كلُّ كتابةٍ من المواطن عبر RPC — لا منحَ لـanon على الجداول.
-- · statusُ نصٌّ بقيدٍ لا enum (20260906_branch_viewer.sql: «جدولٌ لا قيمةُ enum»).
begin;

-- ── ١ · المغاسل ────────────────────────────────────────────────────────────
create table if not exists public.car_washes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 2 and 60),
  city           text not null,
  address        text not null,
  phone          text not null check (phone ~ '^07\d{9}$'),
  phone_hidden   boolean not null default false,
  lat            double precision not null,
  lng            double precision not null,
  image_url      text,
  is_24h         boolean not null default false,
  opens_at       time not null default '08:00',
  closes_at      time not null default '20:00',
  temp_closed    boolean not null default false,
  bays           smallint not null default 1 check (bays between 1 and 10),
  slot_minutes   smallint not null default 30 check (slot_minutes in (15, 30, 45, 60)),
  loyalty_target smallint not null default 5 check (loyalty_target between 0 and 20),
  status         text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  plan           text not null default 'monthly' check (plan in ('monthly','quarterly','free')),
  paid_until     date,
  admin_note     text,
  created_at     timestamptz not null default now()
);
create index if not exists car_washes_owner_idx on public.car_washes(owner_id);
create index if not exists car_washes_city_idx  on public.car_washes(city) where status = 'approved';

create table if not exists public.wash_services (
  id       uuid primary key default gen_random_uuid(),
  wash_id  uuid not null references public.car_washes(id) on delete cascade,
  name     text not null check (char_length(btrim(name)) between 2 and 40),
  price    integer not null default 0 check (price >= 0),
  minutes  smallint not null default 30 check (minutes between 5 and 240),
  sort     smallint not null default 0,
  active   boolean not null default true
);
create index if not exists wash_services_wash_idx on public.wash_services(wash_id);

create table if not exists public.wash_offers (
  id         uuid primary key default gen_random_uuid(),
  wash_id    uuid not null references public.car_washes(id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 2 and 80),
  ends_at    date,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists wash_offers_wash_idx on public.wash_offers(wash_id);

create table if not exists public.wash_bookings (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  wash_id       uuid not null references public.car_washes(id) on delete cascade,
  service_id    uuid references public.wash_services(id) on delete set null,
  service_name  text not null,
  price         integer not null default 0,
  starts_at     timestamptz not null,
  name          text not null check (char_length(btrim(name)) between 2 and 40),
  phone         text not null check (phone ~ '^07\d{9}$'),
  car           text check (car is null or char_length(car) <= 40),
  device        text,
  is_subscriber boolean not null default false,
  use_free      boolean not null default false,
  status        text not null default 'pending' check (status in ('pending','confirmed','completed','no_show','cancelled')),
  status_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists wash_bookings_slot_idx   on public.wash_bookings(wash_id, starts_at) where status in ('pending','confirmed');
create index if not exists wash_bookings_phone_idx  on public.wash_bookings(phone, created_at desc);
create index if not exists wash_bookings_device_idx on public.wash_bookings(device, created_at desc) where device is not null;

create table if not exists public.wash_stamps (
  wash_id      uuid not null references public.car_washes(id) on delete cascade,
  phone        text not null,
  stamps       smallint not null default 0,
  free_credits smallint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (wash_id, phone)
);

comment on table public.car_washes is 'مغاسلُ السيارات (قسم «غسيل»). تظهر للناس حين status=approved وpaid_until لم يمضِ.';
comment on table public.wash_bookings is 'حجوزاتُ الغسل: الكتابةُ عبر book_wash وset_wash_booking_status فقط.';

-- ── ٢ · المسندان ───────────────────────────────────────────────────────────
-- يُمنح لـanon عمداً كما manages_station: قد يقع داخل سياساتٍ بلا «to».
create or replace function public.manages_wash(p_wash uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_user is null then false else
       exists (select 1 from car_washes w where w.id = p_wash and w.owner_id = p_user)
    or exists (select 1 from profiles p where p.id = p_user and p.role = 'admin')
  end;
$$;
revoke all on function public.manages_wash(uuid, uuid) from public;
grant execute on function public.manages_wash(uuid, uuid) to anon, authenticated, service_role;

create or replace function public.wash_published(w public.car_washes)
returns boolean language sql stable as $$
  select w.status = 'approved' and w.paid_until is not null and w.paid_until >= (now() at time zone 'Asia/Baghdad')::date;
$$;

-- ── ٣ · الحارس: غيرُ الإدارة لا يعتمد نفسَه ولا يدفع لنفسه ───────────────
create or replace function public.car_washes_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin boolean;
begin
  new.name := btrim(new.name);
  admin := auth.uid() is null or exists (select 1 from profiles where id = auth.uid() and role = 'admin');
  if admin then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.paid_until := null; new.plan := 'monthly'; new.admin_note := null;
  else
    new.status := old.status; new.owner_id := old.owner_id; new.paid_until := old.paid_until;
    new.plan := old.plan; new.admin_note := old.admin_note;
  end if;
  return new;
end $$;
drop trigger if exists car_washes_guard_trg on public.car_washes;
create trigger car_washes_guard_trg before insert or update on public.car_washes
  for each row execute function public.car_washes_guard();

-- ── ٤ · العرضُ العامّ: المنشورةُ فقط، والهاتفُ مخفيٌّ إن أراد ────────────
create or replace view public.washes_public with (security_invoker = false) as
  select w.id, w.name, w.city, w.address, w.lat, w.lng, w.image_url, w.is_24h, w.opens_at, w.closes_at,
         w.temp_closed, w.bays, w.slot_minutes, w.loyalty_target, w.created_at,
         case when w.phone_hidden then null else w.phone end as phone,
         exists (select 1 from wash_offers o where o.wash_id = w.id and o.active
                    and (o.ends_at is null or o.ends_at >= (now() at time zone 'Asia/Baghdad')::date)) as has_offer
    from car_washes w
   where wash_published(w);
grant select on public.washes_public to anon, authenticated;

-- ── ٥ · RLS ────────────────────────────────────────────────────────────────
alter table public.car_washes    enable row level security;
alter table public.wash_services enable row level security;
alter table public.wash_offers   enable row level security;
alter table public.wash_bookings enable row level security;
alter table public.wash_stamps   enable row level security;

revoke all on public.car_washes, public.wash_services, public.wash_offers, public.wash_bookings, public.wash_stamps from anon, authenticated;
grant select, insert, update on public.car_washes to authenticated;
grant select on public.wash_services, public.wash_offers to anon, authenticated;
grant insert, update, delete on public.wash_services, public.wash_offers to authenticated;
grant select on public.wash_bookings, public.wash_stamps to authenticated;

drop policy if exists "car_washes: owner and admin read" on public.car_washes;
create policy "car_washes: owner and admin read" on public.car_washes for select using (manages_wash(id));
drop policy if exists "car_washes: owner inserts own" on public.car_washes;
create policy "car_washes: owner inserts own" on public.car_washes for insert with check (owner_id = auth.uid());
drop policy if exists "car_washes: owner and admin update" on public.car_washes;
create policy "car_washes: owner and admin update" on public.car_washes for update using (manages_wash(id));

drop policy if exists "wash_services: public read published" on public.wash_services;
create policy "wash_services: public read published" on public.wash_services for select
  using (exists (select 1 from car_washes w where w.id = wash_id and (wash_published(w) or manages_wash(w.id))));
drop policy if exists "wash_services: owner writes own" on public.wash_services;
create policy "wash_services: owner writes own" on public.wash_services for all
  using (manages_wash(wash_id)) with check (manages_wash(wash_id));

drop policy if exists "wash_offers: public read published" on public.wash_offers;
create policy "wash_offers: public read published" on public.wash_offers for select
  using (exists (select 1 from car_washes w where w.id = wash_id and (wash_published(w) or manages_wash(w.id))));
drop policy if exists "wash_offers: owner writes own" on public.wash_offers;
create policy "wash_offers: owner writes own" on public.wash_offers for all
  using (manages_wash(wash_id)) with check (manages_wash(wash_id));

drop policy if exists "wash_bookings: owner and admin read" on public.wash_bookings;
create policy "wash_bookings: owner and admin read" on public.wash_bookings for select using (manages_wash(wash_id));
drop policy if exists "wash_stamps: owner and admin read" on public.wash_stamps;
create policy "wash_stamps: owner and admin read" on public.wash_stamps for select using (manages_wash(wash_id));

-- ── ٦ · المواعيدُ المتاحة ليوم ─────────────────────────────────────────────
-- شبكةٌ من الدوام × مدّة الموعد، وسعةُ كلّ موعدٍ عددُ المسارب ناقصَ المحجوز
-- (المعلّقُ والمؤكَّد). الماضي والدقائقُ العشرون القادمة لا تُعرض.
create or replace function public.wash_slots(p_wash uuid, p_day date)
returns table (slot time, free integer)
language plpgsql stable security definer set search_path = public as $$
declare
  w car_washes;
  open_m int; close_m int; m int; n int;
  now_bgd timestamp := (now() at time zone 'Asia/Baghdad');
  min_m int;
begin
  select * into w from car_washes x where x.id = p_wash;
  if not found or not wash_published(w) or w.temp_closed then return; end if;
  open_m := extract(hour from w.opens_at)::int * 60 + extract(minute from w.opens_at)::int;
  close_m := extract(hour from w.closes_at)::int * 60 + extract(minute from w.closes_at)::int;
  if w.is_24h then open_m := 0; close_m := 1440; end if;
  -- أوّلُ موعدٍ مسموح: بعد الآن بعشرين دقيقة إن كان اليومُ هو اليوم.
  min_m := case when p_day = now_bgd::date then extract(hour from now_bgd)::int * 60 + extract(minute from now_bgd)::int + 20
                when p_day < now_bgd::date then 100000 else -1 end;
  for m in select generate_series(0, 1439, w.slot_minutes) loop
    -- داخلَ الدوام، ولو عبر منتصفَ الليل (18:00 → 02:00).
    if not (w.is_24h
            or (close_m > open_m and m >= open_m and m < close_m)
            or (close_m <= open_m and (m >= open_m or m < close_m))) then continue; end if;
    if m < min_m then continue; end if;
    select count(*)::int into n from wash_bookings b
     where b.wash_id = p_wash and b.status in ('pending','confirmed')
       and b.starts_at = ((p_day::timestamp + make_interval(mins => m)) at time zone 'Asia/Baghdad');
    slot := make_time(m / 60, m % 60, 0);
    free := w.bays - n;
    if free > 0 then return next; end if;
  end loop;
end $$;
revoke all on function public.wash_slots(uuid, date) from public;
grant execute on function public.wash_slots(uuid, date) to anon, authenticated;

-- ── ٧ · الحجز ─────────────────────────────────────────────────────────────
create or replace function public.book_wash(
  p_wash uuid, p_service uuid, p_day date, p_slot time,
  p_name text, p_phone text, p_car text default null, p_device text default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  w car_washes; s wash_services;
  core text; today date := (now() at time zone 'Asia/Baghdad')::date;
  subscriber boolean := false; horizon int; active_n int; code text;
  starts timestamptz; free_n int; use_free boolean := false; b wash_bookings;
begin
  core := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  core := regexp_replace(core, '^(00)?964', '');
  core := '0' || regexp_replace(core, '^0+', '');
  if core !~ '^07\d{9}$' then raise exception 'رقم الهاتف غير صحيح. اكتبه هكذا: 07901234567'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'اكتب اسمك'; end if;

  select * into w from car_washes x where x.id = p_wash for update;
  if not found or not wash_published(w) then raise exception 'المغسلة غير متاحة الآن'; end if;
  if w.temp_closed then raise exception 'المغسلة مغلقة مؤقّتاً'; end if;
  select * into s from wash_services x where x.id = p_service and x.wash_id = p_wash and x.active;
  if not found then raise exception 'اختر خدمةً من قائمة المغسلة'; end if;

  -- المشتركُ: عنوانُ جهازه معروفٌ للتنبيهات.
  if p_device is not null and length(p_device) >= 8 then
    subscriber := exists (select 1 from alerts a where a.address = p_device)
               or exists (select 1 from device_tokens d where d.token = p_device);
  end if;
  horizon := case when subscriber then 3 else 1 end;
  -- غيابان خلال ثلاثين يوماً: اليومَ فقط.
  if (select count(*) from wash_bookings x where x.phone = core and x.status = 'no_show'
        and x.created_at > now() - interval '30 days') >= 2 then horizon := 0; end if;
  if p_day < today then raise exception 'هذا اليوم مضى'; end if;
  if p_day > today + horizon then
    raise exception '%', case when subscriber then 'الحجز حتى ثلاثة أيّام مقدّماً'
                              when horizon = 0 then 'لديك مواعيد فائتة، فالحجز لليوم فقط'
                              else 'الحجز لليوم والغد. فعّل التنبيهات في التطبيق لتحجز حتى ثلاثة أيّام مقدّماً' end;
  end if;

  -- الموعدُ من الشبكة المتاحة فعلاً.
  select x.free into free_n from wash_slots(p_wash, p_day) x where x.slot = p_slot;
  if free_n is null then raise exception 'هذا الموعد لم يعد متاحاً — اختر موعداً آخر'; end if;
  starts := (p_day::timestamp + p_slot) at time zone 'Asia/Baghdad';

  -- حدودُ التكرار: حجزٌ واحدٌ في المغسلة في اليوم، وحجوزٌ نشطةٌ محدودة، وخمسةٌ لكلّ جهازٍ يوميّاً.
  if exists (select 1 from wash_bookings x where x.wash_id = p_wash and x.phone = core
               and x.status in ('pending','confirmed')
               and (x.starts_at at time zone 'Asia/Baghdad')::date = p_day) then
    raise exception 'لديك حجزٌ في هذه المغسلة في اليوم نفسه';
  end if;
  select count(*)::int into active_n from wash_bookings x
   where x.phone = core and x.status in ('pending','confirmed') and x.starts_at >= now();
  if active_n >= (case when subscriber then 2 else 1 end) then
    raise exception '%', case when subscriber then 'لديك حجزان نشطان — أكمل أحدهما أو ألغِه أوّلاً'
                              else 'لديك حجزٌ نشط — أكمله أو ألغِه أوّلاً' end;
  end if;
  if p_device is not null and (select count(*) from wash_bookings x where x.device = p_device
        and x.created_at > now() - interval '1 day') >= 5 then
    raise exception 'وصلت حدَّ الحجوزات لليوم';
  end if;

  -- غسلةٌ مجّانيّة مستحقّة؟
  use_free := coalesce((select st.free_credits > 0 from wash_stamps st where st.wash_id = p_wash and st.phone = core), false);

  -- رمزٌ من ستّة أرقام، فريدٌ.
  loop
    code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from wash_bookings x where x.code = code);
  end loop;

  insert into wash_bookings (code, wash_id, service_id, service_name, price, starts_at, name, phone, car, device, is_subscriber, use_free)
  values (code, p_wash, s.id, s.name, case when use_free then 0 else s.price end, starts, btrim(p_name), core,
          nullif(btrim(coalesce(p_car, '')), ''), nullif(p_device, ''), subscriber, use_free)
  returning * into b;

  return json_build_object('id', b.id, 'code', b.code, 'starts_at', b.starts_at, 'service', b.service_name,
                           'price', b.price, 'use_free', b.use_free, 'subscriber', b.is_subscriber,
                           'wash', w.name, 'wash_phone', case when w.phone_hidden then null else w.phone end);
end $$;
revoke all on function public.book_wash(uuid, uuid, date, time, text, text, text, text) from public;
grant execute on function public.book_wash(uuid, uuid, date, time, text, text, text, text) to anon, authenticated;

-- ── ٨ · حالةُ الحجز (المالك/الإدارة)، والختمُ عند الإتمام ──────────────────
create or replace function public.set_wash_booking_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare b wash_bookings; w car_washes;
begin
  select * into b from wash_bookings x where x.id = p_id for update;
  if not found then raise exception 'no booking' using errcode = 'P0002'; end if;
  if not manages_wash(b.wash_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending','confirmed','completed','no_show','cancelled') then raise exception 'bad status'; end if;
  if p_status = 'completed' and b.status <> 'completed' then
    select * into w from car_washes x where x.id = b.wash_id;
    if b.use_free then
      update wash_stamps set free_credits = greatest(free_credits - 1, 0), updated_at = now()
       where wash_id = b.wash_id and phone = b.phone;
    elsif w.loyalty_target > 0 then
      insert into wash_stamps (wash_id, phone, stamps) values (b.wash_id, b.phone, 1)
      on conflict (wash_id, phone) do update set stamps = wash_stamps.stamps + 1, updated_at = now();
      update wash_stamps set stamps = 0, free_credits = free_credits + 1
       where wash_id = b.wash_id and phone = b.phone and stamps >= w.loyalty_target;
    end if;
  end if;
  update wash_bookings set status = p_status, status_at = now() where id = p_id;
end $$;
revoke all on function public.set_wash_booking_status(uuid, text) from public;
grant execute on function public.set_wash_booking_status(uuid, text) to authenticated;

-- ── ٩ · للمواطن: بطاقتُه، وحجزُه برمزه، والإلغاء ─────────────────────────
create or replace function public.wash_stamps_for(p_wash uuid, p_phone text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'stamps', coalesce((select stamps from wash_stamps where wash_id = p_wash and phone = p_phone), 0),
    'free', coalesce((select free_credits from wash_stamps where wash_id = p_wash and phone = p_phone), 0),
    'target', coalesce((select loyalty_target from car_washes where id = p_wash), 0));
$$;
revoke all on function public.wash_stamps_for(uuid, text) from public;
grant execute on function public.wash_stamps_for(uuid, text) to anon, authenticated;

create or replace function public.wash_booking_by_code(p_code text, p_phone text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', b.id, 'code', b.code, 'status', b.status, 'starts_at', b.starts_at,
                           'service', b.service_name, 'price', b.price, 'use_free', b.use_free,
                           'name', b.name, 'car', b.car,
                           'wash', w.name, 'wash_id', w.id, 'address', w.address, 'lat', w.lat, 'lng', w.lng,
                           'wash_phone', case when w.phone_hidden then null else w.phone end)
    from wash_bookings b join car_washes w on w.id = b.wash_id
   where b.code = p_code and b.phone = p_phone;
$$;
revoke all on function public.wash_booking_by_code(text, text) from public;
grant execute on function public.wash_booking_by_code(text, text) to anon, authenticated;

create or replace function public.cancel_wash_booking(p_code text, p_phone text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update wash_bookings set status = 'cancelled', status_at = now()
   where code = p_code and phone = p_phone and status in ('pending','confirmed') and starts_at > now();
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.cancel_wash_booking(text, text) from public;
grant execute on function public.cancel_wash_booking(text, text) to anon, authenticated;

-- ── ١٠ · مغسلتي (للدخول واللوحة) ──────────────────────────────────────────
create or replace function public.my_wash()
returns setof public.car_washes language sql stable security definer set search_path = public as $$
  select * from car_washes where owner_id = auth.uid() order by created_at limit 1;
$$;
revoke all on function public.my_wash() from public, anon;
grant execute on function public.my_wash() to authenticated;

-- ── ١١ · الإدارة ───────────────────────────────────────────────────────────
create or replace function public.admin_set_wash(p_id uuid, p_status text default null, p_plan text default null, p_paid_until date default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update car_washes
     set status = coalesce(p_status, status),
         plan = coalesce(p_plan, plan),
         paid_until = coalesce(p_paid_until, paid_until)
   where id = p_id;
  if not found then raise exception 'no wash' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.admin_set_wash(uuid, text, text, date) from public;
grant execute on function public.admin_set_wash(uuid, text, text, date) to authenticated;

create or replace function public.wash_admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return json_build_object(
    'live',     (select count(*) from car_washes w where wash_published(w)),
    'pending',  (select count(*) from car_washes where status = 'pending'),
    'expiring', (select count(*) from car_washes where status = 'approved' and paid_until between today and today + 7),
    'expired',  (select count(*) from car_washes where status = 'approved' and paid_until < today),
    'today',    (select count(*) from wash_bookings where (starts_at at time zone 'Asia/Baghdad')::date = today and status in ('pending','confirmed','completed')),
    'month',    (select count(*) from wash_bookings where created_at > now() - interval '30 days')
  );
end $$;
revoke all on function public.wash_admin_stats() from public, anon;
grant execute on function public.wash_admin_stats() to authenticated;

-- ── ١٢ · «wash» مسارٌ محجوز — نسخةُ 20260916_station_managers.sql مع الكلمة ──
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
                        'schedule','place','wash','dori','abwat','manifest.json','sw.js')
          or exists (select 1 from stations s where s.slug = candidate and s.id <> new.id)
    loop
      n := n + 1;
      candidate := station_slug(new.name, new.id) || '-' || n::text;
    end loop;
    new.slug := candidate;
  end if;

  if auth.uid() is null
     or exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
  else
    new.status := old.status;
    new.owner_id := old.owner_id;
    new.phone := old.phone;
  end if;
  return new;
end $function$;

-- ── ١٣ · الصور: حاوية «wash» عامّةُ القراءة، والمالكُ يكتب في مجلّد مغسلته ──
insert into storage.buckets (id, name, public) values ('wash', 'wash', true) on conflict (id) do nothing;
drop policy if exists "wash: public read" on storage.objects;
create policy "wash: public read" on storage.objects for select using (bucket_id = 'wash');
drop policy if exists "wash: owner writes own folder" on storage.objects;
create policy "wash: owner writes own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'wash' and manages_wash(((storage.foldername(name))[1])::uuid));
drop policy if exists "wash: owner replaces own folder" on storage.objects;
create policy "wash: owner replaces own folder" on storage.objects for update to authenticated
  using (bucket_id = 'wash' and manages_wash(((storage.foldername(name))[1])::uuid));

-- ── ١٤ · يسقط الترحيلُ هنا لا الزرُّ لاحقاً ─────────────────────────────
do $$ begin
  assert public.manages_wash(gen_random_uuid(), null) = false;
  assert exists (select 1 from pg_views where viewname = 'washes_public');
  assert (select count(*) from pg_proc where proname in ('wash_slots','book_wash','set_wash_booking_status','my_wash','admin_set_wash','wash_admin_stats','wash_stamps_for','wash_booking_by_code','cancel_wash_booking')) = 9;
  assert (select prosrc from pg_proc where proname = 'stations_guard') like '%''wash''%';
  assert exists (select 1 from storage.buckets where id = 'wash');
end $$;

commit;

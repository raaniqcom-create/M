-- «غسيل» M2: محرّكُ الحجز v2 — الحالاتُ التسع، السجلُّ والصندوق، التأكيدُ التلقائيّ،
-- أسعارُ نوع السيارة، السعةُ بالتداخل، والحدودُ من الإدارة، وحارسُ تخمين الرمز.
--
-- الوثيقة §12–19, 47–48, 51–53, 62, 78: لا حجزَ مزدوجاً (قفلُ صفّ المغسلة كما كان)،
-- ولا حجزَ مكرّراً عند إعادة المحاولة (client_key)، وكلُّ رقمٍ من app_config.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جداولُ wash_* وحدَها؛ قراءةُ alerts/device_tokens نقطيّةٌ كما كانت. التراجع:
--   drop trigger wash_booking_log_trg on wash_bookings; drop function wash_booking_log(), wash_tick(),
--     wash_lookup_guard(text), wash_lookup_miss(text), wash_slots(uuid,date,uuid), book_wash(uuid,uuid,date,time,text,text,text,text,text,uuid,uuid),
--     set_wash_booking_status(uuid,text,text); drop table wash_events, wash_lookup_fails;
--   alter table wash_bookings drop column vehicle, ends_at, offer_id, walk_in, late, reminded_at, client_key;
--   alter table wash_services drop column prices, description; ثمّ إعادةُ الدوالّ من 20260917/20260917d.
begin;

-- ── ١ · الحجوزات: الحالاتُ التسع وأعمدةٌ جديدة ─────────────────────────────
alter table public.wash_bookings drop constraint if exists wash_bookings_status_check;
alter table public.wash_bookings add constraint wash_bookings_status_check
  check (status in ('pending','confirmed','arrived','in_service','completed','no_show','cancelled','cancelled_by_business','expired'));
alter table public.wash_bookings
  add column if not exists vehicle     text check (vehicle is null or vehicle in ('sedan','suv','pickup','van','other')),
  add column if not exists ends_at     timestamptz,
  add column if not exists offer_id    uuid references public.wash_offers(id) on delete set null,
  add column if not exists walk_in     boolean not null default false,
  add column if not exists late        boolean not null default false,
  add column if not exists reminded_at timestamptz,
  add column if not exists client_key  uuid;
update public.wash_bookings b
   set ends_at = b.starts_at + make_interval(mins => coalesce((select s.minutes from wash_services s where s.id = b.service_id), 30))
 where b.ends_at is null;
create unique index if not exists wash_bookings_client_key_idx on public.wash_bookings(client_key) where client_key is not null;
drop index if exists public.wash_bookings_slot_idx;
create index if not exists wash_bookings_span_idx on public.wash_bookings(wash_id, starts_at, ends_at)
  where status in ('pending','confirmed','arrived','in_service');
create index if not exists wash_bookings_pending_idx on public.wash_bookings(starts_at) where status = 'pending';
create index if not exists wash_bookings_created_idx on public.wash_bookings(created_at);

-- ── ٢ · الخدمات: أسعارٌ بنوع السيارة ووصف ────────────────────────────────
alter table public.wash_services
  add column if not exists prices      jsonb,
  add column if not exists description text check (description is null or char_length(description) <= 160);
comment on column public.wash_services.prices is '{"sedan":10000,"suv":15000,…} — يغلب price حين يُذكر النوع.';

-- ── ٣ · السجلُّ وصندوقُ الإشعارات معاً ────────────────────────────────────
create table if not exists public.wash_events (
  id         bigint generated always as identity primary key,
  wash_id    uuid not null references public.car_washes(id) on delete cascade,
  booking_id uuid references public.wash_bookings(id) on delete cascade,
  kind       text not null,
  payload    jsonb,
  actor      uuid,
  actor_kind text not null check (actor_kind in ('citizen','owner','admin','system')),
  dedupe     text unique,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  sent_n     smallint not null default 0,
  error      text
);
comment on table public.wash_events is 'تاريخُ كلّ حجزٍ وصندوقُ الإشعارات الصادرة: wash-tick تقرأ ما لم يُرسل.';
create index if not exists wash_events_unsent_idx  on public.wash_events(id) where sent_at is null and error is null;
create index if not exists wash_events_booking_idx on public.wash_events(booking_id, created_at);
create index if not exists wash_events_wash_idx    on public.wash_events(wash_id, created_at desc);
alter table public.wash_events enable row level security;
-- لا سياسةَ ولا منحاً: دورُ الخدمة وحدَه يقرأ ويكتب.

create table if not exists public.wash_lookup_fails (
  phone text not null,
  hour  timestamptz not null,
  n     integer not null default 1,
  primary key (phone, hour)
);
alter table public.wash_lookup_fails enable row level security;

create or replace function public.wash_lookup_guard(p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select f.n from wash_lookup_fails f where f.phone = p_phone and f.hour = date_trunc('hour', now())), 0) >= 10 then
    raise exception 'محاولاتٌ كثيرة — حاول بعد ساعة';
  end if;
end $$;
create or replace function public.wash_lookup_miss(p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into wash_lookup_fails (phone, hour) values (p_phone, date_trunc('hour', now()))
  on conflict (phone, hour) do update set n = wash_lookup_fails.n + 1;
end $$;
revoke all on function public.wash_lookup_guard(text) from public, anon, authenticated;
revoke all on function public.wash_lookup_miss(text) from public, anon, authenticated;

-- كلُّ إدراجٍ وتغييرِ حالةٍ سطرٌ في السجلّ — ومنه تخرج الإشعارات.
create or replace function public.wash_booking_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; k text;
begin
  who := coalesce(nullif(current_setting('wash.actor', true), ''),
                  case when auth.uid() is null then 'citizen'
                       when exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') then 'admin'
                       else 'owner' end);
  if tg_op = 'INSERT' then
    insert into wash_events (wash_id, booking_id, kind, payload, actor, actor_kind, dedupe)
    values (new.wash_id, new.id, 'new', jsonb_build_object('status', new.status, 'starts_at', new.starts_at, 'price', new.price, 'walk_in', new.walk_in), auth.uid(), who, 'new:' || new.id)
    on conflict (dedupe) do nothing;
    if new.status = 'confirmed' then
      insert into wash_events (wash_id, booking_id, kind, payload, actor, actor_kind, dedupe)
      values (new.wash_id, new.id, 'confirmed', jsonb_build_object('starts_at', new.starts_at), auth.uid(), 'system', 'confirmed:' || new.id)
      on conflict (dedupe) do nothing;
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    k := new.status;
    insert into wash_events (wash_id, booking_id, kind, payload, actor, actor_kind, dedupe)
    values (new.wash_id, new.id, k, jsonb_build_object('from', old.status, 'starts_at', new.starts_at, 'late', new.late), auth.uid(), who, k || ':' || new.id)
    on conflict (dedupe) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists wash_booking_log_trg on public.wash_bookings;
create trigger wash_booking_log_trg after insert or update of status on public.wash_bookings
  for each row execute function public.wash_booking_log();

-- ── ٤ · المواعيدُ الحرّة: سعةٌ بالتداخل على مدّة الخدمة ───────────────────
drop function if exists public.wash_slots(uuid, date);
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
    -- المسربُ مشغولٌ ما دام حجزٌ نشطٌ يتداخل مع [البداية، البداية + المدّة).
    select count(*)::int into n from wash_bookings b
     where b.wash_id = p_wash and b.status in ('pending','confirmed','arrived','in_service')
       and b.starts_at < s_at + make_interval(mins => dur) and coalesce(b.ends_at, b.starts_at + interval '30 minutes') > s_at;
    slot := make_time(m / 60, m % 60, 0);
    free := w.bays - n;
    if free > 0 then return next; end if;
  end loop;
end $$;
revoke all on function public.wash_slots(uuid, date, uuid) from public;
grant execute on function public.wash_slots(uuid, date, uuid) to anon, authenticated;

-- ── ٥ · الحجز ────────────────────────────────────────────────────────────
drop function if exists public.book_wash(uuid, uuid, date, time, text, text, text, text);
create or replace function public.book_wash(
  p_wash uuid, p_service uuid, p_day date, p_slot time,
  p_name text, p_phone text, p_car text default null, p_device text default null,
  p_vehicle text default null, p_offer uuid default null, p_client_key uuid default null
)
returns json
language plpgsql security definer set search_path = public set lock_timeout = '2s' as $$
declare
  w car_washes; s wash_services; b wash_bookings;
  core text; today date := (now() at time zone 'Asia/Baghdad')::date;
  subscriber boolean := false; horizon int; active_n int; new_code text;
  starts timestamptz; free_n int; use_free boolean := false; price int;
  monthly_limit int; month_n int;
  f jsonb;
begin
  -- إعادةُ المحاولة بالمفتاح نفسِه تُرجع الحجزَ نفسَه — لا حجزاً ثانياً (§78).
  if p_client_key is not null then
    select * into b from wash_bookings x where x.client_key = p_client_key;
    if found then
      select * into w from car_washes x where x.id = b.wash_id;
      return json_build_object('id', b.id, 'code', b.code, 'starts_at', b.starts_at, 'service', b.service_name,
                               'price', b.price, 'use_free', b.use_free, 'subscriber', b.is_subscriber, 'status', b.status,
                               'wash', w.name, 'wash_phone', case when w.phone_hidden then null else w.phone end);
    end if;
  end if;

  core := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  core := regexp_replace(core, '^(00)?964', '');
  core := '0' || regexp_replace(core, '^0+', '');
  if core !~ '^07\d{9}$' then raise exception 'رقم الهاتف غير صحيح. اكتبه هكذا: 07901234567'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'اكتب اسمك'; end if;
  if char_length(btrim(p_name)) > 40 then raise exception 'الاسم طويل — ٤٠ حرفاً على الأكثر'; end if;
  if p_device is not null and length(p_device) > 512 then p_device := null; end if;
  if p_vehicle is not null and p_vehicle not in ('sedan','suv','pickup','van','other') then p_vehicle := null; end if;

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
  horizon := case when subscriber then wash_cfg('wash_horizon_sub', '3')::int else wash_cfg('wash_horizon_guest', '1')::int end;
  -- الغياباتُ والإلغاءاتُ المتأخّرة خلال النافذة: اليومَ فقط.
  if (select count(*) from wash_bookings x where x.phone = core and (x.status = 'no_show' or x.late)
        and x.created_at > now() - make_interval(days => wash_cfg('wash_no_show_window_days', '30')::int))
     >= wash_cfg('wash_no_show_block', '2')::int then horizon := 0; end if;
  if p_day < today then raise exception 'هذا اليوم مضى'; end if;
  if p_day > today + horizon then
    raise exception '%', case when subscriber then format('الحجز حتى %s أيّام مقدّماً', wash_cfg('wash_horizon_sub', '3'))
                              when horizon = 0 then 'لديك مواعيد فائتة، فالحجز لليوم فقط'
                              else 'الحجز لليوم والغد. فعّل التنبيهات في التطبيق لتحجز أيّاماً أكثر مقدّماً' end;
  end if;

  -- الموعدُ من الشبكة المتاحة فعلاً (بمدّة هذه الخدمة).
  select x.free into free_n from wash_slots(p_wash, p_day, s.id) x where x.slot = p_slot;
  if free_n is null then raise exception 'هذا الموعد لم يعد متاحاً — اختر موعداً آخر'; end if;
  starts := (p_day::timestamp + p_slot) at time zone 'Asia/Baghdad';

  -- حدودُ التكرار: حجزٌ واحدٌ في المغسلة في اليوم، وحجوزٌ نشطةٌ محدودة، وحدُّ الجهاز يوميّاً.
  if exists (select 1 from wash_bookings x where x.wash_id = p_wash and x.phone = core
               and x.status in ('pending','confirmed','arrived','in_service')
               and (x.starts_at at time zone 'Asia/Baghdad')::date = p_day) then
    raise exception 'لديك حجزٌ في هذه المغسلة في اليوم نفسه';
  end if;
  select count(*)::int into active_n from wash_bookings x
   where x.phone = core and x.status in ('pending','confirmed') and x.starts_at >= now();
  if active_n >= (case when subscriber then wash_cfg('wash_max_active_sub', '2')::int else wash_cfg('wash_max_active_guest', '1')::int end) then
    raise exception '%', case when active_n >= 2 then 'لديك حجزان نشطان — أكمل أحدهما أو ألغِه أوّلاً'
                              else 'لديك حجزٌ نشط — أكمله أو ألغِه أوّلاً' end;
  end if;
  if p_device is not null and (select count(*) from wash_bookings x where x.device = p_device
        and x.created_at > now() - interval '1 day') >= wash_cfg('wash_device_daily', '5')::int then
    raise exception 'وصلت حدَّ الحجوزات لليوم';
  end if;

  -- حدُّ الباقة الشهريّ للمغسلة (٠ = بلا حدّ).
  f := wash_features(w);
  monthly_limit := coalesce((f->>'booking_monthly_limit')::int, 0);
  if monthly_limit > 0 then
    select count(*)::int into month_n from wash_bookings x
     where x.wash_id = p_wash and x.status not in ('cancelled','cancelled_by_business','expired')
       and x.created_at >= date_trunc('month', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad';
    if month_n >= monthly_limit then raise exception 'المغسلة بلغت حدَّ حجوزات هذا الشهر — تواصل معها مباشرة'; end if;
  end if;

  -- السعرُ: بنوع السيارة إن ذُكر وله سعر، وإلّا سعرُ الخدمة؛ والغسلةُ المجّانيّة المستحقّة تُصفّره.
  price := coalesce((s.prices->>p_vehicle)::int, s.price);
  use_free := coalesce((select st.free_credits > 0 from wash_stamps st where st.wash_id = p_wash and st.phone = core), false);

  -- رمزٌ من ستّة أرقام، فريدٌ.
  loop
    new_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from wash_bookings x where x.code = new_code);
  end loop;

  insert into wash_bookings (code, wash_id, service_id, service_name, price, starts_at, ends_at, name, phone, car, device, is_subscriber, use_free,
                             status, status_at, vehicle, offer_id, client_key)
  values (new_code, p_wash, s.id, s.name, case when use_free then 0 else price end, starts, starts + make_interval(mins => s.minutes),
          btrim(p_name), core, nullif(btrim(coalesce(p_car, '')), ''), nullif(p_device, ''), subscriber, use_free,
          case when w.confirm_mode = 'auto' then 'confirmed' else 'pending' end, now(), p_vehicle,
          (select o.id from wash_offers o where o.id = p_offer and o.wash_id = p_wash and o.active), p_client_key)
  returning * into b;

  return json_build_object('id', b.id, 'code', b.code, 'starts_at', b.starts_at, 'service', b.service_name,
                           'price', b.price, 'use_free', b.use_free, 'subscriber', b.is_subscriber, 'status', b.status,
                           'wash', w.name, 'wash_phone', case when w.phone_hidden then null else w.phone end);
end $$;
revoke all on function public.book_wash(uuid, uuid, date, time, text, text, text, text, text, uuid, uuid) from public;
grant execute on function public.book_wash(uuid, uuid, date, time, text, text, text, text, text, uuid, uuid) to anon, authenticated;

-- ── ٦ · حالةُ الحجز: خريطةُ انتقالاتٍ لا تبديلٌ حرّ ─────────────────────────
drop function if exists public.set_wash_booking_status(uuid, text);
create or replace function public.set_wash_booking_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b wash_bookings; w car_washes; allowed boolean;
begin
  select * into b from wash_bookings x where x.id = p_id for update;
  if not found then raise exception 'no booking' using errcode = 'P0002'; end if;
  if not manages_wash(b.wash_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  allowed := case b.status
    when 'pending'    then p_status in ('confirmed','cancelled_by_business','no_show','arrived','completed')
    when 'confirmed'  then p_status in ('arrived','in_service','completed','no_show','cancelled_by_business')
    when 'arrived'    then p_status in ('in_service','completed','no_show')
    when 'in_service' then p_status in ('completed')
    else false end;
  if not allowed then raise exception 'لا يمكن نقل الحجز من «%» إلى «%»', b.status, p_status; end if;
  if p_status = 'completed' then
    select * into w from car_washes x where x.id = b.wash_id;
    if b.use_free then
      update wash_stamps set free_credits = greatest(free_credits - 1, 0), updated_at = now()
       where wash_id = b.wash_id and phone = b.phone;
    elsif w.loyalty_target > 0 and b.phone is not null then
      insert into wash_stamps (wash_id, phone, stamps) values (b.wash_id, b.phone, 1)
      on conflict (wash_id, phone) do update set stamps = wash_stamps.stamps + 1, updated_at = now();
      update wash_stamps set stamps = 0, free_credits = free_credits + 1
       where wash_id = b.wash_id and phone = b.phone and stamps >= w.loyalty_target;
    end if;
  end if;
  update wash_bookings set status = p_status, status_at = now() where id = p_id;
  if p_note is not null and btrim(p_note) <> '' then
    insert into wash_events (wash_id, booking_id, kind, payload, actor, actor_kind, sent_at)
    values (b.wash_id, b.id, 'note', jsonb_build_object('note', left(btrim(p_note), 200)), auth.uid(), 'owner', now());
  end if;
end $$;
revoke all on function public.set_wash_booking_status(uuid, text, text) from public;
grant execute on function public.set_wash_booking_status(uuid, text, text) to authenticated;

-- ── ٧ · للمواطن: الرمزُ بحارس التخمين، والإلغاءُ بسياسته ────────────────
create or replace function public.wash_booking_by_code(p_code text, p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform wash_lookup_guard(p_phone);
  select json_build_object('id', b.id, 'code', b.code, 'status', b.status, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
                           'service', b.service_name, 'price', b.price, 'use_free', b.use_free, 'late', b.late,
                           'name', b.name, 'car', b.car, 'vehicle', b.vehicle,
                           'wash', w.name, 'wash_id', w.id, 'address', w.address, 'lat', w.lat, 'lng', w.lng,
                           'wash_phone', case when w.phone_hidden then null else w.phone end,
                           'cancel_free_min', wash_cfg('wash_cancel_free_min', '30')::int,
                           'events', (select coalesce(json_agg(json_build_object('kind', e.kind, 'at', e.created_at) order by e.created_at), '[]'::json)
                                        from wash_events e where e.booking_id = b.id and e.kind <> 'note'))
    into r
    from wash_bookings b join car_washes w on w.id = b.wash_id
   where b.code = p_code and b.phone = p_phone;
  if r is null then perform wash_lookup_miss(p_phone); end if;
  return r;
end $$;
revoke all on function public.wash_booking_by_code(text, text) from public;
grant execute on function public.wash_booking_by_code(text, text) to anon, authenticated;

create or replace function public.cancel_wash_booking(p_code text, p_phone text)
returns boolean language plpgsql security definer set search_path = public as $$
declare b wash_bookings; is_late boolean;
begin
  perform wash_lookup_guard(p_phone);
  select * into b from wash_bookings x where x.code = p_code and x.phone = p_phone and x.status in ('pending','confirmed') and x.starts_at > now() for update;
  if not found then perform wash_lookup_miss(p_phone); return false; end if;
  -- إلغاءٌ قبل الموعد بأقلَّ من الحدّ يُعلَّم متأخّراً ويُحسب مع الغيابات.
  is_late := b.starts_at - now() < make_interval(mins => wash_cfg('wash_cancel_free_min', '30')::int);
  update wash_bookings set status = 'cancelled', status_at = now(), late = is_late where id = b.id;
  return true;
end $$;
revoke all on function public.cancel_wash_booking(text, text) from public;
grant execute on function public.cancel_wash_booking(text, text) to anon, authenticated;

-- ── ٨ · دقّةُ الكرون: انتهاءٌ وتذكيرٌ وتنبيهُ اشتراكٍ وتنظيف ───────────────
create or replace function public.wash_tick()
returns json language plpgsql security definer set search_path = public set statement_timeout = '5s' as $$
declare expired_n int; rem_n int; sub_n int; today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  perform set_config('wash.actor', 'system', true);
  -- ١ المعلّقُ الذي فات موعدُه ينتهي (الحالةُ تُسجَّل بالمُشغّل).
  with e as (
    update wash_bookings set status = 'expired', status_at = now()
     where status = 'pending' and starts_at < now() - make_interval(mins => wash_cfg('wash_pending_expire_min', '15')::int)
    returning 1)
  select count(*) into expired_n from e;
  -- ٢ تذكيرُ المؤكَّد قبل موعده (لمن له جهاز).
  with r as (
    update wash_bookings b set reminded_at = now()
     where b.status = 'confirmed' and b.reminded_at is null and b.device is not null
       and b.starts_at > now() and b.starts_at <= now() + make_interval(mins => wash_cfg('wash_reminder_min', '60')::int)
    returning b.id, b.wash_id, b.starts_at)
  insert into wash_events (wash_id, booking_id, kind, payload, actor_kind, dedupe)
  select r.wash_id, r.id, 'reminder', jsonb_build_object('starts_at', r.starts_at), 'system', 'rem:' || r.id from r
  on conflict (dedupe) do nothing;
  get diagnostics rem_n = row_count;
  -- ٣ تنبيهُ الاشتراك قبل ٧ و٣ و١ ويومَ الانتهاء (§45).
  insert into wash_events (wash_id, kind, payload, actor_kind, dedupe)
  select w.id, 'expiry_' || d.n, jsonb_build_object('paid_until', w.paid_until, 'days', d.n), 'system',
         format('expiry:%s:%s:%s', w.id, w.paid_until, d.n)
    from car_washes w cross join (values (7), (3), (1), (0)) as d(n)
   where w.status = 'approved' and w.paid_until = today + d.n
  on conflict (dedupe) do nothing;
  get diagnostics sub_n = row_count;
  -- ٤ تنظيف.
  delete from wash_events where created_at < now() - interval '30 days';
  delete from wash_lookup_fails where hour < now() - interval '1 day';
  -- ٥ نبضٌ تقرؤه لوحةُ الإدارة.
  insert into app_config (key, value) values ('wash_tick_last', to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'))
  on conflict (key) do update set value = excluded.value;
  return json_build_object('expired', expired_n, 'reminders', rem_n, 'expiry_notices', sub_n);
end $$;
revoke all on function public.wash_tick() from public, anon, authenticated;

-- ── ٩ · تأكيداتُ العزل ─────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from pg_proc where proname = 'book_wash') = 1, 'book_wash مكرّرة';
  assert (select count(*) from pg_proc where proname = 'wash_slots') = 1, 'wash_slots مكرّرة';
  assert (select count(*) from pg_proc where proname = 'set_wash_booking_status') = 1, 'set_wash_booking_status مكرّرة';
  assert (select count(*) from wash_bookings where ends_at is null) = 0, 'حجزٌ بلا نهاية';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
  assert not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                     where c.relname in ('stations','station_products','alerts','device_tokens','traffic_votes','profiles')
                       and t.tgname like '%wash%'), 'مُشغّلُ مغاسل على جدول وقود';
end $$;

commit;

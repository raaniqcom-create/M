-- «غسيل» M6: العروض v2 — مدّةٌ وخدمةٌ وسعرٌ خاصّ أو نسبةٌ وحدودُ استفادة (§20–23).
--
-- الحجزُ يطبّق العرضَ في القاعدة لا في المتصفّح: يتحقّق من نشاطه ومدّته وخدمته
-- وحدوده ثمّ يثبّت السعرَ. والعروضُ ميزةُ باقة (offers_enabled) يحرسها مُشغّل.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- wash_offers وbook_wash فقط. التراجع: drop trigger wash_offers_guard_trg on wash_offers;
--   drop function wash_offers_guard(); alter table wash_offers drop column description, starts_at,
--   service_id, offer_price, discount_pct, max_redemptions, per_user_limit; إعادةُ book_wash من 20260918b.
begin;

alter table public.wash_offers
  add column if not exists description     text check (description is null or char_length(description) <= 160),
  add column if not exists starts_at       date,
  add column if not exists service_id      uuid references public.wash_services(id) on delete set null,
  add column if not exists offer_price     integer check (offer_price is null or offer_price >= 0),
  add column if not exists discount_pct    smallint check (discount_pct is null or discount_pct between 1 and 90),
  add column if not exists max_redemptions integer check (max_redemptions is null or max_redemptions between 1 and 100000),
  add column if not exists per_user_limit  smallint check (per_user_limit is null or per_user_limit between 1 and 100);
alter table public.wash_offers drop constraint if exists wash_offers_one_kind;
alter table public.wash_offers add constraint wash_offers_one_kind check (offer_price is null or discount_pct is null);
create index if not exists wash_bookings_offer_idx on public.wash_bookings(offer_id) where offer_id is not null;

-- العروضُ لمن باقتُه تسمح — الإدارةُ حرّة.
create or replace function public.wash_offers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare w car_washes;
begin
  if auth.uid() is null or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') then return new; end if;
  select * into w from car_washes x where x.id = new.wash_id;
  if not coalesce((wash_features(w)->>'offers_enabled')::boolean, false) then
    raise exception 'العروضُ ميزةُ الباقة الاحترافيّة فما فوق — تواصل مع الإدارة لترقية اشتراكك';
  end if;
  return new;
end $$;
drop trigger if exists wash_offers_guard_trg on public.wash_offers;
create trigger wash_offers_guard_trg before insert or update on public.wash_offers
  for each row execute function public.wash_offers_guard();

-- has_offer يعتبر بدايةَ العرض أيضاً.
create or replace view public.washes_public with (security_invoker = false) as
  select w.id, w.name, w.city, w.address, w.lat, w.lng, w.image_url, w.is_24h, w.opens_at, w.closes_at,
         w.temp_closed, w.bays, w.slot_minutes, w.loyalty_target, w.created_at,
         case when w.phone_hidden then null else w.phone end as phone,
         exists (select 1 from wash_offers o where o.wash_id = w.id and o.active
                    and (o.starts_at is null or o.starts_at <= (now() at time zone 'Asia/Baghdad')::date)
                    and (o.ends_at is null or o.ends_at >= (now() at time zone 'Asia/Baghdad')::date)) as has_offer,
         coalesce(w.bookings_paused_until > now(), false) as paused,
         case when w.rating_n > 0 then round(w.rating_sum::numeric / w.rating_n, 1) end as rating_avg,
         w.rating_n
    from car_washes w
   where wash_published(w);
grant select on public.washes_public to anon, authenticated;

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
  f jsonb; o wash_offers; offer_id uuid := null;
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

  -- العرضُ (§20–21): نشطٌ، ضمن مدّته، لهذه الخدمة أو لكلّ الخدمات، ولم يبلغ حدَّه ولا حدَّ الزبون.
  if p_offer is not null then
    select * into o from wash_offers x where x.id = p_offer and x.wash_id = p_wash and x.active;
    if not found then raise exception 'هذا العرض غير متاح'; end if;
    if (o.starts_at is not null and o.starts_at > p_day) or (o.ends_at is not null and o.ends_at < p_day) then
      raise exception 'العرض لا يشمل هذا اليوم';
    end if;
    if o.service_id is not null and o.service_id <> s.id then raise exception 'العرض على خدمةٍ أخرى'; end if;
    if o.max_redemptions is not null and (select count(*) from wash_bookings x where x.offer_id = o.id
          and x.status not in ('cancelled','cancelled_by_business','expired','no_show')) >= o.max_redemptions then
      raise exception 'اكتمل عددُ المستفيدين من العرض';
    end if;
    if o.per_user_limit is not null and (select count(*) from wash_bookings x where x.offer_id = o.id and x.phone = core
          and x.status not in ('cancelled','cancelled_by_business','expired','no_show')) >= o.per_user_limit then
      raise exception 'استفدتَ من هذا العرض من قبل';
    end if;
    price := case when o.offer_price is not null then o.offer_price
                  when o.discount_pct is not null then round(price * (100 - o.discount_pct) / 100.0)::int
                  else price end;
    offer_id := o.id;
  end if;
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
          offer_id, p_client_key)
  returning * into b;

  return json_build_object('id', b.id, 'code', b.code, 'starts_at', b.starts_at, 'service', b.service_name,
                           'price', b.price, 'use_free', b.use_free, 'subscriber', b.is_subscriber, 'status', b.status,
                           'wash', w.name, 'wash_phone', case when w.phone_hidden then null else w.phone end);
end $$;
revoke all on function public.book_wash(uuid, uuid, date, time, text, text, text, text, text, uuid, uuid) from public;
grant execute on function public.book_wash(uuid, uuid, date, time, text, text, text, text, text, uuid, uuid) to anon, authenticated;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'book_wash') = 1, 'book_wash مكرّرة';
  assert (select prosrc from pg_proc where proname = 'book_wash') like '%offer_price%', 'العرضُ لم يدخل book_wash';
  assert (select count(*) from pg_proc where proname = 'wash_offers_guard') = 1, 'الحارسُ غائب';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
end $$;

commit;

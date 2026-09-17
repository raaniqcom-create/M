-- «غسيل» M11: طلبٌ واحدٌ لعدّة سيارات — العدّادُ (− 0 +) في الشاشة، والمفتاحُ المشترك في القاعدة.
--
-- الزبونُ يغسل سيّارتين أو ثلاثاً في زيارةٍ واحدة: رمزٌ لكلّ سيّارة (الموظّفُ ينادي رمزاً رمزاً)
-- وسعرٌ لكلّ نوع، لكنّها طلبٌ واحدٌ يتشارك group_key — يُعرض بطاقةً واحدةً ويُلغى دفعةً واحدة.
--
-- · كلُّ السيارات في الموعد نفسِه: لو لم تتّسع السعةُ فالخطأُ يقول كم يتّسع (لا تفريقَ على مواعيد).
-- · ما يعاقب الشخصَ يعدّ الطلبَ واحداً (النشطةُ، الغياباتُ، حدُّ الجهاز)، وحدُّ باقة المغسلة
--   الشهريُّ وحدَه يعدّ السياراتِ n لأنّه يقيس شغلَ المغسلة لا سلوكَ الزبون.
-- · إشعارٌ واحدٌ للطلب: أحداثُ بقيّة السيارات تُختم مرسَلةً فلا تصل صاحبَ المغسلة n مرّة.
-- · الغسلةُ المجّانيّةُ المستحقّة تُصفّر أوّلَ سيّارةٍ فقط — لا الطلبَ كلَّه.
-- · wash_max_cars_order في app_config هو سقفُ العدّاد (الافتراضيُّ 5).
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جداولُ wash_* وحدَها؛ لا كرونَ ولا شبكة. التراجع:
--   drop function book_wash_group(uuid,uuid,date,time,text,text,text,text,jsonb,uuid,uuid), cancel_wash_group(uuid,text);
--   drop index wash_bookings_group_idx; alter table wash_bookings drop column group_key;
--   delete from app_config where key = 'wash_max_cars_order';
--   ثمّ إعادةُ wash_config من 20260918_wash_plans وwash_my_bookings من 20260923_wash_v3
--   وwash_booking_by_code من 20260920_wash_reviews.
begin;

-- ── ١ · المفتاحُ المشترك ──────────────────────────────────────────────────
-- سياراتُ الطلب الواحد تتشارك المفتاح.
alter table public.wash_bookings add column if not exists group_key uuid;
create index if not exists wash_bookings_group_idx on public.wash_bookings(group_key) where group_key is not null;
comment on column public.wash_bookings.group_key is 'سياراتُ الطلب الواحد تتشارك المفتاح — رمزٌ لكلّ سيّارة وبطاقةٌ واحدة.';

insert into app_config (key, value) values ('wash_max_cars_order', '5')
on conflict (key) do nothing;

-- ── ٢ · الإعداداتُ العامّة: سقفُ العدّاد يُقرأ مع البقيّة ────────────────────
create or replace function public.wash_config()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'plans', (select coalesce(json_agg(json_build_object('code', code, 'name', name, 'price_iqd', price_iqd, 'features', features) order by sort), '[]'::json)
                from wash_plans where public and active),
    'promo_first_month', wash_cfg('wash_promo_first_month', '0')::int,
    'trial_days',        wash_cfg('wash_trial_days', '0')::int,
    'grace_days',        wash_cfg('wash_grace_days', '3')::int,
    'cancel_free_min',   wash_cfg('wash_cancel_free_min', '30')::int,
    'horizon_guest',     wash_cfg('wash_horizon_guest', '1')::int,
    'horizon_sub',       wash_cfg('wash_horizon_sub', '3')::int,
    'max_cars_order',    wash_cfg('wash_max_cars_order', '5')::int
  );
$$;
revoke all on function public.wash_config() from public;
grant execute on function public.wash_config() to anon, authenticated;

-- ── ٣ · الحجزُ بعدّة سيارات ───────────────────────────────────────────────
-- نفسُ حراسة book_wash حرفاً حرفاً (الهاتفُ، النشرُ، الخدمةُ، الأفقُ، الغيابات، الجهازُ،
-- الباقةُ، العرضُ، الولاء) وفروقُها الثلاثةُ موسومةٌ في مكانها.
create or replace function public.book_wash_group(
  p_wash uuid, p_service uuid, p_day date, p_slot time,
  p_name text, p_phone text, p_car text default null, p_device text default null,
  p_vehicles jsonb default '{}'::jsonb, p_offer uuid default null, p_client_key uuid default null
)
returns json
language plpgsql security definer set search_path = public set lock_timeout = '2s' as $$
declare
  w car_washes; s wash_services; o wash_offers;
  core text; today date := (now() at time zone 'Asia/Baghdad')::date;
  subscriber boolean := false; horizon int; active_n int; new_code text;
  starts timestamptz; free_n int; use_free boolean := false; price int;
  monthly_limit int; month_n int; f jsonb; v_offer uuid := null;
  cars text[]; n_cars int; cap int; i int;
  gk uuid; bid uuid; res json;
begin
  -- إعادةُ المحاولة بالمفتاح نفسِه تُرجع الطلبَ نفسَه كاملاً — لا سيّاراتٍ جديدة (§78).
  if p_client_key is not null then
    select x.group_key, x.id into gk, bid from wash_bookings x where x.client_key = p_client_key;
  end if;

  if bid is null then
    core := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
    core := regexp_replace(core, '^(00)?964', '');
    core := '0' || regexp_replace(core, '^0+', '');
    if core !~ '^07\d{9}$' then raise exception 'رقم الهاتف غير صحيح. اكتبه هكذا: 07901234567'; end if;
    if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'اكتب اسمك'; end if;
    if char_length(btrim(p_name)) > 40 then raise exception 'الاسم طويل — 40 حرفاً على الأكثر'; end if;
    if p_device is not null and length(p_device) > 512 then p_device := null; end if;

    -- العدّادُ مبسوطاً: {"sedan":2,"suv":1} → ['sedan','sedan','suv']؛ ما ليس نوعاً معروفاً
    -- أو ليس عدداً موجباً يُهمل، والعددُ لكلّ نوعٍ محدودٌ كي لا يبني نداءٌ خبيثٌ مصفوفةً ضخمة.
    select coalesce(array_agg(t.k order by t.ord, g.step), array[]::text[]) into cars
      from jsonb_each_text(case when jsonb_typeof(p_vehicles) = 'object' then p_vehicles else '{}'::jsonb end) e
      join unnest(array['sedan','suv','pickup','van','other']) with ordinality as t(k, ord) on t.k = e.key
     cross join lateral generate_series(1, case when e.value ~ '^\d{1,3}$' then least(e.value::int, 20) else 0 end) as g(step);
    n_cars := coalesce(array_length(cars, 1), 0);
    -- بلا عدّاد = حجزٌ مفردٌ بلا نوع، كما book_wash.
    if n_cars < 1 then cars := array[null]::text[]; n_cars := 1; end if;
    cap := wash_cfg('wash_max_cars_order', '5')::int;
    if n_cars > cap then raise exception 'أقصى عددٍ في الطلب الواحد % سيّارة', cap; end if;

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
    -- الغياباتُ والإلغاءاتُ المتأخّرة خلال النافذة: اليومَ فقط. وهي عقوبةٌ على الشخص،
    -- فالطلبُ ذو السيارتين غيابٌ واحدٌ لا اثنان (إلغاءٌ متأخّرٌ واحدٌ يسم كلَّ سطورِ الطلب).
    if (select count(distinct coalesce(x.group_key, x.id)) from wash_bookings x where x.phone = core and (x.status = 'no_show' or x.late)
          and x.created_at > now() - make_interval(days => wash_cfg('wash_no_show_window_days', '30')::int))
       >= wash_cfg('wash_no_show_block', '2')::int then horizon := 0; end if;
    if p_day < today then raise exception 'هذا اليوم مضى'; end if;
    if p_day > today + horizon then
      raise exception '%', case when subscriber then format('الحجز حتى %s أيّام مقدّماً', wash_cfg('wash_horizon_sub', '3'))
                                when horizon = 0 then 'لديك مواعيد فائتة، فالحجز لليوم فقط'
                                else 'الحجز لليوم والغد. فعّل التنبيهات في التطبيق لتحجز أيّاماً أكثر مقدّماً' end;
    end if;

    -- السعةُ من الشبكة نفسِها (الإغلاقاتُ وإيقافُ الاستقبال محسوبةٌ فيها)، وكلُّ
    -- السيارات في الموعد نفسِه: لا تفريقَ على مواعيدَ لاحقة.
    select x.free into free_n from wash_slots(p_wash, p_day, s.id) x where x.slot = p_slot;
    if free_n is null then raise exception 'هذا الموعد لم يعد متاحاً — اختر موعداً آخر'; end if;
    if free_n < n_cars then
      raise exception 'المتاح في هذا الموعد % سيّارة فقط — اختر موعداً آخر أو قلّل العدد', free_n;
    end if;
    starts := (p_day::timestamp + p_slot) at time zone 'Asia/Baghdad';

    -- حدودُ التكرار: حجزٌ واحدٌ في المغسلة في اليوم، وحجوزٌ نشطةٌ محدودة، وحدُّ الجهاز يوميّاً.
    if exists (select 1 from wash_bookings x where x.wash_id = p_wash and x.phone = core
                 and x.status in ('pending','confirmed','arrived','in_service')
                 and (x.starts_at at time zone 'Asia/Baghdad')::date = p_day) then
      raise exception 'لديك حجزٌ في هذه المغسلة في اليوم نفسه';
    end if;
    -- الفرقُ الأوّل: الطلبُ بسياراته حجزٌ نشطٌ واحد، لا n.
    select count(distinct coalesce(x.group_key, x.id))::int into active_n from wash_bookings x
     where x.phone = core and x.status in ('pending','confirmed') and x.starts_at >= now();
    if active_n >= (case when subscriber then wash_cfg('wash_max_active_sub', '2')::int else wash_cfg('wash_max_active_guest', '1')::int end) then
      raise exception '%', case when active_n >= 2 then 'لديك حجزان نشطان — أكمل أحدهما أو ألغِه أوّلاً'
                                else 'لديك حجزٌ نشط — أكمله أو ألغِه أوّلاً' end;
    end if;
    -- حدُّ الجهاز طلباتٌ لا سيّارات: طلبٌ بخمسِ سياراتٍ كان سيستنفد الحصّةَ وحدَه.
    if p_device is not null and (select count(distinct coalesce(x.group_key, x.id)) from wash_bookings x
          where x.device = p_device and x.created_at > now() - interval '1 day') >= wash_cfg('wash_device_daily', '5')::int then
      raise exception 'وصلت حدَّ الحجوزات لليوم';
    end if;

    -- حدُّ الباقة الشهريّ للمغسلة (٠ = بلا حدّ) — الفرقُ الثاني: يعدّ كلَّ سيّارة.
    f := wash_features(w);
    monthly_limit := coalesce((f->>'booking_monthly_limit')::int, 0);
    if monthly_limit > 0 then
      select count(*)::int into month_n from wash_bookings x
       where x.wash_id = p_wash and x.status not in ('cancelled','cancelled_by_business','expired')
         and x.created_at >= date_trunc('month', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad';
      if month_n + n_cars > monthly_limit then raise exception 'المغسلة بلغت حدَّ حجوزات هذا الشهر — تواصل معها مباشرة'; end if;
    end if;

    -- العرضُ (§20–21): نشطٌ، ضمن مدّته، لهذه الخدمة أو لكلّ الخدمات، وحدودُه تتّسع لكلّ سيارات الطلب.
    if p_offer is not null then
      select * into o from wash_offers x where x.id = p_offer and x.wash_id = p_wash and x.active;
      if not found then raise exception 'هذا العرض غير متاح'; end if;
      if (o.starts_at is not null and o.starts_at > p_day) or (o.ends_at is not null and o.ends_at < p_day) then
        raise exception 'العرض لا يشمل هذا اليوم';
      end if;
      if o.service_id is not null and o.service_id <> s.id then raise exception 'العرض على خدمةٍ أخرى'; end if;
      if o.max_redemptions is not null and (select count(*) from wash_bookings x where x.offer_id = o.id
            and x.status not in ('cancelled','cancelled_by_business','expired','no_show')) + n_cars > o.max_redemptions then
        raise exception 'اكتمل عددُ المستفيدين من العرض';
      end if;
      if o.per_user_limit is not null and (select count(*) from wash_bookings x where x.offer_id = o.id and x.phone = core
            and x.status not in ('cancelled','cancelled_by_business','expired','no_show')) + n_cars > o.per_user_limit then
        raise exception 'استفدتَ من هذا العرض من قبل';
      end if;
      v_offer := o.id;
    end if;
    -- الغسلةُ المجّانيّةُ المستحقّة تُصفّر أوّلَ سيّارةٍ لا الطلبَ كلَّه.
    use_free := coalesce((select st.free_credits > 0 from wash_stamps st where st.wash_id = p_wash and st.phone = core), false);

    gk := gen_random_uuid();
    for i in 1 .. n_cars loop
      -- السعرُ بنوع كلّ سيّارة، والعرضُ يسري على كلٍّ منها.
      price := coalesce((s.prices->>cars[i])::int, s.price);
      if v_offer is not null then
        price := case when o.offer_price is not null then o.offer_price
                      when o.discount_pct is not null then round(price * (100 - o.discount_pct) / 100.0)::int
                      else price end;
      end if;
      -- رمزٌ من ستّة أرقام، فريدٌ — ولكلّ سيّارةٍ رمزُها.
      loop
        new_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
        exit when not exists (select 1 from wash_bookings x where x.code = new_code);
      end loop;
      insert into wash_bookings (code, wash_id, service_id, service_name, price, starts_at, ends_at, name, phone, car, device,
                                 is_subscriber, use_free, status, status_at, vehicle, offer_id, client_key, group_key)
      values (new_code, p_wash, s.id, s.name, case when use_free and i = 1 then 0 else price end,
              starts, starts + make_interval(mins => s.minutes),
              btrim(p_name), core, nullif(btrim(coalesce(p_car, '')), ''), nullif(p_device, ''), subscriber,
              use_free and i = 1,
              case when w.confirm_mode = 'auto' then 'confirmed' else 'pending' end, now(), cars[i], v_offer,
              -- client_key عمودٌ فريدٌ جزئيّاً: على أوّل سيّارةٍ وحدَها.
              case when i = 1 then p_client_key end, gk);
    end loop;
    -- مُشغّلُ السجلّ يكتب حدثاً لكلّ سطر، والطلبُ سطورٌ — فصاحبُ المغسلة كان يتلقّى n إشعاراً
    -- للطلب الواحد (وn «أُكِّد» للزبون في المغسلة التلقائيّة). نختم أحداثَ ما بعد أوّل سيّارةٍ
    -- مرسَلةً: wash-tick تقرأ ما sent_at فيه فارغٌ وحدَه، فيبقى إشعارٌ واحدٌ للطلب.
    if n_cars > 1 then
      update wash_events e set sent_at = now()
       where e.sent_at is null and e.kind in ('new', 'confirmed')
         and e.booking_id in (select b.id from wash_bookings b where b.group_key = gk order by b.code offset 1);
    end if;
  end if;

  select json_build_object('group_key', gk, 'wash', w2.name, 'wash_id', w2.id,
                           'wash_phone', case when w2.phone_hidden then null else w2.phone end,
                           'service', min(b.service_name),
                           'cars', json_agg(json_build_object('code', b.code, 'vehicle', b.vehicle,
                                                              'starts_at', b.starts_at, 'price', b.price,
                                                              'status', b.status) order by b.code))
    into res
    from wash_bookings b join car_washes w2 on w2.id = b.wash_id
   where (gk is not null and b.group_key = gk) or (gk is null and b.id = bid)
   group by w2.id, w2.name, w2.phone_hidden, w2.phone;
  return res;
end $$;
revoke all on function public.book_wash_group(uuid, uuid, date, time, text, text, text, text, jsonb, uuid, uuid) from public;
grant execute on function public.book_wash_group(uuid, uuid, date, time, text, text, text, text, jsonb, uuid, uuid) to anon, authenticated;

-- ── ٤ · إلغاءُ الطلب كلِّه ────────────────────────────────────────────────
-- بطاقةٌ واحدةٌ في الشاشة = إلغاءٌ واحدٌ في القاعدة؛ وسياسةُ التأخّر كما في إلغاء الحجز المفرد.
create or replace function public.cancel_wash_group(p_group uuid, p_phone text)
returns integer language plpgsql security definer set search_path = public as $$
declare n int; ids uuid[];
begin
  perform wash_lookup_guard(p_phone);
  with c as (
    update wash_bookings b
       set status = 'cancelled', status_at = now(),
           late = (b.starts_at - now() < make_interval(mins => wash_cfg('wash_cancel_free_min', '30')::int))
     where b.group_key = p_group and b.phone = p_phone
       and b.status in ('pending','confirmed') and b.starts_at > now()
    returning b.id, b.code)
  select coalesce(array_agg(c.id order by c.code), '{}'::uuid[]) into ids from c;
  n := coalesce(array_length(ids, 1), 0);
  -- إلغاءٌ واحدٌ في الشاشة = إشعارٌ واحدٌ لصاحب المغسلة: أحداثُ بقيّة السيارات تُختم مرسَلةً.
  -- (خارجَ جملة الـCTE عمداً: مُشغّلُ السجلّ يكتب أحداثَه في نهاية تلك الجملة لا قبلَها.)
  if n > 1 then
    update wash_events e set sent_at = now()
     where e.sent_at is null and e.kind = 'cancelled' and e.booking_id = any(ids[2:]);
  end if;
  if n = 0 then perform wash_lookup_miss(p_phone); end if;
  return n;
end $$;
revoke all on function public.cancel_wash_group(uuid, text) from public;
grant execute on function public.cancel_wash_group(uuid, text) to anon, authenticated;

-- ── ٥ · «حجوزاتي»: المفتاحُ والنوعُ كي تُجمع السياراتُ في بطاقةٍ واحدة ──────
create or replace function public.wash_my_bookings(p_codes text[], p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if p_codes is null or cardinality(p_codes) = 0 then return '[]'::json; end if;
  perform wash_lookup_guard(p_phone);
  select coalesce(json_agg(json_build_object(
           'code', b.code, 'status', b.status, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
           'service', b.service_name, 'service_id', b.service_id, 'price', b.price,
           'vehicle', b.vehicle, 'late', b.late, 'group_key', b.group_key,
           'wash', w.name, 'wash_id', w.id, 'address', w.address, 'lat', w.lat, 'lng', w.lng)
         order by b.starts_at desc), '[]'::json)
    into r
    from wash_bookings b join car_washes w on w.id = b.wash_id
   where b.code = any(p_codes[1:20]) and b.phone = p_phone;
  if json_array_length(r) = 0 then perform wash_lookup_miss(p_phone); end if;
  return r;
end $$;
revoke all on function public.wash_my_bookings(text[], text) from public;
grant execute on function public.wash_my_bookings(text[], text) to anon, authenticated;

-- ── ٦ · صفحةُ الحجز: رموزُ إخوته في الطلب نفسِه ───────────────────────────
create or replace function public.wash_booking_by_code(p_code text, p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform wash_lookup_guard(p_phone);
  select json_build_object('id', b.id, 'code', b.code, 'status', b.status, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
                           'service', b.service_name, 'price', b.price, 'use_free', b.use_free, 'late', b.late,
                           'name', b.name, 'car', b.car, 'vehicle', b.vehicle, 'group_key', b.group_key,
                           'group_codes', (select coalesce(array_agg(g.code order by g.code), array[b.code])
                                             from wash_bookings g
                                            where g.group_key is not null and g.group_key = b.group_key),
                           'wash', w.name, 'wash_id', w.id, 'address', w.address, 'lat', w.lat, 'lng', w.lng,
                           'wash_phone', case when w.phone_hidden then null else w.phone end,
                           'cancel_free_min', wash_cfg('wash_cancel_free_min', '30')::int,
                           'reviewed', exists (select 1 from wash_reviews rv where rv.booking_id = b.id),
                           'events', (select coalesce(json_agg(json_build_object('kind', e.kind, 'at', e.created_at) order by e.created_at), '[]'::json)
                                        from wash_events e where e.booking_id = b.id and e.kind not in ('note', 'review')))
    into r
    from wash_bookings b join car_washes w on w.id = b.wash_id
   where b.code = p_code and b.phone = p_phone;
  if r is null then perform wash_lookup_miss(p_phone); end if;
  return r;
end $$;
revoke all on function public.wash_booking_by_code(text, text) from public;
grant execute on function public.wash_booking_by_code(text, text) to anon, authenticated;

-- ── ٧ · تأكيداتُ العزل ─────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'wash_bookings' and column_name = 'group_key') = 1, 'group_key غائب';
  assert (select count(*) from pg_proc where proname = 'book_wash_group') = 1, 'book_wash_group مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'cancel_wash_group') = 1, 'cancel_wash_group مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'wash_my_bookings') = 1, 'wash_my_bookings مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'wash_booking_by_code') = 1, 'wash_booking_by_code مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'wash_config') = 1, 'wash_config مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'book_wash') = 1, 'book_wash مكرّرة';
  assert (wash_config()->>'max_cars_order')::int >= 1, 'سقفُ العدّاد غائبٌ من الإعدادات';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
  assert not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                     where c.relname in ('stations','station_products','alerts','device_tokens','traffic_votes','profiles')
                       and t.tgname like '%wash%'), 'مُشغّلُ مغاسل على جدول وقود';
end $$;

commit;

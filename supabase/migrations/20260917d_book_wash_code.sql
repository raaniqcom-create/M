-- book_wash: «column reference "code" is ambiguous» — الحجزُ كان يسقط كلَّه.
--
-- المتغيّرُ code في الدالّة يحمل اسمَ عمود wash_bookings.code، وPL/pgSQL يرفض
-- المرجعَ غيرَ المؤهَّل داخل الاستعلام (42702). قِيس ١٦ أيلول على المغسلة
-- التجريبيّة: كلُّ نداءٍ لـbook_wash يعود 400. الاسمُ صار new_code، ولا شيءَ غيرُه.
begin;

create or replace function public.book_wash(
  p_wash uuid, p_service uuid, p_day date, p_slot time,
  p_name text, p_phone text, p_car text default null, p_device text default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  w car_washes; s wash_services;
  core text; today date := (now() at time zone 'Asia/Baghdad')::date;
  subscriber boolean := false; horizon int; active_n int; new_code text;
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
    new_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from wash_bookings x where x.code = new_code);
  end loop;

  insert into wash_bookings (code, wash_id, service_id, service_name, price, starts_at, name, phone, car, device, is_subscriber, use_free)
  values (new_code, p_wash, s.id, s.name, case when use_free then 0 else s.price end, starts, btrim(p_name), core,
          nullif(btrim(coalesce(p_car, '')), ''), nullif(p_device, ''), subscriber, use_free)
  returning * into b;

  return json_build_object('id', b.id, 'code', b.code, 'starts_at', b.starts_at, 'service', b.service_name,
                           'price', b.price, 'use_free', b.use_free, 'subscriber', b.is_subscriber,
                           'wash', w.name, 'wash_phone', case when w.phone_hidden then null else w.phone end);
end $$;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'book_wash') = 1, 'book_wash غائبة';
  assert (select prosrc from pg_proc where proname = 'book_wash') like '%new_code%', 'لم يُبدَّل الاسم';
end $$;

commit;

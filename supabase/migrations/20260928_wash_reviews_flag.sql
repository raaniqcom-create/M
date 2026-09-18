-- «غسيل»: إظهارُ التقييم بعد الغسل، وإعلانُ «سجّل مغسلتك» بعدد مشتركي المدينة.
--
-- ── لماذا ────────────────────────────────────────────────────────────────
-- التقييمُ موجودٌ (review_wash + صفحةُ الحجز) لكنّه مدفون: «حجوزاتي» والرئيسيةُ لا
-- تعرفان إن كان الحجزُ المكتملُ قُيّم. فتعيد wash_my_bookings العلمَ «reviewed» ومعرّفَ
-- الحجز — بلا استعلامٍ ثانٍ من المتصفّح.
--
-- وإعلانُ المدينة يحتاج عددَ المشتركين علناً: watchers_by_city تعيد رقماً مجمّعاً فقط
-- (لا عناوين ولا أجهزة)، فمنحُها لـanon لا يكشف شيئاً — وهو الرقمُ نفسُه في لوحة الإدارة.
--
-- وwash_trial_days كانت 0 فزرُّ «تجربة مجّانيّة» مخفيٌّ في لوحة الإدارة؛ 30 يوماً للمدن
-- التي دون ألف مشترك (تُضبط من WashPlansAdmin؛ لا تُمَسّ إن غيّرها المشرف).
begin;

create or replace function public.wash_my_bookings(p_codes text[], p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if p_codes is null or cardinality(p_codes) = 0 then return '[]'::json; end if;
  perform wash_lookup_guard(p_phone);
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'code', b.code, 'status', b.status, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
           'service', b.service_name, 'service_id', b.service_id, 'price', b.price,
           'vehicle', b.vehicle, 'late', b.late, 'group_key', b.group_key,
           'reviewed', exists (select 1 from wash_reviews rv where rv.booking_id = b.id),
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

grant execute on function public.watchers_by_city(text[]) to anon;

update app_config set value = '30' where key = 'wash_trial_days' and value = '0';

do $$ begin
  assert (select prosrc from pg_proc where proname = 'wash_my_bookings') like '%reviewed%';
  assert has_function_privilege('anon', 'public.watchers_by_city(text[])', 'execute');
end $$;
commit;

-- ═══ طابورُ المحاولات يبدأ من العطب، لا من أوّل يوم ═══════════════════════
--
-- «اريد المحطات بعد العطب — ١٠ محاولة — ان تظهر وليس قبل العطب» — صاحبُ
-- المنصّة، ١٩ أيلول.
--
-- ── ولماذا حدٌّ زمنيّ ───────────────────────────────────────────────────
--
-- `failed_registrations` (20261002) تقرأ **كلَّ** حسابٍ بلا محطة، فردّت معها
-- أحدَ عشرَ حساباً من آب وأوائل أيلول: أرقامُ فحصٍ متسلسلةٌ كـ07901234567
-- و07811112233، ومحاولاتٌ قديمةٌ سببُها غيرُ سبب هذا العطب.
--
-- وطابورُ متابعةٍ فيه ضجيجٌ لا يُتابَع: تتعلّم العينُ تخطّيه، فلا يُرى يومَ
-- يمتلئ بما يستحقّ. فيُحدّ بأوّل العطب.
--
-- ── والحدُّ لحظةُ العطب بعينها ──────────────────────────────────────────
--
-- `20260916_station_managers` دُفع ٢٠٢٦-٠٩-١٥ ٢٠:٠٨ بتوقيت UTC، وأوّلُ فشلٍ
-- وقع ٢٠:١٢. فما قبل ذلك اليوم ليس من هذا الباب، وما بعده كلُّه منه — وكلُّ
-- تاريخٍ قادمٍ بعده، فالحدُّ لا يشيخ.
--
-- ولا يُحذف من القاعدة شيء: الحساباتُ القديمة باقيةٌ كما هي، وهذا حجبُ عرضٍ
-- لا محو.
begin;

create or replace function public.failed_registrations()
returns table (
  phone text,
  created_at timestamptz,
  signed_in boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller_role text;
begin
  select p.role::text into caller_role from profiles p where p.id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select
      -- `p7XXXXXXXXX@muhta.app` ← `lib/phone.ts:13`. ويُعاد الصفرُ الذي يكتبه
      -- الناس، فالرقمُ يُنسخ من الشاشة ويُطلب كما هو.
      '0' || substring(u.email from 2 for 10) as phone,
      u.created_at,
      u.last_sign_in_at is not null as signed_in
    from auth.users u
    where u.email ~ '^p[0-9]{10}@muhta\.app$'
      -- لحظةُ العطب: ما قبلها ليس من هذا الباب.
      and u.created_at >= timestamptz '2026-09-15 20:00:00+00'
      -- ودقيقتان بعد الإنشاء: من سجّل قبل لحظةٍ قد يكون بين النداءين.
      and u.created_at < now() - interval '2 minutes'
      and not exists (select 1 from public.stations s where s.owner_id = u.id)
      and not exists (select 1 from public.car_washes w where w.owner_id = u.id)
    order by u.created_at desc;
end;
$fn$;

comment on function public.failed_registrations() is
  'حساباتٌ أُنشئت منذ عطب ١٥ أيلول ولم تُكمل تسجيلَ محطةٍ ولا مغسلة. تفاصيلُ المحطة لم تُحفظ قطّ.';

do $$
declare
  n int;
begin
  -- الحارسُ يعمل — تُنفَّذ هنا بلا دورِ إدارة.
  begin
    perform * from public.failed_registrations();
    raise exception 'الحارسُ لم يمنع نداءً بلا دورِ إدارة';
  exception when sqlstate '42501' then null; end;

  -- والعشرةُ صارت طلباتٍ فعلاً (20261003)، فلا يبقى منها في الطابور شيء.
  select count(*) into n from auth.users u
   where u.email ~ '^p[0-9]{10}@muhta\.app$'
     and u.created_at >= timestamptz '2026-09-15 20:00:00+00'
     and not exists (select 1 from public.stations s where s.owner_id = u.id);
  raise notice 'بقي في الطابور بعد صنع الطلبات: %', n;
end $$;

commit;

-- ═══ محاولاتُ تسجيلٍ لم تكتمل — طابورٌ يُرى ويُتابَع ═══════════════════════
--
-- «اريد كل محطة تفاصيل تسجيلها… و اعملها كطلب تسجيل محطة و اعود اتواصل معهم
--  كالطلبات السابقة» — صاحبُ المنصّة، ١٩ أيلول.
--
-- ── وتفاصيلُها لم تُحفظ قطّ ───────────────────────────────────────────────
--
-- الاسمُ والعنوانُ والإحداثيّاتُ واسمُ صاحبها كانت في المتصفّح وحدَه حتى لحظة
-- `insert` — والإدراجُ هو الذي سقط. فلم يُكتب منها حرفٌ في أيّ جدول: لا صفَّ
-- محطةٍ معلَّقاً، ولا صفَّ أرشيف، ولا سجلّ. و`admin-alert` تُنادى **بعد** نجاح
-- الإدراج فلم تُنادَ. وما بقي هو الحسابُ وحدَه: بريدُه يحمل الرقم.
--
-- ولا تُصطنع صفوفُ محطاتٍ بأسماءٍ وهميّةٍ وإحداثيّاتِ صفر: صفٌّ في `stations`
-- يُعدّ في الإحصاءات ويُقارَب في المطابقة، وقد يُعتمد بالسهو فيصير محطةً عامّةً
-- في وسط المحيط. فالطابورُ يُبنى من الحقيقة الباقية — الحسابُ اليتيم — ولا
-- يُلوَّث جدولُ المحطات بما ليس فيه.
--
-- ── حسابٌ يتيم: أُنشئ ولا محطةَ له ولا مغسلة ─────────────────────────────
--
-- وبحدٍّ زمنيّ: دقيقتان بعد الإنشاء. فمن سجّل قبل لحظةٍ قد يكون في الطريق بين
-- النداءين، ولا يُعدّ فاشلاً قبل أن يستحقّ.
--
-- والإدارةُ وحدَها تقرأ — نمطُ `admin_stats` نفسُه (20260817c): الدورُ يُفحص في
-- الدالّة لا في سياسة، لأنّ `auth.users` خارج المخطَّط العامّ ولا سياسةَ عليه.
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
      and u.created_at < now() - interval '2 minutes'
      and not exists (select 1 from public.stations s where s.owner_id = u.id)
      and not exists (select 1 from public.car_washes w where w.owner_id = u.id)
    order by u.created_at desc;
end;
$fn$;

revoke all on function public.failed_registrations() from public;
grant execute on function public.failed_registrations() to authenticated;

comment on function public.failed_registrations() is
  'حساباتٌ أُنشئت ولم تُكمل تسجيلَ محطةٍ ولا مغسلة — طابورُ متابعةٍ للإدارة. تفاصيلُ المحطة لم تُحفظ قطّ.';

do $$
declare
  n int;
begin
  assert exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'failed_registrations' and p.prosecdef
  ), 'الدالّةُ لم تُنشأ أو ليست security definer';

  -- تُنفَّذ هنا بدور المالك (auth.uid() فارغ) فتردّ «forbidden» — وذاك هو
  -- المطلوب إثباتُه: الحارسُ يعمل ولا يُستثنى أحد.
  begin
    perform * from public.failed_registrations();
    raise exception 'الحارسُ لم يمنع نداءً بلا دورِ إدارة';
  exception when sqlstate '42501' then null; end;
end $$;

commit;

-- تصحيح: 20260819c لم يفعل شيئاً.
--
-- كتبتُ فيه `revoke select (phone, contact_name) on stations from anon` وظننته
-- كافياً. وليس كافياً: لدور anon **منح على مستوى الجدول كله**، ومنح الجدول
-- يغطّي كل عمود فيه — فنزع أعمدة بعينها لا يُلغيه، ويبقى الرقم مقروءاً. تحقّقتُ
-- بعد التشغيل: `?select=phone` ما زال يردّ الرقم.
--
-- والصواب: يُسحب منح الجدول، ثم تُمنح الأعمدة واحداً واحداً عدا الرقم والاسم
-- المرافق. ومنحُ عمودٍ لا يُمنح يعني أن `select=*` نفسها تفشل لدور anon — وهذا
-- مقصود: القراءة العامة تمرّ بالمنظور، لا بالجدول.
begin;

-- ---------------------------------------------------------------------------
-- ١. المنظور يقرأ بصلاحيته لا بصلاحية طالبه
-- ---------------------------------------------------------------------------
-- كان security_invoker = true، أي يقرأ بامتيازات المتصل — ولو بقي كذلك لَما
-- استطاع قراءة العمود بعد نزعه، فينهار المنظور مع الجدول.
--
-- وبإسقاط ذلك يتجاوز المنظور RLS، فيجب أن يرشّح الصفوف بنفسه: بلا هذا السطر
-- يصير كشفاً لطلبات التسجيل المعلّقة — أسماء وعناوين وأرقام أناسٍ لم تُقبل
-- محطاتهم بعد.
create or replace view public.stations_public
with (security_invoker = false)
as
select
  s.id, s.owner_id, s.name, s.address, s.city, s.kind, s.status, s.slug,
  s.lat, s.lng, s.is_24h, s.opens_at, s.closes_at, s.temp_closed, s.is_demo,
  s.manual_traffic_level, s.manual_traffic_set_at, s.created_at,
  s.phone_hidden,
  case when s.phone_hidden then null else s.phone end as phone,
  case when s.phone_hidden then split_part(s.contact_name, ' — ', 1)
       else s.contact_name end as contact_name
from stations s
where s.status = 'approved';

grant select on public.stations_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ٢. النزع الفعلي
-- ---------------------------------------------------------------------------
revoke select on public.stations from anon;

-- كل عمود عدا phone وcontact_name. الاسم والعنوان والموقع عامّة أصلاً — تُقرأ
-- من المنظور، لكن generateStaticParams يقرأ id من الجدول وقت البناء بدور anon،
-- فيبقى ما يحتاجه ممنوحاً.
grant select (
  id, owner_id, name, address, city, kind, status, slug,
  lat, lng, is_24h, opens_at, closes_at, temp_closed, is_demo,
  manual_traffic_level, manual_traffic_set_at, created_at, phone_hidden
) on public.stations to anon;

-- authenticated يبقى كما هو: المالك يقرأ صفّه والإدارة تقرأ الكل، وكلاهما
-- يحتاج الرقم — الأول لأنه اسم دخوله، والثانية لأنها تتصل بأصحاب المحطات.

-- ---------------------------------------------------------------------------
-- ٣. «هذا الرقم مسجّل بالفعل»
-- ---------------------------------------------------------------------------
-- الاستمارة تعرض للمسجِّل المحطة القائمة على رقمه ليعرفها. وكانت تقرأ العمود
-- مباشرة، فتنكسر بعد النزع. ولا تُرجع الدالة رقماً — الاسم والمدينة والعنوان
-- عامّة أصلاً، والمتصل هو من كتب الرقم.
create or replace function public.station_by_phone(p_phone text)
returns table(name text, city text, address text)
language sql
security definer
set search_path = public
as $$
  select s.name, s.city, s.address
    from stations s
   where s.phone = p_phone
   limit 1;
$$;

revoke all on function public.station_by_phone(text) from public;
grant execute on function public.station_by_phone(text) to anon, authenticated;

commit;

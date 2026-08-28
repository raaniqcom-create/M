-- سحبُ الادّعاء بعد يومين، وكشفُ من لا يصله تذكير.
--
-- ── ١ · لماذا يُسحب ──────────────────────────────────────────────────────
--
-- المنصّة تُشيخ الادّعاء بعد أربعٍ وعشرين ساعة فلا يعود أخضر، وتُبقيه معروضاً
-- رماديّاً ومعه عمره. وهذا صوابٌ ليومٍ أو يومين.
--
-- **لكن اللوحة تُظهر اليوم محطةً لم تُلمس منذ عشرة أيام**، وأربعاً بين يومين
-- وأسبوع. و«بانزين · قبل ١٠ أيام» ليست معلومةً ناقصة، بل جملةٌ لا يبني عليها
-- مسافرٌ قراراً — وعرضُها يُبقي في القائمة محطةً لا نعرف عنها شيئاً.
--
-- والسحبُ عرضٌ لا حذف: is_available باقيةٌ كما تركها صاحبُها، و updated_at لا
-- تُلمس. فضغطةُ «أكّد التوفّر» تُعيد كلَّ شيء في لحظة.
--
-- ونظيرتُها في المتصفّح: WITHDRAW_HOURS في lib/hours.ts. رقمان في موضعين،
-- ولا ثالث لهما: هذا المنظور للخادم والبوتين، وذاك لكلّ ما يُعرض في التطبيق.

create or replace view public.station_products_live as
select sp.station_id,
       sp.product,
       sp.updated_at,
       sp.is_available,
       st.name as station_name,
       st.city as station_city,
       st.slug as station_slug
  from station_products sp
  join stations st on st.id = sp.station_id
 where sp.is_available
   and st.status = 'approved'
   and station_open_now(st.*)
   -- ٤٨ ساعة: ما لم يُؤكَّد بعدها لا يُعلَن عنه، ولو بقي في القاعدة متوفّراً
   and sp.updated_at > now() - interval '48 hours';

comment on view public.station_products_live is
  'المنتجات التي يصحّ الإعلان عنها الآن: متوفرة، ومحطتها معتمدة ومفتوحة، وأُكّدت خلال ٤٨ ساعة.';

revoke all on public.station_products_live from anon, authenticated;
grant select on public.station_products_live to service_role;


-- ── ٢ · لماذا لا يتحرّك «التفاعل» ────────────────────────────────────────
--
-- اللوحة تقول عن محطة «١٠ أيام» ولا تقول لماذا. والقياس: ثلاثُ محطاتٍ من
-- ثمانٍ وعشرين لها جهازٌ مربوط، وواحدةٌ على تيليغرام — فأربعٌ وعشرون تُحسب
-- لها التذكيراتُ يومياً ولا تصل أحداً. وهذا يُقرأ في اللوحة تقصيراً من
-- أصحابها، وهو في الحقيقة عنوانٌ مفقود.
--
-- و device_tokens لا SELECT عليها لأحد (schema.sql) — عن قصد: قائمةُ رموز
-- الأجهزة أخطرُ ما في القاعدة. فتُعَدّ هنا خلف security definer ولا تخرج
-- منها رموز، بل أعدادٌ فقط. على نمط station_audience.

create or replace function public.station_reach()
returns table (station_id uuid, devices int, telegram int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select role from profiles where id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select s.id,
           (select count(*)::int from device_tokens d where d.station_id = s.id),
           (select count(*)::int from telegram_links t where t.station_id = s.id)
      from stations s
     where s.status = 'approved';
end;
$$;

comment on function public.station_reach() is
  'لكل محطة معتمدة: كم جهازاً مربوطاً وكم رابط تيليغرام. أعدادٌ لا عناوين، وللإدارة وحدها.';

revoke all on function public.station_reach() from public, anon;
grant execute on function public.station_reach() to authenticated;

-- العدّ في القاعدة، لا في الذاكرة بعد جلب الصفوف.
--
-- owner-daily كانت تجلب alerts ثم تعدّ العناوين المتمايزة في JS. وواجهة
-- PostgREST تقصّ الرد عند ألف صفّ افتراضياً، وفي الجدول ٤٤٣٧ — فالعدّ كان يقع
-- على أوّل ٢٢٪ من البيانات. النتيجة قِيست: ١٧٥ بدل ٦١٩ للرمادي.
--
-- والقصّ صامت: لا خطأ ولا تحذير، فقط رقمٌ أصغر يبدو معقولاً. وهذا أسوأ ما في
-- الأمر — لأن الرقم كان يُرسَل إلى أصحاب المحطات في رسالة حجّتها كلها أن
-- الأرقام حقيقية.
--
-- والعدّ هنا مجمَّع: لا يخرج عنوان دفع واحد، كما في station_audience.
begin;

create or replace function public.watchers_by_city(p_cities text[])
returns table(city text, watchers integer)
language sql
security definer
set search_path = public
as $$
  select c.city,
         (
           select count(distinct a.address)::int
             from alerts a
            where a.station_id is null
              -- من اختار «كل المدن» يُحتسب لكل مدينة: هو ينتظر خبر الأنبار
              -- كلها، ومحطة في الرطبة جزء منها.
              and (a.city is null or a.city = c.city)
         ) as watchers
    from unnest(p_cities) as c(city);
$$;

revoke all on function public.watchers_by_city(text[]) from public;
grant execute on function public.watchers_by_city(text[]) to authenticated, service_role;

commit;

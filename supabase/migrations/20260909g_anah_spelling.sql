-- «عانة» تصير «عنة» — الاسمُ الذي يكتبه أهلُها.
--
-- ── ولماذا هجرةٌ لا تبديلُ حرفٍ في الشيفرة ────────────────────────────────
--
-- اسمُ المدينة **مفتاحُ ربطٍ لا اسمُ عرض**. لا مُعرِّفَ للمدن في هذا المشروع:
-- `alerts_for` تُطابق `a.city = p_city` نصّاً بنصّ (20260908d:69 و:131)،
-- وكذلك `watchers_by_city` و`station_audience` و`announce_reach` وغيرُها.
--
-- وقِيس: `normalizeName('عانة')` = «عانه»، و`normalizeName('عنة')` = «عنه» —
-- ولا إحداهما جزءٌ من الأخرى. فلا شيءَ يلتئم من نفسه: لو تبدّلت الشيفرةُ
-- وبقيت البيانات، لَسقط **٢٠٧٦ اشتراكاً على ٧٢٩ جهازاً** من الترشيح الأوّل
-- في `matched` — بلا خطأٍ، وبردٍّ ٢٠٠، وبسجلٍّ فيه صفوفٌ للناجين. صمتٌ لا
-- يُقاس إلا بعدّادٍ ينقص في مكانٍ لا يراقبه أحد.
--
-- ── وما قيس قبل الكتابة ──────────────────────────────────────────────────
--
--   stations         ١      ·  fuel_schedule       ٢
--   alerts        ٢٠٧٦      ·  subscribers         ٣  (كلُّهم فعّالون)
--   whatsapp_users   ٠      ·  board_overrides     ٠
--   announcements    ٠ (في العمودين معاً)  ·  station_archive  ٠
--   telegram_drafts  ٠ مسوّدةً في هذه المدينة
--
-- والصفرُ مقيسٌ لا مفترَض: أربعةُ جداولَ لم تُعدّ في الجولة الأولى، فعُدّت.

begin;

-- ــ ١ · والمكرَّرُ يُحذف قبل التبديل ــــــــــــــــــــــــــــــــــــــــ
--
-- `alerts_uniq_product` و`alerts_uniq_anyproduct` (20260818:45،:51) تجعلان
-- التبديلَ يرفع 23505 لو كان جهازٌ قد سجّل الاسمَ الجديدَ أصلاً. وقِيس اليومَ
-- صفرٌ من هذه — لكنّ الهجرةَ قد تجري بعد دقائقَ من نشرٍ فتحَ الاسمَ الجديد،
-- فالحارسُ يبقى. والمحذوفُ هو **القديمُ** حيث يوجد الجديد: الاشتراكُ نفسُه
-- لا فقدانَ فيه.
delete from public.alerts a
 where a.city = 'عانة'
   and exists (
     select 1 from public.alerts b
      where b.city = 'عنة'
        and b.channel = a.channel
        and b.address = a.address
        and b.station_id is not distinct from a.station_id
        and b.product   is not distinct from a.product
   );

-- ــ ٢ · والبيانات ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
update public.stations       set city = 'عنة' where city = 'عانة';
update public.fuel_schedule  set city = 'عنة' where city = 'عانة';
update public.alerts         set city = 'عنة' where city = 'عانة';
update public.subscribers    set city = 'عنة' where city = 'عانة';
update public.whatsapp_users set city = 'عنة' where city = 'عانة';

-- ولو ظهرت صفوفٌ في هذه بعد القياس — الجداولُ الأربعةُ كانت صفراً.
update public.board_overrides set city = 'عنة' where city = 'عانة';
update public.announcements   set origin_city = 'عنة' where origin_city = 'عانة';
update public.announcements   set cities = array_replace(cities, 'عانة', 'عنة')
 where 'عانة' = any(cities);
update public.station_archive
   set station = jsonb_set(station, '{city}', '"عنة"')
 where station ->> 'city' = 'عانة';

-- ــ ٣ · والمسوّدةُ المعلّقة ــــــــــــــــــــــــــــــــــــــــــــــــ
--
-- `telegram/index.ts:987` هو `CITIES[city]` ثمّ `centre[0]` — ومسوّدةٌ بُدئت
-- قبل النشر تحمل الاسمَ القديم فتردّ `undefined` فيسقط البوتُ بلا ردّ، بعد
-- أن يكون حسابُ المالك قد أُنشئ. قيس: صفرُ مسوّداتٍ في هذه المدينة اليوم،
-- وهذا يُبقيها صفراً.
update public.telegram_drafts
   set data = jsonb_set(data, '{city}', '"عنة"')
 where data ->> 'city' = 'عانة';

commit;

-- ــ ٤ · ونسخةُ القاعدة من قائمة المدن ــــــــــــــــــــــــــــــــــــــ
--
-- `city_at` في 20260909c مرآةُ `ANBAR_CITIES`، وهي **مطبَّقةٌ بالفعل** —
-- و`scripts/apply-migrations.mjs:83` يتخطّى ما سُجّل، فتحريرُ ذلك الملفّ لا
-- يفعل شيئاً أبداً. فتُعاد كتابتُها هنا.
--
-- (والإحداثيّةُ هي هي: الاسمُ وحدَه تبدّل.)
create or replace function public.city_at(
  p_lat double precision,
  p_lng double precision
)
returns text
language sql
immutable
as $$
  select d.name from (
    select c.name,
           6371 * 2 * asin(sqrt(
             power(sin(radians(c.la - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(c.la)) *
             power(sin(radians(c.lo - p_lng) / 2), 2))) as km
      from (values
        ('الرمادي', 33.4258, 43.3012),          ('الفلوجة', 33.3556, 43.7864),
        ('هيت', 33.6383, 42.8258),              ('حديثة', 34.1372, 42.3789),
        ('عنة', 34.3725, 41.9859),              ('راوة', 34.4833, 41.9237),
        ('القائم', 34.39577, 40.99437),         ('الرطبة', 33.0386, 40.2864),
        ('الحبانية', 33.3628, 43.5586),         ('الخالدية', 33.3789, 43.4881),
        ('عامرية الفلوجة', 33.16347, 43.86422), ('الكرمة', 33.40494, 43.91423),
        ('البغدادي', 33.85175, 42.54918),       ('الحقلانية', 34.0575, 42.3792),
        ('بروانة', 34.09579, 42.38882),         ('النخيب', 32.0369, 42.2506),
        ('كبيسة', 33.5941, 42.6185),            ('المحمدي', 33.5509, 42.9011),
        ('الصقلاوية', 33.3964, 43.6833),        ('حصيبة الشرقية', 33.4207, 43.4533),
        ('الرحالية', 32.7658, 43.3911),         ('العبيدي', 34.4281, 41.2173),
        ('الكرابلة', 34.3909, 41.0464),         ('الرمانة', 34.3931, 41.078),
        ('عكاشات', 33.6675, 39.967),            ('الوليد', 33.4328, 38.9321),
        ('الوفاء', 33.3975, 42.8531)
      ) as c(name, la, lo)
  ) d
  where d.km <= 12
  order by d.km
  limit 1;
$$;

revoke all on function public.city_at(double precision, double precision) from public;

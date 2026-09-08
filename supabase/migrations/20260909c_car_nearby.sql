-- شاشةُ السيارة: نداءٌ واحدٌ يحمل كلَّ ما تحتاجه.
--
-- CarPlay وAndroid Auto لا يعرضان صفحةَ ويب: قوالبُ جاهزةٌ يرسمها النظام، تُغذّى
-- بشيفرةٍ أصليّةٍ في Swift وJava. فلو حُسبت قاعدةُ «متوفّرٌ الآن» هناك لَصارت
-- **خمسَ** نسخٍ: `lib/hours.ts`، و`station_open_now` في SQL، وثالثةٌ داخل بوت
-- تلغرام (وهي تتجاهل `temp_closed` أصلاً — أي أنّها خطأ قائم)، ثمّ سويفت وجافا.
-- والمشروع احترق بهذا الانحراف مرّتين، مكتوبتان في `lib/products.ts:168-179`.
--
-- فالقاعدةُ تُحسب هنا مرّةً، وتردّ صفوفاً **صادقةً وقتَ ردّها**. والشيفرةُ
-- الأصليّة ترسم ولا تحكم.
--
-- ── ولا يُنسخ فيها شرطٌ قائم ─────────────────────────────────────────────
--
-- `isOffered` (lib/products.ts:180) أربعةُ شروط، وثلاثةٌ منها مكتوبةٌ أصلاً في
-- `station_products_live` (20260903): متوفّر، ومحطتُه معتمدةٌ ومفتوحة
-- (`station_open_now`)، ولم يمرّ موعدُ نفاده. والرابعُ وحدَه يُضاف هنا —
-- **نافذةُ الحداثة** — لأنّ المنظور يُجيز ثمانياً وأربعين ساعة، وهي قاعدةُ
-- «يصحّ الإعلانُ عنه»؛ و«متوفّرٌ الآن» أضيق: `FRESH_HOURS = 24`.
--
-- وفرقُ الأربعٍ والعشرين ليس تفصيلاً: عليه يقطع إنسانٌ ثلاثين كيلومتراً.

begin;

------------------------------------------------------------------------------
-- ١ · أين أنت؟
--
-- `station_phone_for` تسأل عن **اسم مدينة** لتقارنه بمدينة المحطة، والسيارةُ
-- لا تملك إلا إحداثيّات. فهذه تحوّلها: أقربُ مركزِ مدينةٍ ضمن اثني عشر
-- كيلومتراً، أو لا شيء.
--
-- واثنا عشر: من كان داخلها فهو «من أهل المدينة» بالمعنى الذي قصده صاحبُ
-- المحطة حين أخفى رقمه — جارٌ يستطيع أن يمرّ بها. ومن خرج عنها فهو على الطريق.
--
-- والقائمةُ مرآةُ `ANBAR_CITIES` في `lib/cities.ts` — سبعٌ وعشرون نقطة. ومن
-- أضاف مدينةً هناك يضيفها هنا؛ يُقال صراحةً لأنّ لا سبيلَ إلى استيراد ملفّ
-- TypeScript في دالّةِ Postgres. ولا تُجعل جدولاً: نقاطٌ ثابتةٌ لا تُحرَّر من
-- واجهة، وجدولٌ لها صفوفٌ وسياساتٌ ونسخٌ احتياطيّةٌ بلا مكسب.
-- ponytail: قائمةٌ مضمّنة؛ تصير جدولاً يومَ تصير المدنُ قابلةً للتحرير.
------------------------------------------------------------------------------
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
        ('عانة', 34.3725, 41.9859),             ('راوة', 34.4833, 41.9237),
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

comment on function public.city_at(double precision, double precision) is
  'المدينةُ التي تقف فيها فعلاً — أقربُ مركزٍ ضمن ١٢ كم، أو لا شيء. مرآةُ ANBAR_CITIES في lib/cities.ts.';

-- لا تُمنح لأحد: تُنادى من داخل `car_nearby` وهي security definer.
revoke all on function public.city_at(double precision, double precision) from public;

------------------------------------------------------------------------------
-- ٢ · النداءُ الوحيد
--
-- ── والرقمُ يُحلّ بالقواعد القائمة، ولا تُنسخ ولا تُوسَّع ────────────────
--
-- سبعَ عشرةَ محطةً من أربعين اختارت إخفاءَ رقمها، ووُعدت في لوحتها حرفيّاً:
-- «يختفي زرُّ الاتصال من التطبيق والبوتات» (app/owner/page.tsx:763). فالشاشةُ
-- في السيارة لا تنقض ذلك.
--
-- وتُركّب قاعدتان قائمتان، ولا تُكتب ثالثة:
--   · الظاهرُ من `stations_public` — `case when phone_hidden then null` (20260819d)
--   · والمخفيُّ من `station_phone_for` — بوّابةُ المسافر (20260827) بحرفها
--
-- ثمّ **حارسٌ ثالثٌ أضيق**: عشرةُ كيلومترات. فمحطةٌ على بُعد تسعةٍ ليست رحلةً،
-- وصاحبُها أخفى رقمه عمّن يستطيع أن يمرّ بها. والحالةُ التي كُتبت لها البوّابةُ
-- أصلاً كانت سبعةً وعشرين كيلومتراً وثمانَ مئةِ متر — مقيسةً، في رأس هجرتها.
--
-- فما تُخرجه هذه الدالّة **أضيقُ أبداً** ممّا تُخرجه `station_phone_for` وحدَها
-- للمدينة نفسِها. وذلك هو الدليلُ على أنّ الطيَّ آمن.
--
-- وحدُّ البوّابة يبقى إرشاديّاً كما كان: الإحداثيّاتُ من العميل، والخادمُ لا
-- يملك التحقّق منها — وهو مكتوبٌ صراحةً في 20260827 ولم يتغيّر هنا.
------------------------------------------------------------------------------
create or replace function public.car_nearby(
  p_lat     double precision,
  p_lng     double precision,
  p_product fuel_product default null,
  p_limit   int default 12
)
returns table (
  id           uuid,
  name         text,
  city         text,
  lat          double precision,
  lng          double precision,
  distance_km  double precision,
  products     text[],
  confirmed_min int,
  phone        text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    -- «خارج المدن» ليست مدينةَ محطةٍ قطّ، فالبوّابةُ تُفتح لمن على الطريق —
    -- وحارسُ العشرة كيلومترات أدناه هو ما يمنع أن يصير ذلك باباً واسعاً.
    select coalesce(city_at(p_lat, p_lng), 'خارج المدن') as city
  ),
  live as (
    select l.station_id, l.product, l.updated_at
      from station_products_live l
     -- الشرطُ الرابع وحدَه: المنظور يُجيز ٤٨ ساعة، و«الآن» أربعٌ وعشرون.
     where l.updated_at > now() - interval '24 hours'
       and (p_product is null or l.product = p_product)
  ),
  near as (
    select s.id, s.name, s.city, s.lat, s.lng, s.phone, s.phone_hidden,
           6371 * 2 * asin(sqrt(
             power(sin(radians(s.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(s.lat)) *
             power(sin(radians(s.lng - p_lng) / 2), 2))) as km
      from stations s
     where s.status = 'approved'
       and not s.is_demo
  )
  select n.id,
         n.name,
         n.city,
         n.lat,
         n.lng,
         round(n.km::numeric, 1)::double precision,
         array_agg(l.product::text order by l.product),
         (extract(epoch from now() - max(l.updated_at)) / 60)::int,
         case
           when not n.phone_hidden then n.phone
           when n.km < 10 then null
           else station_phone_for(n.id, (select city from me))
         end
    from near n
    join live l on l.station_id = n.id
   group by n.id, n.name, n.city, n.lat, n.lng, n.km, n.phone, n.phone_hidden
   order by n.km
   limit greatest(1, least(coalesce(p_limit, 12), 40));
$$;

-- `security definer` لازم: anon نُزع عنه `stations.phone` (20260819d)، و
-- `station_products_live` ممنوحٌ لـservice_role وحدَه. والدالّةُ لا تُخرج رقماً
-- لا تُخرجه `station_phone_for` أصلاً — بل أضيقَ منه.
revoke all on function public.car_nearby(double precision, double precision, fuel_product, int) from public;
grant execute on function public.car_nearby(double precision, double precision, fuel_product, int) to anon, authenticated;

comment on function public.car_nearby(double precision, double precision, fuel_product, int) is
  'شاشةُ السيارة: المحطاتُ المتوفّرُ فيها وقودٌ الآن مرتَّبةً بالقرب، ومعها رقمٌ مُقرَّرٌ بقواعد الخصوصيّة القائمة.';

-- ولا فهرسَ على lat/lng: أربعون صفّاً معتمداً، فالفهرسُ كلفةُ كتابةٍ بلا مكسبِ
-- قراءة. وهو الحكمُ نفسُه في 20260903_runs_out_at.sql.

commit;

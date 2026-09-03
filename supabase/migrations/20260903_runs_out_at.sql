-- «متى تتوقّع نفاده؟» — مرآةُ expected_at.
--
-- عندنا اليوم عمودٌ يقول متى **يصل** الوقودُ المفقود: `expected_at`. وينقصنا
-- الشطرُ الثاني: متى **ينفد** الموجود. وطلبها صاحبُ المنصّة للكاز بعينه، إذ
-- تُوزَّع حصصُه على ساعات: تصل الحمولة السادسة صباحاً وتنفد قبل الظهر — فمن
-- قرأ «كاز متوفّر» في الثانية ظهراً قرأ خبراً صادقاً وقتَ كتابته، كاذباً وقتَ
-- قراءته.
--
-- ── ولماذا لا تكفي الحداثةُ والسحب ──────────────────────────────────────
--
-- في المنصّة حارسان زمنيّان: `isFresh` (٢٤ ساعة) و`isWithdrawn` (٤٨). وكلاهما
-- يقيس **عمرَ الخبر** لا انتهاءه: يفترضان أن ما لم يُصحَّح بعد يومٍ صار
-- مشكوكاً فيه. وذلك تخمينٌ عن صاحب المحطة، وهذا العمودُ إعلانٌ **منه**. فحيث
-- خمّنّا نحن يقول هو، والقولُ أصدق.
--
-- ولا يُلغيان: منتجٌ أُعلن قبل ساعة ونفد قبل عشر دقائق حديثٌ ونافدٌ معاً،
-- والحارسان منفصلان بحقّ.
--
-- ── والسحبُ عرضٌ لا حذف ─────────────────────────────────────────────────
--
-- `is_available` تبقى كما تركها صاحبُها، و`updated_at` لا تُلمس. فبعد مرور
-- الموعد يختفي المنتجُ من كلِّ سطحٍ — كأن صاحبَه أطفأ زرَّه — ويعود بضغطةِ
-- «أكّد التوفّر» التي تُصفّر هذا العمود. وهو نمطُ `isWithdrawn` نفسُه.
--
-- **وكلُّ مسار كتابةٍ يُشعل منتجاً يجب أن يُصفّره.** خمسةٌ منها: لوحةُ المالك،
-- ولوحةُ الإدارة، وزرُّ تيليجرام، وزرُّ واتساب، وزرّا «ما زال متوفراً». وبلا
-- التصفير يُولد كلُّ تفعيلٍ بعد نفادٍ سابق ميّتاً: البوتُ يقول «أصبح متوفراً»
-- والمنصّةُ لا تعرضه — إخفاقٌ صامتٌ في الزرّ الذي يُصلح كلَّ شيءٍ آخر.

alter table public.station_products
  add column if not exists runs_out_at timestamptz;

comment on column public.station_products.runs_out_at is
  'نفادٌ متوقَّع أعلنه صاحبُ المحطة لمنتجٍ متوفّر. بعد مروره لا يُعرض المنتج ولا يُعلَن عنه. تُصفَّر مع كل تفعيلٍ أو تأكيد.';

-- ولا فهرس: الجدولُ صفوفُه بعددِ المحطات × سبعة، والشرطُ يُقرأ دائماً مع
-- station_id أو ضمن مسحٍ كامل للمنظور. فهرسٌ هنا كلفةُ كتابةٍ بلا مكسبِ قراءة.


-- ── ١ · المنظورُ الذي يخرج منه أخطرُ إشعارٍ في المنصّة ───────────────────
--
-- station_products_live مصدرُ كنس الدقيقتين الذي يدفع «⛽ متوفر الآن» إلى
-- مفضّلي المحطة. سطرٌ واحدٌ هنا يُغلق المسار كلَّه بلا لمس Deno.
--
-- و`runs_out_at` يُضاف في **آخر** قائمة الأعمدة: إضافةُ عمودٍ في الذيل وحدها
-- تسمح بـ `create or replace view` بلا إسقاطٍ يكسر ما يعتمد عليه.

create or replace view public.station_products_live as
select sp.station_id,
       sp.product,
       sp.updated_at,
       sp.is_available,
       st.name as station_name,
       st.city as station_city,
       st.slug as station_slug,
       sp.runs_out_at
  from station_products sp
  join stations st on st.id = sp.station_id
 where sp.is_available
   and st.status = 'approved'
   and station_open_now(st.*)
   -- ٤٨ ساعة: ما لم يُؤكَّد بعدها لا يُعلَن عنه، ولو بقي في القاعدة متوفّراً
   and sp.updated_at > now() - interval '48 hours'
   -- وما أعلن صاحبُه نفادَه لا يُعلَن عنه ولو كان الخبر طازجاً
   and (sp.runs_out_at is null or sp.runs_out_at > now());

comment on view public.station_products_live is
  'المنتجات التي يصحّ الإعلان عنها الآن: متوفرة، ومحطتها معتمدة ومفتوحة، وأُكّدت خلال ٤٨ ساعة، ولم يمرّ موعد نفادها.';

revoke all on public.station_products_live from anon, authenticated;
grant select on public.station_products_live to service_role;


-- ── ٢ · لونُ دبّوس الخريطة وشارةُ الازدحام ──────────────────────────────
--
-- المنظوران يتجاهلان أصلاً أصواتَ منتجٍ غير متوفّر (20260817g): لا معنى
-- لـ«ازدحام على الكاز» في محطةٍ لا كاز فيها. والنافدُ منه كغير الموجود.

create or replace view public.station_traffic_avg as
select
  v.station_id,
  count(*) filter (where v.level = 'green')  as green_votes,
  count(*) filter (where v.level = 'yellow') as yellow_votes,
  count(*) filter (where v.level = 'red')    as red_votes,
  count(*)                                   as total_votes,
  (case
     when count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'yellow')
      and count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'green')
       then 'red'
     when count(*) filter (where v.level = 'yellow') >= count(*) filter (where v.level = 'green')
       then 'yellow'
     else 'green'
   end)::traffic_level as majority_level,
  max(v.created_at) as last_vote_at
from traffic_votes v
where v.created_at > now() - interval '30 minutes'
  and exists (
    select 1 from stations st
     where st.id = v.station_id
       and station_open_now(st)
  )
  and (
    v.product is null
    or exists (
      select 1 from station_products sp
       where sp.station_id = v.station_id
         and sp.product    = v.product
         and sp.is_available
         and (sp.runs_out_at is null or sp.runs_out_at > now())
    )
  )
group by v.station_id;

create or replace view public.station_product_traffic as
select
  v.station_id,
  v.product,
  count(*)          as total_votes,
  max(v.created_at) as last_vote_at,
  (case
     when count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'yellow')
      and count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'green')
       then 'red'
     when count(*) filter (where v.level = 'yellow') >= count(*) filter (where v.level = 'green')
       then 'yellow'
     else 'green'
   end)::traffic_level as majority_level
from traffic_votes v
where v.created_at > now() - interval '30 minutes'
  and v.product is not null
  and exists (
    select 1 from stations st
     where st.id = v.station_id
       and station_open_now(st)
  )
  and exists (
    select 1 from station_products sp
     where sp.station_id = v.station_id
       and sp.product    = v.product
       and sp.is_available
       and (sp.runs_out_at is null or sp.runs_out_at > now())
  )
group by v.station_id, v.product;


-- ── ٣ · «أقرب المحطات إليك» في البوت ────────────────────────────────────
--
-- تُنادى من supabase/functions/telegram. وهي لا تفحص لا الحداثةَ ولا الدوام
-- — عيبٌ قائمٌ قبل هذا العمود ولا يُصلَح هنا — لكنّ سردَ منتجٍ أعلن صاحبُه
-- نفادَه قبل ساعة أسوأُ من سردِ خبرٍ شاخ وحدَه.

create or replace function public.nearby_stations(
  p_lat double precision,
  p_lng double precision,
  p_limit int default 5
)
returns table (
  id uuid, name text, city text, address text, phone text,
  lat double precision, lng double precision, slug text,
  distance_km double precision, products text[]
)
language sql
stable
as $$
  select s.id, s.name, s.city, s.address,
    case when s.phone_hidden then null else s.phone end as phone,
    s.lat, s.lng, s.slug,
    6371 * 2 * asin(sqrt(
      power(sin(radians(s.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(s.lat)) *
      power(sin(radians(s.lng - p_lng) / 2), 2)
    )) as distance_km,
    coalesce(array_agg(sp.product::text order by sp.product)
             filter (where sp.is_available
                       and (sp.runs_out_at is null or sp.runs_out_at > now())), '{}') as products
  from stations s
  left join station_products sp on sp.station_id = s.id
  where s.status = 'approved' and not s.is_demo
  group by s.id
  order by distance_km
  limit p_limit;
$$;


-- ── وما لم يُلمس، عن قصد ────────────────────────────────────────────────
--
-- open_announcements() و admin_announcements() تفحصان «هل ما زالت لوحةُ
-- المحطة تؤكّده» لخبرِ محطةٍ غير مسجَّلة رُبطت بمسجَّلة. وإضافةُ الشرط فيهما
-- سطرٌ واحد — لكنّ جسمَيهما ثمانون سطراً يجب أن يُعادا كاملَين، وهذا الملفُّ
-- ليس موضعَ إعادةِ كتابةِ دالّتين لا تخصّان الميزة. تُضاف حين تُراجَع تلك
-- اللوحة، والثغرةُ ضيّقة: خبرُ محطةٍ غير مسجَّلة مربوطةٍ بمسجَّلةٍ أعلنت نفاداً.

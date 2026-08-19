-- تقييمٌ لا يُزوَّر · ورقمٌ يُخفى
--
-- الجزء الأول من اثنين. كل ما هنا **إضافي**: لا يُنزع امتياز ولا تُكسر نسخة
-- منشورة. النزع في 20260819c، ويُشغَّل بعد أن يصل الموقع الجديد إلى الناس —
-- وإلا انكسر كل متصفح يحمل النسخة القديمة.
--
-- السبب: التقييم مفتوح للجميع. والأرقام تجعل الخطر أشدّ ممّا يبدو — ٢٦ تصويتاً
-- منذ البداية، وأكثر المحطات عندها ٠–٤، والمنظور لا يحسب إلا آخر ٣٠ دقيقة.
-- فتصويتان أو ثلاثة تكفي للسيطرة على حالة محطة كاملة. والحارس الوحيد مفتاح في
-- localStorage، وسياسة الجدول `with check (true)` — أي أن أي حاملٍ للمفتاح
-- المنشور يُدرج ما شاء بأمر curl واحد. والتعليق في schema.sql:72 اعترف بهذا
-- منذ البداية وقال «أضفه إن ظهر سوء استعمال». ظهر.
begin;

-- ---------------------------------------------------------------------------
-- ١. من صوّت، ومن أين
-- ---------------------------------------------------------------------------
alter table traffic_votes
  add column if not exists device_id text,
  add column if not exists source    text check (source in ('here', 'trip')),
  add column if not exists lat       double precision,
  add column if not exists lng       double precision;

-- تصويت واحد لكل (محطة، جهاز، منتج) في نافذة الثلاثين دقيقة. الفريد لا يكفي
-- وحده لأن النافذة زمنية لا ثابتة، فالفحص في الدالة — وهذا الفهرس ليجعله رخيصاً.
create index if not exists traffic_votes_device_idx
  on traffic_votes (device_id, station_id, created_at desc)
  where device_id is not null;

-- ---------------------------------------------------------------------------
-- ٢. الباب الوحيد للتصويت
-- ---------------------------------------------------------------------------
-- يُقال بصراحة في الكود لأنه سيُقرأ بعدنا: معرّف الجهاز ليس هوية، والإحداثيات
-- تُزوَّر. هذا يرفع كلفة التلاعب من ضغطة واحدة إلى كتابة برنامج — وهو الفرق بين
-- منافسٍ غاضب في محطته وبين مهاجم متفرّغ. والثاني يحتاج هوية حقيقية، وثمنها أن
-- يفقد التطبيق كونه بلا حساب. فهذا هو الحدّ المقصود، لا الكمال.
create or replace function public.cast_traffic_vote(
  p_station uuid,
  p_level   traffic_level,
  p_product fuel_product default null,
  p_device  text default null,
  p_source  text default null,
  p_lat     double precision default null,
  p_lng     double precision default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  st stations;
  km double precision;
begin
  if p_device is null or length(p_device) < 8 then
    return 'no_device';
  end if;

  select * into st from stations where id = p_station and status = 'approved';
  if not found then return 'no_station'; end if;

  -- لا طابور في ساحة مغلقة. نفس الدالة التي تحرس المنظورين منذ أمس.
  if not station_open_now(st) then return 'closed'; end if;

  -- الحدّ، في القاعدة لا في المتصفح.
  if exists (
    select 1 from traffic_votes v
     where v.device_id = p_device
       and v.station_id = p_station
       and v.product is not distinct from p_product
       and v.created_at > now() - interval '30 minutes'
  ) then
    return 'too_soon';
  end if;

  -- «أنا هنا» تُتحقَّق هنا لا هناك: مسافةٌ يحسبها العميل ويرسلها ليست إثباتاً،
  -- هي ادّعاء. نصف كيلومتر لا مئتا متر — دقة GPS في المدينة تتأرجح، ورفض تصويت
  -- صادق أسوأ من قبول واحد من الرصيف المقابل.
  if p_source = 'here' then
    if p_lat is null or p_lng is null then return 'no_location'; end if;
    km := 6371 * 2 * asin(sqrt(
            power(sin(radians(st.lat - p_lat) / 2), 2) +
            cos(radians(p_lat)) * cos(radians(st.lat)) *
            power(sin(radians(st.lng - p_lng) / 2), 2)
          ));
    if km > 0.5 then return 'too_far'; end if;
  end if;

  insert into traffic_votes (station_id, level, product, device_id, source, lat, lng)
  values (p_station, p_level, p_product, p_device, p_source, p_lat, p_lng);

  return 'ok';
end
$fn$;

revoke all on function public.cast_traffic_vote(uuid, traffic_level, fuel_product, text, text, double precision, double precision) from public;
grant execute on function public.cast_traffic_vote(uuid, traffic_level, fuel_product, text, text, double precision, double precision) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ٣. الرقم — العمود والمنظور
-- ---------------------------------------------------------------------------
-- لا يُمسح الرقم أبداً: هو اسم الدخول أيضاً (p<digits>@muhta.app)، ومسحه يُخرج
-- المالك من حسابه ويكسر دخول البوتين وكشف التكرار. الإخفاء عرضٌ لا حذف.
--
-- ولا سياسة جديدة: «stations: owner update own» قائمة، والمُحفِّز stations_guard
-- يثبّت status وowner_id فقط — فالعمود قابل لكتابة المالك فوراً، والإدارة
-- مغطّاة بـ«stations: admin update any».
alter table stations
  add column if not exists phone_hidden boolean not null default false;

-- contact_name يحمل رقماً ثانياً حقيقياً للمحطات المسجَّلة من بوت تيليجرام:
-- الحقل لا عمود له فيُحشر فيه «الاسم — الرقم» (telegram/index.ts:893). فإخفاء
-- phone وحده يسرّب الرقم الذي طُلب إخفاؤه. المنظور يقصّه عند الإخفاء.
create or replace view public.stations_public
with (security_invoker = true)
as
select
  s.id, s.owner_id, s.name, s.address, s.city, s.kind, s.status, s.slug,
  s.lat, s.lng, s.is_24h, s.opens_at, s.closes_at, s.temp_closed, s.is_demo,
  s.manual_traffic_level, s.manual_traffic_set_at, s.created_at,
  s.phone_hidden,
  case when s.phone_hidden then null else s.phone end as phone,
  case when s.phone_hidden then split_part(s.contact_name, ' — ', 1)
       else s.contact_name end as contact_name
from stations s;

grant select on public.stations_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ٤. nearby_stations — تعريفها لم يكن في المستودع، وتُرجع الرقم
-- ---------------------------------------------------------------------------
-- يناديها بوت تيليجرام بمفتاح الخدمة، فلا RLS ولا امتياز عمود يحرسها. الحارس
-- هنا وحده.
create or replace function public.nearby_stations(
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 5
)
returns table(
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
             filter (where sp.is_available), '{}') as products
  from stations s
  left join station_products sp on sp.station_id = s.id
  where s.status = 'approved' and not s.is_demo
  group by s.id
  order by distance_km
  limit p_limit;
$$;

commit;

-- «تابع هذه المحطة» — بُعد المحطة في alerts.
--
-- السبب من الواقع لا من التصميم: سُجّلت «الرحاب» أربع مرات بأربعة أشخاص خلال
-- ٧١ دقيقة، وكلها بـ«متوفر ٠» — أي أن أحداً منهم لم يكن صاحب محطة. رأوا المحطة
-- تظهر فأرادوا متابعتها، ولم يجدوا في صفحتها ما يقول «تابعها»، فسجّلوها.
--
-- والمتابعة بالمحطة ليست نمطاً جديداً: تيليجرام يفعلها اليوم عبر
-- telegram_favorites (notify/index.ts:95). هذه هي القدرة نفسها ممدودة إلى
-- الويب والتطبيق، عبر alerts نفسه لا عبر جدول ثانٍ — لأن alerts هو ما يقرؤه
-- المُرسِل فعلاً. (push_subscriptions يُكتب ولا يقرؤه مُرسِل واحد؛ لا نبني فوقه.)
--
-- ملف واحد لا ملفّان: عُرف الخطوتين (_a_add ثم _b_revoke) موجود حين تنزع
-- الخطوة الثانية قدرةً يستعملها إصدارٌ منشور. وهنا لا شيء يُنزَع — كل ما دون
-- هذا السطر إضافة، وحذف alerts_for شفّاف للدوال المنشورة كما هو مشروح أدناه.
begin;

-- ---------------------------------------------------------------------------
-- ١. العمود
-- ---------------------------------------------------------------------------
-- null = صفّ مدينة/منتج كما كان. غير null = «هذه المحطة، أيّ وقود، حيثما كانت».
-- on delete cascade: تُحذف المحطة فتذهب متابعاتها معها بلا صفوف يتيمة.
alter table public.alerts
  add column if not exists station_id uuid references public.stations(id) on delete cascade;

create index if not exists alerts_station_idx
  on public.alerts (station_id) where station_id is not null;

-- ---------------------------------------------------------------------------
-- ٢. الفهرسان الفريدان
-- ---------------------------------------------------------------------------
-- صفّ المتابعة مفتاحه (channel, address, '') لأن city وproduct فيه null —
-- وهو مفتاح من اختار «كل المدن وكل المنتجات» حرفياً، ومفتاح أيّ متابعة أخرى.
-- فبلا station_id في المفتاح: 23505 من أول متابعة، ومحطة واحدة لكل جهاز أبداً.
--
-- coalesce إلى UUID صفري لا nulls not distinct: الثانية تحتاج PG 15+، وcoalesce
-- على uuid دالة ثابتة (IMMUTABLE) — بخلاف product::text التي هي STABLE وحدها،
-- وهي سبب انقسام هذين الفهرسين أصلاً.
--
-- آمن على الجدول الحيّ: كل صفّ قائم station_id فيه null، فالعمود المُقنَّع ثابت
-- والمفتاح الجديد = القديم + ثابت. فما نجا من الفهرس القديم لا يخالف الجديد.
-- والحذف والإنشاء داخل هذه المعاملة، فلا تمرّ لحظة بلا تفرّد.
drop index if exists alerts_uniq_product;
drop index if exists alerts_uniq_anyproduct;

create unique index alerts_uniq_product on public.alerts (
  channel, address, coalesce(city, ''),
  coalesce(station_id, '00000000-0000-0000-0000-000000000000'::uuid),
  product
) where product is not null;

create unique index alerts_uniq_anyproduct on public.alerts (
  channel, address, coalesce(city, ''),
  coalesce(station_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where product is null;

-- ---------------------------------------------------------------------------
-- ٣. alerts_for — حذفٌ ثم إنشاء، لا create or replace
-- ---------------------------------------------------------------------------
-- create or replace بمعامل رابع يُنشئ حِملاً زائداً (overload) لا بديلاً، فيرى
-- PostgREST مرشّحَين لنداء يسمّي {p_city,p_products,p_stamp} ويردّ PGRST203 —
-- فيسقط notify وannounce معاً. والحذف ثم الإنشاء داخل معاملة واحدة آمن للدوال
-- المنشورة: نداؤها الثلاثي يظلّ يُحلّ لأن المعامل الرابع افتراضي، فلا يلزم
-- ترتيبٌ في النشر بعد هذه الهجرة.
drop function if exists public.alerts_for(text, fuel_product[], boolean);

create function public.alerts_for(
  p_city     text,
  p_products fuel_product[],
  p_stamp    boolean default true,
  p_station  uuid    default null
)
returns table(channel text, address text, keys jsonb)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_stamp then
    return query
    with matched as (
      -- صفّ المتابعة يطابق محطته وحدها. بدون هذا الشرط يطابق كل إعلان في
      -- المحافظة، لأن city وproduct فيه null وnull تعني «أيّ».
      select a.address, (a.station_id is not null) as is_station
        from alerts a
       where (a.product is null or a.product = any(p_products))
         and case when a.station_id is not null
                  then a.station_id = p_station
                  else (a.city is null or a.city = p_city)
             end
    ),
    eligible as (
      -- مهلتان مستقلّتان للشخص الواحد: واحدة لمحطاته وأخرى لمدنه.
      -- بمهلة واحدة، محطةٌ مجاورة تُعلن قبل عشرين دقيقة تبتلع صامتاً الإشعارَ
      -- الذي طلبه الشخص صراحةً بضغطه «تابع هذه المحطة». وذلك نقضٌ لوعد الزر.
      select distinct m.address, m.is_station
        from matched m
       where not exists (
         select 1
           from alerts b
          where b.address = m.address
            and (b.station_id is not null) = m.is_station
            and b.last_sent_at >= now() - interval '45 minutes'
       )
    ),
    hit as (
      -- تُختم كل صفوف الشخص في نطاقه لا الصفّ المطابق وحده، وإلا بقيت مدنه
      -- الأخرى مفتوحة لإشعار ثانٍ في الثانية التالية (20260817e).
      update alerts a
         set last_sent_at = now()
        from eligible e
       where a.address = e.address
         and (a.station_id is not null) = e.is_station
      returning a.channel, a.address, a.keys
    )
    -- وإن تأهّل النطاقان في النداء نفسه، تبقى الرسالة واحدة: السقف إشعاران في
    -- الـ٤٥ دقيقة لسببين مختلفين، لا إشعاران للسبب الواحد.
    select distinct on (h.address) h.channel, h.address, h.keys
      from hit h
     order by h.address;
  else
    return query
    select distinct on (a.address) a.channel, a.address, a.keys
      from alerts a
     where (a.product is null or a.product = any(p_products))
       and case when a.station_id is not null
                then a.station_id = p_station
                else (a.city is null or a.city = p_city)
           end
     order by a.address;
  end if;
end
$function$;

-- الدالة المُنشأة حديثاً تمنح EXECUTE لـPUBLIC تلقائياً. بدون هذا السطر — في
-- هذه المعاملة لا بعدها — يحصد أيُّ حاملٍ لمفتاح anon المنشور كل عناوين الدفع
-- على المنصة بنداء واحد.
revoke all on function public.alerts_for(text, fuel_product[], boolean, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ٤. الحذف المُنطاق
-- ---------------------------------------------------------------------------
-- alerts_unsubscribe تبقى كما هي: هي المعنى الصادق لزر «إيقاف التنبيهات».
-- لكن saveChoice تستدعيها في كل تعديل للمدينة (lib/alerts.ts:135) لأنها
-- تستبدل الاختيار بحذفٍ ثم إدراج — فتعديل المدينة كان سيمحو المتابعات صامتاً.
-- متابعة المحطة وعدٌ آخر، فلها فعلها.
create or replace function public.alerts_clear_choice(p_address text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from alerts where address = p_address and station_id is null;
$$;

revoke all on function public.alerts_clear_choice(text) from public;
grant execute on function public.alerts_clear_choice(text) to anon, authenticated;

create or replace function public.alerts_unfollow_station(p_address text, p_station uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from alerts where address = p_address and station_id = p_station;
$$;

revoke all on function public.alerts_unfollow_station(text, uuid) from public;
grant execute on function public.alerts_unfollow_station(text, uuid) to anon, authenticated;

-- كلاهما بمفتاح عنوان المتصل نفسه، كـpush_unsubscribe في 20260816_a_add.sql:43 —
-- لا سياسة DELETE بـUSING (true)، فلا يستطيع حامل مفتاح anon تفريغ الجدول.

-- ---------------------------------------------------------------------------
-- ٥. announce_reach — صفّ المتابعة ليس ضمن أيّ مدينة
-- ---------------------------------------------------------------------------
-- الشرط (a.city is null) كان يقصد «من اختار كل المدن». وصفّ المتابعة city فيه
-- null أيضاً — فكان يُحتسب في كل مدينة، فيتضخّم الرقم الذي يراه المدير قبل
-- ضغط «انشر» (StationAnnouncePanel.tsx:65) بأشخاص لن يصلهم ذلك البثّ أصلاً.
create or replace function public.announce_reach(p_cities text[], p_product text default null)
returns json
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

  return (
    select json_build_object(
      'ios',     count(distinct address) filter (where channel = 'ios'),
      'android', count(distinct address) filter (where channel = 'android'),
      'web',     count(distinct address) filter (where channel = 'web')
    )
    from alerts a
    where a.station_id is null
      and (a.city is null or a.city = any(p_cities))
      and (a.product is null or p_product is null or a.product::text = p_product)
  );
end
$fn$;

revoke all on function public.announce_reach(text[], text) from public;
grant execute on function public.announce_reach(text[], text) to authenticated;

commit;

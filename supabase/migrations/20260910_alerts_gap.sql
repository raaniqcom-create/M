-- كبحُ الخمس والأربعين دقيقة يصير قابلاً للرفع — للجدول الرسميّ وحدَه.
--
-- ── العطلُ كما رآه صاحبُ المنصّة ───────────────────────────────────────────
--
-- الساعةَ ١٧:١٨ أعلنت محطةٌ «بانزين محسن». وفي ١٧:٣٨ أُريد نشرُ جدول التوزيع
-- الرسميّ إلى ثمانيةَ عشرَ قضاءً. فقيس: **٣٬٨٢٩ من ١٣٬٥٧٣ محجوبون** — ثمانيةٌ
-- وعشرون بالمئة — لأنّ إعلانَ محطةٍ واحدةٍ سبقه بعشرين دقيقة.
--
-- **والمحجوبُ لا يُؤجَّل بل يسقط**: لا يصله الجدولُ الآن ولا بعد ساعة.
--
-- فالأهمُّ يخسر أمام الأقلّ بترتيب الوصول وحدَه. وهذا ليس ما كُتب الحاجزُ له:
-- كُتب لئلّا تُرسل محطتان في مدينةٍ واحدةٍ رسالتين، لا ليحجب موقفَ التوزيع
-- اليوميَّ كلَّه.
--
-- ── ولماذا لا يُلغى بل يُرفع عند الحاجة ─────────────────────────────────────
--
-- إلغاؤه كلِّيّاً يعني أنّ أربعين محطةً تُعلن في اليوم = أربعون إشعاراً للشخص
-- الواحد. ومن يُزعَج هكذا يُغلق الإشعارَ من إعداداتِ هاتفه، فلا يصله شيءٌ
-- أبداً — لا إعلانُ محطةٍ ولا جدولٌ رسميّ. وهو الخوفُ المكتوب في
-- `owner-daily/index.ts:36` بنصِّه.
--
-- فالحاجزُ يبقى حارساً على إعلانات المحطات، ويُرفع عن الجدول الرسميّ الذي
-- يخرج مرّةً في اليوم. `p_min_gap = 0` ترفعه، والافتراضُ خمسٌ وأربعون كما كان
-- — فكلُّ نداءٍ قائمٍ لا يتغيّر سلوكُه.
--
-- ── وحذفٌ ثمّ إنشاء، لا `create or replace` ───────────────────────────────
--
-- `20260818_station_follow.sql:70` يقولها بنصّها: معاملٌ جديدٌ مع
-- `create or replace` يُنشئ حِملاً زائداً لا بديلاً، فترى PostgREST مرشّحَين
-- لنداءٍ يسمّي ثلاثةَ معاملات وتردّ `PGRST203`.
--
-- والختمُ يبقى على حاله: من أُشعر يُختم، فالإعلانُ التالي من محطةٍ يحترم
-- حاجزَه. المرفوعُ هو **القراءة** لا الكتابة.

begin;

drop function if exists public.alerts_for(text, fuel_product[], boolean, uuid);

create function public.alerts_for(
  p_city text,
  p_products fuel_product[],
  p_stamp boolean default true,
  p_station uuid default null,
  -- دقائقُ الفاصل بين إشعارين لنفس العنوان. صفرٌ يعني: لا كبح.
  p_min_gap int default 45
)
returns table(channel text, address text, keys jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- دقائق منتصف الليل بتوقيت بغداد، مرة واحدة للنداء كله
  nowmin int := extract(hour   from (now() at time zone 'Asia/Baghdad'))::int * 60
              + extract(minute from (now() at time zone 'Asia/Baghdad'))::int;
begin
  if p_stamp then
    return query
    with matched as (
      -- **الترشيحُ أوّلاً.** هنا يعمل alerts_match على (city, product)، فلا
      -- تُمَسّ إلا صفوفُ من يعنيه الخبر.
      select distinct a.address, (a.station_id is not null) as is_station
        from alerts a
       where (a.product is null or a.product = any(p_products))
         and case when a.station_id is not null
                  then a.station_id = p_station
                  else (a.city is null or a.city = p_city)
             end
    ),
    allowed as (
      -- من يُسمح بإزعاجه الآن. عنوانٌ بلا صفّ تفضيلات مسموح — وهو حال الجميع
      -- قبل هجرة التفضيلات، فالسلوك لا يتغيّر لأحد لم يضبط شيئاً.
      select m.address, m.is_station
        from matched m
        left join alert_prefs p on p.address = m.address
       where (p.paused_until is null or p.paused_until <= now())
         and (
           p.hours_from is null or p.hours_to is null
           or case when p.hours_to > p.hours_from
                   then nowmin >= p.hours_from and nowmin < p.hours_to
                   -- نافذة تعبر منتصف الليل، بنفس شكل isOpenNow في lib/hours.ts
                   else nowmin >= p.hours_from or nowmin < p.hours_to
              end
         )
    ),
    eligible as (
      select w.address, w.is_station
        from allowed w
       where p_min_gap <= 0
          or not exists (
         select 1
           from alerts b
          where b.address = w.address
            and (b.station_id is not null) = w.is_station
            and b.last_sent_at >= now() - make_interval(mins => p_min_gap)
       )
    ),
    -- **صفٌّ واحدٌ لكلّ عنوان يُختم، لا صفوفُه كلُّها.**
    --
    -- من اختار ثلاثَ مناطقَ وأربعةَ منتجاتٍ له اثنا عشر صفّاً، وكان الختمُ
    -- يكتبها جميعاً — خمسةٌ وثلاثون ألفَ كتابةٍ لسبعةِ آلاف شخص. وحاجزُ الخمس
    -- والأربعين دقيقة يسأل `exists` عن **أيّ** صفٍّ للعنوان، فصفٌّ واحدٌ يكفيه.
    pick as (
      select distinct on (e.address) a.id, a.channel, a.address, a.keys
        from eligible e
        join alerts a
          on a.address = e.address
         and (a.station_id is not null) = e.is_station
       order by e.address, a.id
    ),
    hit as (
      update alerts a
         set last_sent_at = now()
        from pick p
       where a.id = p.id
      returning a.channel, a.address, a.keys
    )
    select h.channel, h.address, h.keys
      from hit h
     order by h.address;

  else
    return query
    select distinct on (a.address) a.channel, a.address, a.keys
      from alerts a
      left join alert_prefs p on p.address = a.address
     where (a.product is null or a.product = any(p_products))
       and case when a.station_id is not null
                then a.station_id = p_station
                else (a.city is null or a.city = p_city)
           end
       and (p.paused_until is null or p.paused_until <= now())
       and (
         p.hours_from is null or p.hours_to is null
         or case when p.hours_to > p.hours_from
                 then nowmin >= p.hours_from and nowmin < p.hours_to
                 else nowmin >= p.hours_from or nowmin < p.hours_to
            end
       )
     order by a.address;
  end if;
end
$function$;

-- والمهلةُ تُعاد: الحذفُ أسقط ما ضبطته `20260909_alerts_for_timeout`، وبدونها
-- يقتل حارسُ الثماني ثوانٍ ختمَ ثلاثةَ عشرَ ألفَ صفّ.
alter function public.alerts_for(text, fuel_product[], boolean, uuid, int)
  set statement_timeout = '60s';

commit;

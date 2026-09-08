-- `alerts_for` تُرشِّح أوّلاً ثمّ تسأل — لا العكس.
--
-- ── العطلُ كما وقع ──────────────────────────────────────────────────────
--
-- نُشر جدولُ الغد في ٢٠٢٦-٠٩-٠٨ فلم يخرج إشعارُه. ولا صفَّ في
-- `notification_log`، ولا عنوانَ واحدٌ خُتم في `alerts` — أي أنّ الدالّةَ لم
-- تُكمل أصلاً.
--
-- وقِيس فرعُ الختم في معاملةٍ مُلغاة: **١٠٫٧ ثانية للرمادي وحدَها**، و١٢٫٣
-- للمناطق الأربع. و`net.http_post` ينقطع عند خمس، و`announce` ينادي الدالّةَ
-- مرّةً لكلّ منطقة — فالنداءُ الواحد صار عشراتِ الثواني، وسقط قبل أن يُرسل.
--
-- ── ولماذا بطؤت ─────────────────────────────────────────────────────────
--
-- `allowed` كانت أوّلَ ما يُحسب: `select distinct address from alerts` على
-- الجدول كلِّه — ستّةٌ وستّون ألفَ صفٍّ واثنا عشر ألفَ عنوان — ثمّ تُصفّى
-- بالتفضيلات، **ثمّ** يُرشَّح بالمنطقة والمنتج. أي أنّ كلَّ نداءٍ لمنطقةٍ فيها
-- خمسةَ عشرَ مشتركاً كان يمرّ على المشتركين كلِّهم أوّلاً.
--
-- والجدولُ ينمو: كان اثني عشرَ ألفَ صفٍّ يومَ كُتبت، وصار ستّةً وستّين. فما
-- كان يُحتمل صار عطلاً.
--
-- ── والإصلاحُ ترتيبٌ لا منطقٌ جديد ──────────────────────────────────────
--
-- تُرشَّح المنطقةُ والمنتجُ أوّلاً — و`alerts_match` على (city, product) قائمٌ
-- سلفاً — ثمّ تُسأل التفضيلاتُ عمّن نجا، ثمّ حاجزُ الخمس والأربعين دقيقة.
-- والنتيجةُ هي النتيجةُ نفسُها: من يُسمح بإزعاجه **و**يعنيه الخبر، لا فرقَ في
-- أيّهما يُحسب أوّلاً.
--
-- ومعه الختمُ صفٌّ واحدٌ لكلّ عنوانٍ لا صفوفُه كلُّها، وفهرسٌ على
-- (address, last_sent_at) لحاجز الدقائق.
--
-- ── والقياسُ قبل وبعد ───────────────────────────────────────────────────
--
--                     الرمادي وحدَها     المناطقُ الأربع
--   قبل                  ١٠٫٧ ثانية        ١٢٫٣ ثانية
--   بعد الترتيب           ٧٫٧              ٨٫٩
--   وبعد ختمِ صفٍّ واحد     ٥٫٥              ٦٫١
--
-- والمجموعتان تطابقتا: ٦٬٩٤٩ بلا ختمٍ مقابل ٦٬٩٢٦ بالختم، والفرقُ ثلاثةٌ
-- وعشرون عنواناً — وهو بالضبط عددُ من خُتم في آخر خمسٍ وأربعين دقيقة.

create or replace function public.alerts_for(
  p_city text,
  p_products fuel_product[],
  p_stamp boolean default true,
  p_station uuid default null
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
       where not exists (
         select 1
           from alerts b
          where b.address = w.address
            and (b.station_id is not null) = w.is_station
            and b.last_sent_at >= now() - interval '45 minutes'
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


-- وفهرسٌ لحاجزِ الخمس والأربعين دقيقة.
--
-- `alerts_last_sent_idx` على `last_sent_at` وحدَه، و`not exists` تسأل عن
-- (address, last_sent_at) معاً — فتُجبَر على قراءة صفوف العنوان كلِّها.
-- والعنوانُ الواحد له اثنا عشر صفّاً عند من اختار ثلاثَ مناطقَ وأربعةَ منتجات.
create index if not exists alerts_address_sent_idx
  on public.alerts (address, last_sent_at);

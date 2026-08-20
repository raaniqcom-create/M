-- الإشعارات كلّها متوقّفة منذ ٣٩ ساعة، ولا شيء يقول ذلك.
--
-- بلاغ: «محطات فتحت أبوابها ولم يصلني إشعار». والقياس: خمس نشرات، أربع منها
-- ضغطُ تأكيدٍ حقيقي (الصفوف السبعة في مللي ثانية واحدة)، وصفر ختم إرسال.
-- وسجلّ الدوال يقول إن notify نُوديت وردّت HTTP 200 في كل مرة.
--
-- والسبب سطرٌ واحد:
--
--   from (select distinct address from alerts) a
--
-- الدالة تُعيد جدولاً أحد أعمدته اسمه address، فيصير متغيّراً في PL/pgSQL
-- يزاحم اسم العمود. فترمي 42702 «إشارة غامضة» في كل نداء بـp_stamp = true —
-- أي في كل إرسال حقيقي. وفرع المعاينة (p_stamp = false) يؤهّل كل إشاراته
-- فيعمل، فتبدو الدالة سليمة لمن اختبرها بلا ختم. اختبرتُها هكذا اليوم فعلاً،
-- ورأيت ٢٩٠ و٣٧١ مؤهّلاً، فقلت «القاعدة سليمة» — وكانت مكسورة.
--
-- والخطأ لا يظهر لأحد: notify تلتقطه وتسقط إلى نداءٍ قديم بثلاثة معاملات لا
-- وجود له، فيفشل هو الآخر، فتردّ قائمةً فارغة وHTTP 200. صاحب المحطة يرى
-- «نُشر»، والمشترك لا يسمع شيئاً، ولا شاشة واحدة تقول إن شيئاً انكسر.
--
-- ووقع مع هجرة أوقات الهدوء التي أعادت كتابة الدالة: آخر إرسال ناجح ٠٨-١٨
-- الساعة ١٦:١٠، وهي شُغّلت ١٨:٢٩ من اليوم نفسه.
--
-- ويُحذف أولاً لأن الاستبدال لا يقبل إسقاط القيم الافتراضية، وهي تُعاد كما هي.
begin;

drop function if exists public.alerts_for(text, fuel_product[], boolean, uuid);

CREATE FUNCTION public.alerts_for(p_city text, p_products fuel_product[], p_stamp boolean DEFAULT true, p_station uuid DEFAULT NULL::uuid)
 RETURNS TABLE(channel text, address text, keys jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  -- دقائق منتصف الليل بتوقيت بغداد، مرة واحدة للنداء كله

  nowmin int := extract(hour   from (now() at time zone 'Asia/Baghdad'))::int * 60

              + extract(minute from (now() at time zone 'Asia/Baghdad'))::int;

begin

  if p_stamp then

    return query

    with allowed as (

      -- من يُسمح بإزعاجه الآن. عنوانٌ بلا صفّ تفضيلات مسموح — وهو حال الجميع

      -- قبل هذه الهجرة، فالسلوك لا يتغيّر لأحد لم يضبط شيئاً.

      select a.address

        from (select distinct alerts.address from alerts) a

        left join alert_prefs p on p.address = a.address

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

    matched as (

      select a.address, (a.station_id is not null) as is_station

        from alerts a

        join allowed w on w.address = a.address

       where (a.product is null or a.product = any(p_products))

         and case when a.station_id is not null

                  then a.station_id = p_station

                  else (a.city is null or a.city = p_city)

             end

    ),

    eligible as (

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

      update alerts a

         set last_sent_at = now()

        from eligible e

       where a.address = e.address

         and (a.station_id is not null) = e.is_station

      returning a.channel, a.address, a.keys

    )

    select distinct on (h.address) h.channel, h.address, h.keys

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

$function$
;

revoke all on function public.alerts_for(text, fuel_product[], boolean, uuid) from public;
grant execute on function public.alerts_for(text, fuel_product[], boolean, uuid) to service_role;

commit;

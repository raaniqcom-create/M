-- مهلة الـ٤٥ دقيقة تُحسب على الإنسان لا على الصفّ.
--
-- الشخص له صفّ لكل (مدينة، منتج). وكانت المهلة تُختم على الصفّ المطابق وحده،
-- فمن اشترك بالرمادي والفلوجة يُختم صفّ الرمادي ويبقى صفّ الفلوجة صالحاً —
-- فيرنّ هاتفه مرتين خلال ثوانٍ حين يُعلَن عن المدينتين معاً. قياسٌ على
-- المشتركين الحاليين: ١٠ أشخاص يصلهم إشعاران و٤ ثلاثة، من أصل ١٠٥.
--
-- والقاعدة نفسها مكتوبة في الكود: «من يصله خمس رنّات في عشر ثوانٍ يحذف
-- التطبيق — وتلك تكلفة كل إشعار مستقبلي لا هذه وحدها». فالمهلة كانت تقصد
-- الإنسان منذ البداية، وهذا إصلاح لتنفيذها لا تغيير لنيّتها.
--
-- الأثر المقصود: من يتابع أكثر من مدينة أو أكثر من منتج يصله إشعار واحد كل
-- ٤٥ دقيقة، لا إشعار لكل اشتراك. وهذا هو المطلوب: أن يصل الخبر، لا أن يتكرر.
create or replace function public.alerts_for(
  p_city     text,
  p_products fuel_product[],
  p_stamp    boolean default true
)
returns table(channel text, address text, keys jsonb)
language plpgsql
security definer
as $function$
begin
  if p_stamp then
    return query
    with eligible as (
      -- مؤهَّل إن طابق أحد صفوفه هذا الإعلان، ولم يُرسَل إلى أيٍّ من صفوفه
      -- خلال آخر ٤٥ دقيقة. الشرط الثاني هو الفرق كله.
      select distinct a.address
        from alerts a
       where (a.city    is null or a.city    = p_city)
         and (a.product is null or a.product = any(p_products))
         and not exists (
           select 1
             from alerts b
            where b.address = a.address
              and b.last_sent_at >= now() - interval '45 minutes'
         )
    ),
    hit as (
      -- تُختم كل صفوف الشخص لا الصفّ المطابق وحده، وإلا بقيت مدنه الأخرى
      -- مفتوحة لإشعار ثانٍ في الثانية التالية
      update alerts a
         set last_sent_at = now()
       where a.address in (select e.address from eligible e)
      returning a.channel, a.address, a.keys
    )
    select distinct on (h.address) h.channel, h.address, h.keys
      from hit h
     order by h.address;
  else
    return query
    select distinct on (a.address) a.channel, a.address, a.keys
      from alerts a
     where (a.city    is null or a.city    = p_city)
       and (a.product is null or a.product = any(p_products))
     order by a.address;
  end if;
end
$function$;

-- رقمان لنفس الشيء، والفرق ٤٨.
--
-- البانر يقول للرمادي ٦١٨، وجدول الإحصائيات يقول ٥٧٠. والسبب شرطٌ واحد:
--
--   admin_stats:      where city is not null   ← يُسقط من اختار «كل المدن»
--   watchers_by_city: city is null or city = c ← يحتسبه في كل مدينة
--
-- و٤٨ مشتركاً اختاروا «كل المدن». وهم مشتركون في الرمادي فعلاً: يصلهم إشعارها،
-- ويصلهم إشعار الرطبة أيضاً. فإسقاطهم من الجدول يقلّ عن الحقيقة، والصحيح ما
-- يفعله البانر — لأن السؤال «كم يصلهم خبر هذه المدينة» لا «كم سكنها».
--
-- والقاعدة تُقال في الواجهة ولا تُخفى: مجموع أعمدة المدن ١٦٦٦ بينما الأشخاص
-- ٩٢٥، لأن الواحد يشترك بأكثر من مدينة ويُحتسب في كلّ منها. فأُضيف العددان معاً
-- — «اشتراكات بالمدن» و«أشخاص» — بدل رقم واحد يُقرأ خطأً مهما كان.
begin;

create or replace function public.admin_stats()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return json_build_object(
    'devices', (
      select coalesce(json_object_agg(platform, n), '{}'::json)
        from (select platform, count(*) n from device_tokens group by platform) d
    ),
    'listeners', (
      select coalesce(json_object_agg(channel, n), '{}'::json)
        from (select channel, count(distinct address) n from alerts group by channel) a
    ),
    'alertRows', (select count(*) from alerts),
    'stationFollows', (select count(*) from alerts where station_id is not null),
    'paused', (select count(*) from alert_prefs where paused_until > now()),
    'quietSet', (select count(*) from alert_prefs where hours_from is not null),

    -- الأشخاص الفعليون: عنوان دفع واحد مهما بلغت مدنه. وهذا وحده يُجمع.
    'cityPeople', (select count(distinct address) from alerts where station_id is null),
    -- ومن اختار «كل المدن»، معلناً لأنه سبب فرق كل صفّ في الجدول.
    'allCities',  (select count(distinct address) from alerts where station_id is null and city is null),

    'byCity', (
      select coalesce(json_agg(row_to_json(t) order by t.people desc), '[]'::json)
        from (
          with base as (
            select address, city, channel from alerts where station_id is null
          )
          select c.city,
                 -- نفس قاعدة watchers_by_city حرفاً بحرف: صاحب «كل المدن»
                 -- ينتظر خبر الأنبار كلها، ومدينة هذه واحدة منها.
                 count(distinct b.address)                                          people,
                 count(distinct b.address) filter (where b.city is not null)         explicit,
                 count(distinct b.address) filter (where b.channel = 'ios')          ios,
                 count(distinct b.address) filter (where b.channel = 'android')      android,
                 count(distinct b.address) filter (where b.channel = 'web')          web
            from (select distinct city from base where city is not null) c
            join base b on (b.city is null or b.city = c.city)
           group by c.city
        ) t
    )
  );
end
$fn$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

commit;

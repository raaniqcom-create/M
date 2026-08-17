-- الإحصائيات مقسّمة على المدن.
--
-- الأرقام الكلية تقول كم شخصاً في النظام، ولا تقول أين هم. وقرار الإطلاق
-- والإعلان يُتخذ بالمدينة: من يعرف أن الرمادي فيها ٦٧ مشتركاً والكرمة ١٢
-- يعرف أين يبدأ.
--
-- distinct address لا count(*): الشخص الواحد له صفّ لكل (مدينة، منتج)، فعدّ
-- الصفوف يضخّم العدد أضعافاً.
create or replace function public.admin_stats()
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
    'byCity', (
      select coalesce(json_agg(row_to_json(t) order by t.people desc), '[]'::json)
        from (
          select city,
                 count(distinct address)                                      as people,
                 count(distinct address) filter (where channel = 'ios')       as ios,
                 count(distinct address) filter (where channel = 'android')   as android,
                 count(distinct address) filter (where channel = 'web')       as web
            from alerts
           where city is not null
           group by city
        ) t
    )
  );
end
$fn$;

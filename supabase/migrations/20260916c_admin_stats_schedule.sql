-- إحصائيّاتُ جدول التوزيع للإدارة: كم محطةً وردت فيه منذ اعتماده، وكم يوماً نُشر.
--
-- «أريد إحصائيّةَ عدد المحطات في الجدول منذ اعتماده» — صاحبُ المنصّة، ١٦ أيلول.
-- RLS على fuel_schedule تحجب ما مضى عن المتصفّح (اليومَ والغدَ فقط)، فالعدُّ
-- هنا داخل admin_stats() الآمنة. والمحطةُ «واحدة» بربطها إن رُبطت، وإلّا
-- باسمها ومدينتها — كما تعدّها لوحةُ الجدول.
--
-- نسخةُ 20260819h_unify_city_counts.sql حرفيّاً مع أربعة مفاتيحَ مضافة.
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

    'cityPeople', (select count(distinct address) from alerts where station_id is null),
    'allCities',  (select count(distinct address) from alerts where station_id is null and city is null),

    'byCity', (
      select coalesce(json_agg(row_to_json(t) order by t.people desc), '[]'::json)
        from (
          with base as (
            select address, city, channel from alerts where station_id is null
          )
          select c.city,
                 count(distinct b.address)                                          people,
                 count(distinct b.address) filter (where b.city is not null)         explicit,
                 count(distinct b.address) filter (where b.channel = 'ios')          ios,
                 count(distinct b.address) filter (where b.channel = 'android')      android,
                 count(distinct b.address) filter (where b.channel = 'web')          web
            from (select distinct city from base where city is not null) c
            join base b on (b.city is null or b.city = c.city)
           group by c.city
        ) t
    ),

    -- جدولُ التوزيع منذ اعتماده
    'scheduleStations', (
      select count(distinct coalesce(linked_station_id::text, lower(station_name) || '|' || coalesce(city, '')))
        from fuel_schedule
    ),
    'scheduleDays',  (select count(distinct for_date) from fuel_schedule),
    'scheduleRows',  (select count(*) from fuel_schedule),
    'scheduleSince', (select min(for_date) from fuel_schedule)
  );
end
$fn$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

commit;

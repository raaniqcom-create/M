-- «متابعة المحطات»: من لم يربط جهازَه، ومن ربطه وتوقّف عن التحديث — للإدارة وحدَها.
--
-- «أريد زرّاً لإرسال رسالةٍ بالخطوات إلى المحطات التي لم تربط الجهاز … ورسالةً
-- أخرى لمن ربط الجهاز لكنّه متوقّفٌ عن التحديث» — صاحبُ المنصّة، ١٥ أيلول.
-- المتصفّحُ لا يقرأ device_tokens ولا telegram_links (RLS) — فصفٌّ واحدٌ لكلّ
-- محطةٍ معتمدة يحمل ما تحتاجه الرسالة: الاسمُ وصاحبُها ومدينتُها وعمرُها،
-- وعددُ أجهزتها وتيليغرامها، وآخرُ تحديثٍ لمنتجاتها، وعددُ مهتمّي مدينتها
-- (بقاعدة watchers_by_city نفسِها).
begin;

create or replace function public.admin_outreach()
returns table (
  id uuid, name text, city text, phone text, contact_name text, created_at timestamptz,
  temp_closed boolean, devices integer, telegram integer, last_update timestamptz, watchers integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select s.id, s.name, s.city, s.phone, s.contact_name, s.created_at, s.temp_closed,
           (select count(*)::int from device_tokens d where d.station_id = s.id),
           (select count(*)::int from telegram_links l where l.station_id = s.id),
           (select max(p.updated_at) from station_products p where p.station_id = s.id),
           (select count(distinct a.address)::int from alerts a
             where a.station_id is null and (a.city is null or a.city = s.city))
      from stations s
     where s.status = 'approved' and s.is_demo = false
     order by s.city, s.name;
end;
$$;

revoke all on function public.admin_outreach() from public, anon;
grant execute on function public.admin_outreach() to authenticated;

commit;

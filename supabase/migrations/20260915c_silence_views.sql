-- «موقوفةٌ بسبب عدم النشر»: كم شخصاً رأى المحطةَ موقوفة.
--
-- «عندما تظهر لمشتركٍ يُحسب لكم شخصٍ ظهرت وقرأ أنّها موقوفة بسبب عدم
-- النشر، كي تكون كأداة حرصٍ لهم لمتابعة النشر» — صاحبُ المنصّة، ١٥ أيلول.
--
-- الإيقافُ نفسُه حالةٌ مشتقّة (lib/silence.ts: ٧٢ ساعةً بلا نشر) لا عمودٌ هنا.
-- وهذا عدّادٌ واحدٌ لكلّ محطة، على نمط story_views: لا أجهزةَ تُحفظ، والجهازُ
-- يحرس نفسَه بألّا يعدّ مرّتين في اليوم (localStorage) — فالرقمُ «أشخاصٌ في
-- أيّام» لا زيارات. ويُصفَّر لحظةَ تنشر المحطةُ ثانيةً: العدُّ لفترة الإيقاف
-- الجارية، لا لتاريخها كلِّه.
begin;

create table if not exists public.silence_views (
  station_id uuid primary key references public.stations(id) on delete cascade,
  views      integer     not null default 0,
  since      timestamptz not null default now()
);

alter table public.silence_views enable row level security;
revoke all on public.silence_views from anon, authenticated;

comment on table public.silence_views is
  'كم مرّةً ظهرت المحطةُ «موقوفةً بسبب عدم النشر» لقارئ (مرّةٌ لكلّ جهازٍ في اليوم). يُصفَّر عند النشر.';

-- يعدّ دفعةً واحدة: الصفحةُ تعرض عدّةَ محطاتٍ موقوفة، فنداءٌ واحدٌ لا نداءٌ لكلّ بطاقة.
create or replace function public.silence_seen(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  if p_ids is null or array_length(p_ids, 1) is null or array_length(p_ids, 1) > 60 then
    return;
  end if;
  foreach sid in array p_ids loop
    insert into public.silence_views (station_id, views)
    values (sid, 1)
    on conflict (station_id) do update set views = silence_views.views + 1;
  end loop;
exception
  -- معرّفٌ لا محطةَ له (foreign key): لا شيءَ يُعدّ ولا خطأَ يُرفع للقارئ.
  when foreign_key_violation then
    return;
end;
$$;

revoke all on function public.silence_seen(uuid[]) from public;
grant execute on function public.silence_seen(uuid[]) to anon, authenticated;

-- لصاحب المحطة والإدارة: كم شخصاً رآها موقوفة.
create or replace function public.silence_seen_count(p_station uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not exists (
    select 1 from public.stations s where s.id = p_station and s.owner_id = auth.uid()
  ) and (select p.role from public.profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select v.views into n from public.silence_views v where v.station_id = p_station;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.silence_seen_count(uuid) from public;
grant execute on function public.silence_seen_count(uuid) to authenticated;

-- النشرُ يصفّر العدّاد: أيُّ تحديثٍ لمنتجٍ هو نشر.
create or replace function public.silence_reset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.updated_at is distinct from old.updated_at then
    delete from public.silence_views where station_id = new.station_id;
  end if;
  return new;
end;
$$;

drop trigger if exists silence_reset on public.station_products;
create trigger silence_reset
  after update on public.station_products
  for each row execute function public.silence_reset();

-- «متابعة المحطات» تعرض الرقمَ للإدارة بجانب أيّام الصمت.
drop function if exists public.admin_outreach();
create function public.admin_outreach()
returns table (
  id uuid, name text, city text, phone text, contact_name text, created_at timestamptz,
  temp_closed boolean, devices integer, telegram integer, last_update timestamptz, watchers integer,
  seen_suspended integer
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
             where a.station_id is null and (a.city is null or a.city = s.city)),
           coalesce((select v.views from silence_views v where v.station_id = s.id), 0)
      from stations s
     where s.status = 'approved' and s.is_demo = false
     order by s.city, s.name;
end;
$$;

revoke all on function public.admin_outreach() from public, anon;
grant execute on function public.admin_outreach() to authenticated;

commit;

-- ربطٌ صريح بالمحطة بدل مطابقة الاسم.
--
-- اسم المحطة في الإعلان نصٌّ حرّ، والربط يقع بـ ilike '%الاسم%' في الاتجاهين.
-- وهي مطابقةٌ تخطئ في الجهتين: «الواحة الخضراء» تطابق «محطة الواحة الخضراء»
-- بالصدفة، و«الوئام» قد تطابق محطتين، واسمٌ يُكتب بصياغة أخرى لا يطابق شيئاً
-- فتظهر محطة مسجّلة في لوحة «غير المسجّلة».
--
-- فالإدارة تختار المدينة، ثم المحطة من قائمة مسجّلاتها. وما لم يكن مسجّلاً
-- يُكتب اسمه — وهذا وحده يبقى نصّاً حرّاً، لأنه لا مرجع له.
--
-- والقديم يبقى على المطابقة: صفوفٌ كُتبت قبل هذا العمود لا معرّف لها، وحذفها
-- يُضيّع تاريخاً. فالأولوية للمعرّف، والمطابقة احتياطٌ لما سبق.
begin;

alter table announcements
  add column if not exists linked_station_id uuid references stations(id) on delete set null;

comment on column announcements.linked_station_id is
  'المحطة المسجّلة المختارة من القائمة. null لمحطة لم تنضمّ بعد.';

create index if not exists announcements_linked_station_idx
  on announcements (linked_station_id) where linked_station_id is not null;

drop function if exists public.admin_announcements();
drop function if exists public.open_announcements();

create function public.open_announcements()
returns table(
  id            uuid,
  station_name  text,
  origin_city   text,
  product       text,
  cities        text[],
  send_at       timestamptz,
  yes_votes     int,
  no_votes      int,
  admin_verdict text,
  admin_until   timestamptz,
  station_id    uuid,
  as_popup      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((select value from app_config where key = 'unregistered_close_hm'), '21:00')::time hm
  ),
  base as (
    select a.*,
           coalesce(v.yes, 0)::int yes,
           coalesce(v.no, 0)::int  no,
           greatest(a.sent_at, coalesce(v.last_vote, a.sent_at),
                    coalesce(a.admin_verdict_at, a.sent_at)) last_beat,
           (a.admin_verdict_at >= now() - interval '30 minutes') admin_live,
           -- المعرّف الصريح أولاً، والمطابقة للصفوف القديمة وحدها.
           coalesce(
             (select st.id from stations st
               where st.id = a.linked_station_id and st.status = 'approved'),
             (select st.id from stations st
               where st.status = 'approved'
                 and (a.station_name ilike '%' || st.name || '%'
                      or st.name ilike '%' || a.station_name || '%')
               limit 1)
           ) sid
      from announcements a
      left join lateral (
        select count(*) filter (where verdict = 'yes') yes,
               count(*) filter (where verdict = 'no')  no,
               max(created_at) filter (where created_at >= now() - interval '30 minutes') last_vote
          from announcement_votes w
         where w.announcement_id = a.id
      ) v on true
     where a.active and a.station_name is not null and a.sent_at is not null
  )
  select b.id, b.station_name, b.origin_city, b.product, b.cities, b.send_at,
         b.yes, b.no,
         case when b.admin_live then b.admin_verdict end,
         case when b.admin_live then b.admin_verdict_at + interval '30 minutes' end,
         b.sid, b.as_popup
    from base b, cfg
   where (b.sent_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date
     and case when b.sid is not null then true
              else (now() at time zone 'Asia/Baghdad')::time < cfg.hm end
     and case
           when b.admin_live then b.admin_verdict = 'available'
           else b.no - b.yes < 4 and b.last_beat >= now() - interval '2 hours'
         end
     and (
       b.sid is null
       or exists (
         select 1 from station_products sp
          join stations st on st.id = sp.station_id
          where sp.station_id = b.sid
            and (b.product is null or sp.product::text = b.product)
            and sp.is_available
            and sp.updated_at >= now() - interval '24 hours'
            and station_open_now(st.*)
       )
     )
   order by b.sent_at desc;
$$;

revoke all on function public.open_announcements() from public;
grant execute on function public.open_announcements() to anon, authenticated;

create function public.admin_announcements()
returns table(
  id            uuid,
  station_name  text,
  origin_city   text,
  product       text,
  cities        text[],
  send_at       timestamptz,
  yes_votes     int,
  no_votes      int,
  admin_verdict text,
  admin_until   timestamptz,
  station_id    uuid,
  as_popup      boolean,
  hidden        boolean,
  hidden_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((select value from app_config where key = 'unregistered_close_hm'), '21:00')::time hm
  ),
  base as (
    select a.*,
           coalesce(v.yes, 0)::int yes,
           coalesce(v.no, 0)::int  no,
           greatest(a.sent_at, coalesce(v.last_vote, a.sent_at),
                    coalesce(a.admin_verdict_at, a.sent_at)) last_beat,
           (a.admin_verdict_at >= now() - interval '30 minutes') admin_live,
           coalesce(
             (select st.id from stations st
               where st.id = a.linked_station_id and st.status = 'approved'),
             (select st.id from stations st
               where st.status = 'approved'
                 and (a.station_name ilike '%' || st.name || '%'
                      or st.name ilike '%' || a.station_name || '%')
               limit 1)
           ) sid
      from announcements a
      left join lateral (
        select count(*) filter (where verdict = 'yes') yes,
               count(*) filter (where verdict = 'no')  no,
               max(created_at) filter (where created_at >= now() - interval '30 minutes') last_vote
          from announcement_votes w
         where w.announcement_id = a.id
      ) v on true
     where a.active and a.station_name is not null and a.sent_at is not null
  )
  select b.id, b.station_name, b.origin_city, b.product, b.cities, b.send_at,
         b.yes, b.no,
         case when b.admin_live then b.admin_verdict end,
         case when b.admin_live then b.admin_verdict_at + interval '30 minutes' end,
         b.sid, b.as_popup,
         not exists (select 1 from open_announcements() o where o.id = b.id),
         case
           when exists (select 1 from open_announcements() o where o.id = b.id) then null
           when b.sid is not null and not exists (
                  select 1 from station_products sp join stations st on st.id = sp.station_id
                   where sp.station_id = b.sid
                     and (b.product is null or sp.product::text = b.product)
                     and sp.is_available and sp.updated_at >= now() - interval '24 hours'
                     and station_open_now(st.*))
             then 'لوحة المحطة لم تعد تؤكّده'
           when b.sid is null and (now() at time zone 'Asia/Baghdad')::time >= cfg.hm
             then 'انتهى وقت العرض (' || to_char(cfg.hm, 'HH24:MI') || ')'
           when b.admin_live and b.admin_verdict = 'gone' then 'أخفيتَه بقرارك'
           when b.no - b.yes >= 4 then 'التصويت: نفد بفارق ' || (b.no - b.yes)
           when b.last_beat < now() - interval '2 hours' then 'ساكن منذ أكثر من ساعتين'
           else 'خارج يومه'
         end
    from base b, cfg
   where (b.sent_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date
     and (select p.role::text from profiles p where p.id = auth.uid()) = 'admin'
   order by b.sent_at desc;
$$;

revoke all on function public.admin_announcements() from public;
grant execute on function public.admin_announcements() to authenticated;

commit;

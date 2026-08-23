-- خبر المحطة المسجّلة يُعرض أيضاً — بلونٍ آخر، وبسندٍ من المحطة نفسها.
--
-- كنتُ أُخرج كل محطة مسجّلة من اللوحة، لأن عرضها تحت «محطات غير مسجّلة» يُسيء
-- إليها ويُكذّب المنصّة. وكان الاستثناء صحيحاً للوحة، وخطأً للخبر: أُعلن عن
-- بانزين محسن في الواحة الخضراء — وهي المحطة الوحيدة التي تحمله في الرمادي —
-- فلم يظهر لأحد، ولم يجد الناس موضعاً يؤكّدونه فيه.
--
-- فالفصل صار في العرض لا في الحجب: خبرٌ عن مسجّلة يُعرض بالأخضر وبرابط صفحتها،
-- وخبرٌ عن غيرها يبقى أحمر.
--
-- وشرطٌ يخصّ المسجّلة وحدها: لا يُعرض خبرها إلا ما دامت لوحتُها تؤكّده. صاحبها
-- يملك تحديثها لحظةً بلحظة، فإن رفع المنتج فقد سحب كلمته — وإعلانٌ يناقض لوحة
-- صاحبه هو أسوأ ما تعرضه منصّة، لأن الطرفين نحن.
begin;

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
  station_id    uuid
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
           -- المحطة المسجّلة المطابقة، إن وُجدت.
           (select st.id from stations st
             where st.status = 'approved'
               and (a.station_name ilike '%' || st.name || '%'
                    or st.name ilike '%' || a.station_name || '%')
             limit 1) sid
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
         b.sid
    from base b, cfg
   where (b.sent_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date
     and case
           -- المسجّلة: دوامها هو حدّها، لا وقت غير المسجّلة.
           when b.sid is not null then true
           else (now() at time zone 'Asia/Baghdad')::time < cfg.hm
         end
     and case
           when b.admin_live then b.admin_verdict = 'available'
           else b.no - b.yes < 4
                and b.last_beat >= now() - interval '2 hours'
         end
     -- ولوحة المحطة المسجّلة هي السند: تُرفع الكلمة فيسقط الخبر.
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
           (select st.id from stations st
             where st.status = 'approved'
               and (a.station_name ilike '%' || st.name || '%'
                    or st.name ilike '%' || a.station_name || '%')
             limit 1) sid
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
         b.sid,
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

-- متى يسكت خبرُ محطةٍ لا نملك عنها إلا لحظة؟
--
-- كان يبقى إلى آخر اليوم بتوقيت بغداد. وذلك أطول ممّا يحتمله الخبر نفسه:
--
--   · خبرٌ لم يصوّت عليه أحد منذ ساعتين لم يعد يعنيه أحد. إمّا نفد فلم يبقَ من
--     يؤكّده، أو ابتعد عن بال الناس — وفي الحالتين عرضُه ادّعاءٌ بلا سند.
--   · ومحطةٌ تغلق التاسعة مساءً لا وقود لديها في العاشرة. والمسجّلة تقول دوامها
--     بنفسها؛ وغير المسجّلة لا تقوله، فنضع لها وقتاً واحداً يُغلق أخبارها كلها.
--
-- وقرار الإدارة يسبق قاعدة الساعتين — يؤكّده فيعود، ويُنعش ساعة النشاط معه فلا
-- يسقط بعد نصف ساعة بحجّة أنه راكد. أمّا وقت الإغلاق فمطلق: بعده لا يُعرض خبر
-- مهما أكّده أحد، لأن ساحةً مغلقة لا تبيع.
begin;

insert into app_config (key, value)
values ('unregistered_close_hm', '21:00')
on conflict (key) do nothing;

-- تُحذف أولاً: أعمدة الإرجاع تتغيّر.
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
  admin_until   timestamptz
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
           -- آخر نبضٍ للخبر: إرساله، أو آخر صوت عليه، أو آخر قرار إدارة.
           greatest(
             a.sent_at,
             coalesce(v.last_vote, a.sent_at),
             coalesce(a.admin_verdict_at, a.sent_at)
           ) last_beat,
           (a.admin_verdict_at >= now() - interval '30 minutes') admin_live
      from announcements a
      left join lateral (
        select count(*) filter (where verdict = 'yes') yes,
               count(*) filter (where verdict = 'no')  no,
               max(created_at) filter (where created_at >= now() - interval '30 minutes') last_vote
          from announcement_votes w
         where w.announcement_id = a.id
      ) v on true
     where a.active
       and a.station_name is not null
       and a.sent_at is not null
  )
  select b.id, b.station_name, b.origin_city, b.product, b.cities, b.send_at,
         b.yes, b.no,
         case when b.admin_live then b.admin_verdict end,
         case when b.admin_live then b.admin_verdict_at + interval '30 minutes' end
    from base b, cfg
   where (b.sent_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date
     -- وقت الإغلاق: مطلق، لا يعلوه قرار. ساحةٌ مغلقة لا تبيع.
     and (now() at time zone 'Asia/Baghdad')::time < cfg.hm
     and case
           when b.admin_live then b.admin_verdict = 'available'
           else b.no - b.yes < 4
                and b.last_beat >= now() - interval '2 hours'
         end
     and not exists (
       select 1 from stations st
        where st.status = 'approved'
          and (b.station_name ilike '%' || st.name || '%'
               or st.name ilike '%' || b.station_name || '%')
     )
   order by b.sent_at desc;
$$;

revoke all on function public.open_announcements() from public;
grant execute on function public.open_announcements() to anon, authenticated;

-- ولوحة الإدارة ترى المخفيّ وتعرف سببه.
--
-- «لماذا لا يظهر؟» سؤالٌ سيُسأل في أول يوم، وبلا جواب في الشاشة نفسها يصير
-- الزرّ يبدو معطّلاً — يضغط الإدارةُ «متوفر» بعد التاسعة فلا يتغيّر شيء، ولا
-- شيء يقول إن الوقت هو المانع لا الزرّ.
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
           (a.admin_verdict_at >= now() - interval '30 minutes') admin_live
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
         not exists (select 1 from open_announcements() o where o.id = b.id),
         case
           when exists (select 1 from open_announcements() o where o.id = b.id) then null
           when (now() at time zone 'Asia/Baghdad')::time >= cfg.hm
             then 'انتهى وقت العرض (' || to_char(cfg.hm, 'HH24:MI') || ')'
           when b.admin_live and b.admin_verdict = 'gone' then 'أخفيتَه بقرارك'
           when exists (select 1 from stations st where st.status = 'approved'
                          and (b.station_name ilike '%' || st.name || '%'
                               or st.name ilike '%' || b.station_name || '%'))
             then 'المحطة صارت مسجّلة'
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

-- وقت الإغلاق يُضبط من اللوحة، لا من القاعدة بيد.
create or replace function public.set_unregistered_close(p_hm text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- يُتحقّق من الشكل هنا: قيمةٌ فاسدة تُسقط الدالتين معاً عند التحويل إلى time،
  -- فتختفي اللوحة كلها بلا سبب ظاهر.
  if p_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'bad time' using errcode = '22023';
  end if;
  insert into app_config (key, value) values ('unregistered_close_hm', p_hm)
  on conflict (key) do update set value = excluded.value;
end
$fn$;

revoke all on function public.set_unregistered_close(text) from public;
grant execute on function public.set_unregistered_close(text) to authenticated;

create or replace function public.get_unregistered_close()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from app_config where key = 'unregistered_close_hm'), '21:00');
$$;

revoke all on function public.get_unregistered_close() from public;
grant execute on function public.get_unregistered_close() to authenticated;

commit;

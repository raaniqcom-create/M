-- رأي الإدارة يسبق التصويت — ثلاثين دقيقة، ثم يعود الحكم للناس.
--
-- محطةٌ غير مسجّلة تتّصل بالإدارة: «لدينا بانزين، والتصويت خاطئ». وهي تعرف
-- ساحتها، والمصوّتون قد يكونون مرّوا قبل وصول الصهريج — أو يكونون منافسين.
-- فيُقدَّم رأي الإدارة، لأنه الوحيد المسنود إلى مكالمة مع صاحب الساحة.
--
-- ولا يبقى مقدَّماً إلى الأبد: بعد نصف ساعة يعود الحكم للناس، لأن الإدارة لا
-- تقف في الطابور ولا تعلم متى نفد. وهي المدّة نفسها التي يسبق بها رأي المالك
-- تصويت الازدحام (MANUAL_TRAFFIC_MINUTES في lib/products) — قاعدة واحدة في
-- المنصّة كلها، لا اثنتان يتعلّمهما المستخدم.
begin;

alter table announcements
  add column if not exists admin_verdict    text
    check (admin_verdict is null or admin_verdict in ('available', 'gone')),
  add column if not exists admin_verdict_at timestamptz;

comment on column announcements.admin_verdict is
  'قرار الإدارة بعد التواصل مع المحطة. يسبق التصويت ثلاثين دقيقة ثم يسقط.';

-- تُحذف أولاً: تغيير أعمدة الإرجاع لا يقبله الاستبدال. وداخل المعاملة نفسها،
-- فلا توجد لحظة تكون فيها الدالة غائبة عن التطبيق.
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
  select a.id, a.station_name, a.origin_city, a.product, a.cities, a.send_at,
         coalesce(v.yes, 0)::int, coalesce(v.no, 0)::int,
         -- لا يُعرض قرارٌ سقط: بعد نصف ساعة يصير كأن لم يكن.
         case when a.admin_verdict_at >= now() - interval '30 minutes'
              then a.admin_verdict end,
         case when a.admin_verdict_at >= now() - interval '30 minutes'
              then a.admin_verdict_at + interval '30 minutes' end
    from announcements a
    left join lateral (
      select count(*) filter (where verdict = 'yes') yes,
             count(*) filter (where verdict = 'no')  no
        from announcement_votes w
       where w.announcement_id = a.id
         and w.created_at >= now() - interval '30 minutes'
    ) v on true
   where a.active
     and a.station_name is not null
     and a.sent_at is not null
     and (a.sent_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date
     and (
       -- قرارٌ قائم من الإدارة: هو الحكم وحده، والتصويت لا يُستشار.
       case when a.admin_verdict_at >= now() - interval '30 minutes'
            then a.admin_verdict = 'available'
            -- وإلا: فارق أربعةٍ صافية في آخر نصف ساعة.
            else coalesce(v.no, 0) - coalesce(v.yes, 0) < 4
       end
     )
     and not exists (
       select 1 from stations st
        where st.status = 'approved'
          and (a.station_name ilike '%' || st.name || '%'
               or st.name ilike '%' || a.station_name || '%')
     )
   order by a.sent_at desc;
$$;

revoke all on function public.open_announcements() from public;
grant execute on function public.open_announcements() to anon, authenticated;

-- ما تراه الإدارة: كل أخبار اليوم، حتى المخفيّ منها بالتصويت — فالمخفيّ هو ما
-- تتّصل بشأنه المحطة، وإخفاؤه عن اللوحة التي تديره يجعلها بلا فائدة.
drop function if exists public.admin_announcements();

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
  hidden        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.station_name, a.origin_city, a.product, a.cities, a.send_at,
         coalesce(v.yes, 0)::int, coalesce(v.no, 0)::int,
         case when a.admin_verdict_at >= now() - interval '30 minutes'
              then a.admin_verdict end,
         case when a.admin_verdict_at >= now() - interval '30 minutes'
              then a.admin_verdict_at + interval '30 minutes' end,
         not exists (select 1 from open_announcements() o where o.id = a.id)
    from announcements a
    left join lateral (
      select count(*) filter (where verdict = 'yes') yes,
             count(*) filter (where verdict = 'no')  no
        from announcement_votes w
       where w.announcement_id = a.id
         and w.created_at >= now() - interval '30 minutes'
    ) v on true
   where a.active
     and a.station_name is not null
     and a.sent_at is not null
     and (a.sent_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date
     and (select p.role::text from profiles p where p.id = auth.uid()) = 'admin'
   order by a.sent_at desc;
$$;

revoke all on function public.admin_announcements() from public;
grant execute on function public.admin_announcements() to authenticated;

create or replace function public.set_announcement_verdict(p_id uuid, p_verdict text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_verdict is not null and p_verdict not in ('available', 'gone') then
    raise exception 'bad verdict' using errcode = '22023';
  end if;

  update announcements
     set admin_verdict    = p_verdict,
         -- null يعني «ارفع يدك»: يعود الحكم للناس فوراً لا بعد نصف ساعة.
         admin_verdict_at = case when p_verdict is null then null else now() end
   where id = p_id;
end
$fn$;

revoke all on function public.set_announcement_verdict(uuid, text) from public;
grant execute on function public.set_announcement_verdict(uuid, text) to authenticated;

commit;

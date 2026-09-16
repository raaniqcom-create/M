-- «غسيل» M7: الدليلُ والصفحة v2 — مصغّراتٌ ومعرضٌ وعدّاداتٌ و«يبدأ من» و«مميّز».
--
-- الوثيقة §9, 28, 34–37, 49, 55, 64–65: المصغّرُ في القائمة (البايتاتُ هي الكلفةُ
-- الحقيقيّة)، معرضٌ بحدّ الباقة، عدّاداتُ مشاهدة/اتصال/طريق بنمط silence_views
-- (RPC مجمَّع + حارسُ اليوم في المتصفّح)، وأدنى سعرٍ وشارةُ «مميّز» من الباقة.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جدولٌ جديد wash_views وأعمدةٌ على car_washes والعرضُ العامّ. التراجع:
--   drop function wash_seen(uuid,text), wash_views_for(uuid); drop table wash_views;
--   alter table car_washes drop column thumb_url, drop column photos; إعادةُ washes_public من 20260920b.
begin;

alter table public.car_washes
  add column if not exists thumb_url text,
  add column if not exists photos    text[] not null default '{}';

-- الصورُ من حاويتنا وحدَها: رابطٌ خارجيٌّ على صفحةٍ عامّة بابٌ لا نفتحه.
create or replace function public.car_washes_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin boolean; lim int; u text;
begin
  new.name := btrim(new.name);
  admin := auth.uid() is null or exists (select 1 from profiles where id = auth.uid() and role = 'admin');
  if new.image_url is not null and position('/storage/v1/object/public/wash/' in new.image_url) = 0 then new.image_url := null; end if;
  if new.thumb_url is not null and position('/storage/v1/object/public/wash/' in new.thumb_url) = 0 then new.thumb_url := null; end if;
  foreach u in array new.photos loop
    if position('/storage/v1/object/public/wash/' in u) = 0 then raise exception 'صورةٌ من خارج المنصّة'; end if;
  end loop;
  if admin then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.paid_until := null; new.admin_note := null; new.kind := 'car_wash';
    if not exists (select 1 from wash_plans p where p.code = new.plan and p.public and p.active) then new.plan := 'basic'; end if;
  else
    new.status := old.status; new.owner_id := old.owner_id; new.paid_until := old.paid_until;
    new.plan := old.plan; new.admin_note := old.admin_note; new.kind := old.kind;
    -- المعرضُ بحدّ الباقة (٠ = بلا معرض).
    lim := coalesce((wash_features(new)->>'gallery_limit')::int, 1);
    if coalesce(array_length(new.photos, 1), 0) > lim then
      raise exception 'باقتك تسمح بـ% من الصور — احذف صورةً أو رقِّ اشتراكك', lim;
    end if;
  end if;
  return new;
end $$;

-- ── العدّادات ──────────────────────────────────────────────────────────────
create table if not exists public.wash_views (
  wash_id    uuid primary key references public.car_washes(id) on delete cascade,
  views      integer not null default 0,
  calls      integer not null default 0,
  routes     integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.wash_views enable row level security;

/** يعدّ مشاهدةً أو ضغطةَ اتصالٍ أو طريق — مرّةً في اليوم لكلّ جهاز (الحارسُ في المتصفّح). */
create or replace function public.wash_seen(p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('view','call','route') then return; end if;
  if not exists (select 1 from car_washes w where w.id = p_id) then return; end if;
  insert into wash_views (wash_id, views, calls, routes)
  values (p_id, (p_kind = 'view')::int, (p_kind = 'call')::int, (p_kind = 'route')::int)
  on conflict (wash_id) do update
    set views = wash_views.views + (p_kind = 'view')::int,
        calls = wash_views.calls + (p_kind = 'call')::int,
        routes = wash_views.routes + (p_kind = 'route')::int,
        updated_at = now();
end $$;
revoke all on function public.wash_seen(uuid, text) from public;
grant execute on function public.wash_seen(uuid, text) to anon, authenticated;

create or replace function public.wash_views_for(p_wash uuid)
returns json language sql stable security definer set search_path = public as $$
  select case when manages_wash(p_wash)
              then coalesce((select json_build_object('views', v.views, 'calls', v.calls, 'routes', v.routes) from wash_views v where v.wash_id = p_wash),
                            json_build_object('views', 0, 'calls', 0, 'routes', 0))
              else null end;
$$;
revoke all on function public.wash_views_for(uuid) from public;
grant execute on function public.wash_views_for(uuid) to authenticated;

-- ── العرضُ العامّ: المصغّرُ والمعرضُ وأدنى سعرٍ و«مميّز» ─────────────────
create or replace view public.washes_public with (security_invoker = false) as
  select w.id, w.name, w.city, w.address, w.lat, w.lng, w.image_url, w.is_24h, w.opens_at, w.closes_at,
         w.temp_closed, w.bays, w.slot_minutes, w.loyalty_target, w.created_at,
         case when w.phone_hidden then null else w.phone end as phone,
         exists (select 1 from wash_offers o where o.wash_id = w.id and o.active
                    and (o.starts_at is null or o.starts_at <= (now() at time zone 'Asia/Baghdad')::date)
                    and (o.ends_at is null or o.ends_at >= (now() at time zone 'Asia/Baghdad')::date)) as has_offer,
         coalesce(w.bookings_paused_until > now(), false) as paused,
         case when w.rating_n > 0 then round(w.rating_sum::numeric / w.rating_n, 1) end as rating_avg,
         w.rating_n,
         w.thumb_url,
         w.photos,
         (select min(s.price) from wash_services s where s.wash_id = w.id and s.active) as from_price,
         coalesce((wash_features(w)->>'featured')::boolean, false) as featured
    from car_washes w
   where wash_published(w);
grant select on public.washes_public to anon, authenticated;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'wash_seen') = 1, 'wash_seen غائبة';
  assert (select count(*) from information_schema.columns where table_name = 'washes_public' and column_name = 'from_price') = 1, 'from_price غائب';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
end $$;

commit;

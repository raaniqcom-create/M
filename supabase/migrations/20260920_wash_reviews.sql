-- «غسيل» M5: التقييماتُ المرتبطةُ بحجزٍ مكتمل (§32–33).
--
-- لا يقيّم إلّا من غُسلت سيّارتُه: المفتاحُ الأساسيُّ booking_id (تقييمٌ واحدٌ للحجز)،
-- والهاتفُ يطابق الحجزَ، والحجزُ completed خلال أربعةَ عشرَ يوماً. لا هاتفَ في العرض العامّ.
-- الإخفاءُ بيد المغسلة والإدارة (يُقلب إلى الإدارة وحدَها بسطرٍ إن أُسيء).
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جدولٌ وعرضٌ ودالّةٌ جديدة، وعمودان على car_washes. لا مساسَ بـstation_reviews.
-- التراجع: drop view wash_reviews_public; drop function review_wash(text,text,smallint,text);
--   drop table wash_reviews; alter table car_washes drop column rating_sum, drop column rating_n.
begin;

create table if not exists public.wash_reviews (
  booking_id uuid primary key references public.wash_bookings(id) on delete cascade,
  wash_id    uuid not null references public.car_washes(id) on delete cascade,
  phone      text not null,
  stars      smallint not null check (stars between 1 and 5),
  comment    text check (comment is null or char_length(comment) <= 200),
  name       text,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists wash_reviews_wash_idx on public.wash_reviews(wash_id, created_at desc) where not hidden;
alter table public.wash_reviews enable row level security;
grant select on public.wash_reviews to authenticated;
grant update (hidden) on public.wash_reviews to authenticated;
drop policy if exists "wash_reviews: owner and admin read" on public.wash_reviews;
create policy "wash_reviews: owner and admin read" on public.wash_reviews for select using (manages_wash(wash_id));
drop policy if exists "wash_reviews: owner and admin hide" on public.wash_reviews;
create policy "wash_reviews: owner and admin hide" on public.wash_reviews for update using (manages_wash(wash_id)) with check (manages_wash(wash_id));

alter table public.car_washes
  add column if not exists rating_sum integer not null default 0,
  add column if not exists rating_n   integer not null default 0;

insert into app_config (key, value) values ('wash_reviews_public', 'true') on conflict (key) do nothing;

-- العرضُ العامّ: بلا هاتف، والاسمُ حرفٌ ونقطة.
create or replace view public.wash_reviews_public with (security_invoker = false) as
  select r.booking_id as id, r.wash_id, r.stars, r.comment, left(coalesce(r.name, ''), 1) || '.' as name, r.created_at
    from wash_reviews r join car_washes w on w.id = r.wash_id
   where not r.hidden and wash_published(w) and wash_cfg('wash_reviews_public', 'true') = 'true';
grant select on public.wash_reviews_public to anon, authenticated;

/** التقييمُ برمز الحجز وهاتفه: مكتملٌ خلال ١٤ يوماً، ومرّةٌ واحدة (المفتاحُ الأساسيّ). */
create or replace function public.review_wash(p_code text, p_phone text, p_stars smallint, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b wash_bookings;
begin
  perform wash_lookup_guard(p_phone);
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'اختر من نجمة إلى خمس'; end if;
  select * into b from wash_bookings x where x.code = p_code and x.phone = p_phone;
  if not found then perform wash_lookup_miss(p_phone); raise exception 'لم نجد هذا الحجز'; end if;
  if b.status <> 'completed' then raise exception 'يُقيَّم الحجزُ بعد اكتمال الخدمة'; end if;
  if b.status_at < now() - interval '14 days' then raise exception 'مضى وقتُ التقييم'; end if;
  begin
    insert into wash_reviews (booking_id, wash_id, phone, stars, comment, name)
    values (b.id, b.wash_id, b.phone, p_stars, nullif(btrim(coalesce(p_comment, '')), ''), b.name);
  exception when unique_violation then
    raise exception 'قيّمتَ هذا الحجز من قبل';
  end;
  update car_washes set rating_sum = rating_sum + p_stars, rating_n = rating_n + 1 where id = b.wash_id;
  insert into wash_events (wash_id, booking_id, kind, payload, actor_kind, dedupe)
  values (b.wash_id, b.id, 'review', jsonb_build_object('stars', p_stars, 'comment', left(coalesce(p_comment, ''), 100)), 'citizen', 'review:' || b.id)
  on conflict (dedupe) do nothing;
end $$;
revoke all on function public.review_wash(text, text, smallint, text) from public;
grant execute on function public.review_wash(text, text, smallint, text) to anon, authenticated;

-- ── العرضُ العامّ للمغاسل: التقييمُ في آخره ────────────────────────────────
create or replace view public.washes_public with (security_invoker = false) as
  select w.id, w.name, w.city, w.address, w.lat, w.lng, w.image_url, w.is_24h, w.opens_at, w.closes_at,
         w.temp_closed, w.bays, w.slot_minutes, w.loyalty_target, w.created_at,
         case when w.phone_hidden then null else w.phone end as phone,
         exists (select 1 from wash_offers o where o.wash_id = w.id and o.active
                    and (o.ends_at is null or o.ends_at >= (now() at time zone 'Asia/Baghdad')::date)) as has_offer,
         coalesce(w.bookings_paused_until > now(), false) as paused,
         case when w.rating_n > 0 then round(w.rating_sum::numeric / w.rating_n, 1) end as rating_avg,
         w.rating_n
    from car_washes w
   where wash_published(w);
grant select on public.washes_public to anon, authenticated;

-- حجزُ الزبون يحمل «هل قُيّم» كي تعرف الشاشةُ ما تعرض.
create or replace function public.wash_booking_by_code(p_code text, p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform wash_lookup_guard(p_phone);
  select json_build_object('id', b.id, 'code', b.code, 'status', b.status, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
                           'service', b.service_name, 'price', b.price, 'use_free', b.use_free, 'late', b.late,
                           'name', b.name, 'car', b.car, 'vehicle', b.vehicle,
                           'wash', w.name, 'wash_id', w.id, 'address', w.address, 'lat', w.lat, 'lng', w.lng,
                           'wash_phone', case when w.phone_hidden then null else w.phone end,
                           'cancel_free_min', wash_cfg('wash_cancel_free_min', '30')::int,
                           'reviewed', exists (select 1 from wash_reviews rv where rv.booking_id = b.id),
                           'events', (select coalesce(json_agg(json_build_object('kind', e.kind, 'at', e.created_at) order by e.created_at), '[]'::json)
                                        from wash_events e where e.booking_id = b.id and e.kind not in ('note', 'review')))
    into r
    from wash_bookings b join car_washes w on w.id = b.wash_id
   where b.code = p_code and b.phone = p_phone;
  if r is null then perform wash_lookup_miss(p_phone); end if;
  return r;
end $$;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'review_wash') = 1, 'review_wash غائبة';
  assert (select count(*) from information_schema.columns where table_name = 'washes_public' and column_name = 'rating_avg') = 1, 'rating_avg غائب';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
end $$;

commit;

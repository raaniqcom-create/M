-- «غسيل» M10: الإعلاناتُ من الإدارة، المنطقةُ داخل المدينة، أقربُ موعدٍ لكلّ مغسلة، و«حجوزاتي».
--
-- · wash_ads: بانرٌ في الرئيسية، أو «محطةٌ مموَّلة» تتصدّر الدليلَ بوسم «إعلان»، أو عرضٌ
--   مموَّل في «عروض اليوم». الإدارةُ وحدَها تكتب؛ الناسُ يقرؤون عرضاً مصفّىً بالتاريخ والنشر.
-- · car_washes.area: «الرمادي – شارع 60» — المدينةُ وحدَها لا تكفي للعثور على المغسلة.
-- · wash_next_slot_all(): «أقربُ موعدٍ اليوم» على بطاقة الدليل بطلبٍ واحد لا طلبٍ لكلّ مغسلة.
-- · wash_my_bookings(): الرموزُ محفوظةٌ في المتصفّح؛ الحالةُ الحيّةُ تُجلب دفعةً بالهاتف.
-- · مجلّدُ ads/ في حاوية wash للإدارة: 'ads'::uuid كان يرمي داخل السياسة.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- car_washes وwash_* وسياساتُ حاوية 'wash' فقط. التراجع (الاستعادةُ أوّلاً — washes_public تعتمد
-- على wash_ads، وسياستا storage على wash_storage_ok):
--   إعادةُ washes_public وcar_washes_guard من 20260921 وسياستَي storage من 20260917؛ ثمّ
--   drop view wash_ads_public; drop table wash_ads; drop function wash_next_slot_all(), wash_my_bookings(text[],text),
--   wash_storage_ok(text), wash_is_admin(); alter table car_washes drop column area;
begin;

-- ── 1 · المنطقةُ داخل المدينة ─────────────────────────────────────────────
alter table public.car_washes
  add column if not exists area text check (area is null or char_length(area) <= 40);

-- المنطقةُ داخل المدينة تُعرض «الرمادي – شارع 60».
create or replace function public.car_washes_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin boolean; lim int; u text;
begin
  new.name := btrim(new.name);
  new.area := nullif(btrim(coalesce(new.area, '')), '');
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
    -- المعرضُ بحدّ الباقة (0 = بلا معرض).
    lim := coalesce((wash_features(new)->>'gallery_limit')::int, 1);
    if coalesce(array_length(new.photos, 1), 0) > lim then
      raise exception 'باقتك تسمح بـ% من الصور — احذف صورةً أو رقِّ اشتراكك', lim;
    end if;
  end if;
  return new;
end $$;

-- ── 2 · الإعلانات ─────────────────────────────────────────────────────────
/** الإدارةُ؟ مسندٌ security definer تسأله السياساتُ (كما manages_wash) — profiles محجوبةٌ عن anon. */
create or replace function public.wash_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$;
revoke all on function public.wash_is_admin() from public;
grant execute on function public.wash_is_admin() to anon, authenticated;

create table if not exists public.wash_ads (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('banner','station','offer')),
  title       text not null check (char_length(title) between 2 and 80),
  description text check (description is null or char_length(description) <= 160),
  image_url   text,
  url         text check (url is null or url ~ '^(https?://|/)'),
  wash_id     uuid references public.car_washes(id) on delete cascade,
  offer_id    uuid references public.wash_offers(id) on delete set null,
  city        text,
  starts_at   date,
  ends_at     date,
  priority    smallint not null default 0 check (priority between 0 and 100),
  sponsored   boolean not null default true,
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  check (kind <> 'station' or wash_id is not null)
);
create index if not exists wash_ads_active_idx on public.wash_ads(active, kind, priority desc);
alter table public.wash_ads enable row level security;
revoke all on public.wash_ads from anon;
grant select, insert, update, delete on public.wash_ads to authenticated;

drop policy if exists "wash_ads: admin all" on public.wash_ads;
create policy "wash_ads: admin all" on public.wash_ads for all to authenticated
  using (wash_is_admin()) with check (wash_is_admin());

-- الصورُ من حاويتنا وحدَها؛ '' في المدينة تعني «كلّ المدن» فتُصبح null.
create or replace function public.wash_ads_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.city := nullif(btrim(coalesce(new.city, '')), '');
  if new.image_url is not null and position('/storage/v1/object/public/wash/' in new.image_url) = 0 then new.image_url := null; end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  if new.starts_at is not null and new.ends_at is not null and new.ends_at < new.starts_at then
    raise exception 'نهايةُ الإعلان قبل بدايته';
  end if;
  return new;
end $$;
drop trigger if exists wash_ads_guard_trg on public.wash_ads;
create trigger wash_ads_guard_trg before insert or update on public.wash_ads
  for each row execute function public.wash_ads_guard();

-- ما يراه الناس: نشطٌ، داخل نافذته، ومغسلتُه (إن وُجدت) منشورة.
create or replace view public.wash_ads_public with (security_invoker = false) as
  select a.id, a.kind, a.title, a.description, a.image_url, a.url, a.wash_id, a.offer_id,
         a.city, a.starts_at, a.ends_at, a.priority, a.sponsored
    from wash_ads a
   where a.active
     and (a.starts_at is null or a.starts_at <= (now() at time zone 'Asia/Baghdad')::date)
     and (a.ends_at is null or a.ends_at >= (now() at time zone 'Asia/Baghdad')::date)
     and (a.wash_id is null or exists (select 1 from car_washes w where w.id = a.wash_id and wash_published(w)));
-- المنظورُ من جدولٍ واحدٍ فهو قابلٌ للتحديث تلقائيّاً، ويعمل بصلاحيّة المالك (لا RLS):
-- الصلاحيّاتُ الافتراضيّة تمنح anon كلَّ شيء — يُسحب كلُّ شيءٍ عدا القراءة.
revoke all on public.wash_ads_public from anon, authenticated;
grant select on public.wash_ads_public to anon, authenticated;

-- ── 3 · العرضُ العامّ: + المنطقةُ و«مموَّلة» ────────────────────────────────
-- create or replace يُلحق أعمدةً في الآخر فقط — ترتيبُ القديم لا يُمسّ.
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
         coalesce((wash_features(w)->>'featured')::boolean, false) as featured,
         w.area,
         exists (select 1 from wash_ads a where a.kind = 'station' and a.wash_id = w.id and a.active
                    and (a.starts_at is null or a.starts_at <= (now() at time zone 'Asia/Baghdad')::date)
                    and (a.ends_at is null or a.ends_at >= (now() at time zone 'Asia/Baghdad')::date)) as sponsored
    from car_washes w
   where wash_published(w);
-- create or replace يُبقي الصلاحيّاتِ القديمة — ومنذ 20260917 لم يُسحب شيء: anon كان يُعدّل car_washes
-- عبر المنظور (car_washes_guard يعدّ auth.uid() الفارغَ إدارةً). wash_reviews_public بالثغرة نفسها.
revoke all on public.washes_public, public.wash_reviews_public from anon, authenticated;
grant select on public.washes_public, public.wash_reviews_public to anon, authenticated;

-- ── 4 · أقربُ موعدٍ حرٍّ اليوم لكلّ مغسلة ─────────────────────────────────
-- ponytail: كلُّ مغسلةٍ تمرّ على مواعيد يومها (wash_slots تتحقّق مادّيّاً) — يكفي لعشرات
-- المغاسل؛ حين تصير مئات: عمودٌ محسوبٌ يُحدَّث عند كلّ حجز.
create or replace function public.wash_next_slot_all()
returns table (wash_id uuid, slot time)
language sql stable security definer set search_path = public as $$
  select w.id, s.slot
    from car_washes w
   cross join lateral (select x.slot from wash_slots(w.id, (now() at time zone 'Asia/Baghdad')::date) x
                        order by x.slot limit 1) s
   where wash_published(w);
$$;
revoke all on function public.wash_next_slot_all() from public;
grant execute on function public.wash_next_slot_all() to anon, authenticated;

-- ── 5 · حجوزاتي: الرموزُ من المتصفّح والهاتفُ مفتاحُها ─────────────────────
-- الهاتفُ كما في wash_booking_by_code ('07XXXXXXXXX'). رمزٌ قديمٌ بجانب رموزٍ حيّة ليس تخميناً؛
-- أمّا نداءٌ لا يصيب شيئاً فتخمينٌ يُحسب على الهاتف — وإلّا فالحارسُ لا يُغذّيه أحد و20 تخميناً بالنداء.
create or replace function public.wash_my_bookings(p_codes text[], p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if p_codes is null or cardinality(p_codes) = 0 then return '[]'::json; end if;
  perform wash_lookup_guard(p_phone);
  select coalesce(json_agg(json_build_object(
           'code', b.code, 'status', b.status, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
           'service', b.service_name, 'service_id', b.service_id, 'price', b.price,
           'vehicle', b.vehicle, 'late', b.late,
           'wash', w.name, 'wash_id', w.id, 'address', w.address, 'lat', w.lat, 'lng', w.lng)
         order by b.starts_at desc), '[]'::json)
    into r
    from wash_bookings b join car_washes w on w.id = b.wash_id
   where b.code = any(p_codes[1:20]) and b.phone = p_phone;
  if json_array_length(r) = 0 then perform wash_lookup_miss(p_phone); end if;
  return r;
end $$;
revoke all on function public.wash_my_bookings(text[], text) from public;
grant execute on function public.wash_my_bookings(text[], text) to anon, authenticated;

-- ── 6 · الحاوية: مجلّدُ المغسلة لمن يديرها، وads/ للإدارة ──────────────────
-- 'ads'::uuid كان يرمي داخل تعبير السياسة، والإدارةُ تحتاج مجلّداً لها.
create or replace function public.wash_storage_ok(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare folder text := (storage.foldername(p_name))[1];
begin
  if folder = 'ads' then
    return wash_is_admin();
  elsif folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return manages_wash(folder::uuid);
  else
    return false;
  end if;
end $$;
revoke all on function public.wash_storage_ok(text) from public;
grant execute on function public.wash_storage_ok(text) to authenticated;

drop policy if exists "wash: owner writes own folder" on storage.objects;
create policy "wash: owner writes own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'wash' and wash_storage_ok(name));
drop policy if exists "wash: owner replaces own folder" on storage.objects;
create policy "wash: owner replaces own folder" on storage.objects for update to authenticated
  using (bucket_id = 'wash' and wash_storage_ok(name));

-- ── 7 · تأكيداتُ العزل ─────────────────────────────────────────────────────
do $$
begin
  -- المنظوراتُ العامّة قراءةٌ فقط (has_table_privilege بقائمةٍ = «أيٌّ منها»).
  assert not has_table_privilege('anon', 'public.wash_ads_public', 'insert, update, delete'), 'anon يكتب عبر wash_ads_public';
  assert not has_table_privilege('authenticated', 'public.wash_ads_public', 'insert, update, delete'), 'authenticated يكتب عبر wash_ads_public';
  assert not has_table_privilege('anon', 'public.washes_public', 'insert, update, delete'), 'anon يكتب عبر washes_public';
  assert not has_table_privilege('authenticated', 'public.washes_public', 'insert, update, delete'), 'authenticated يكتب عبر washes_public';
  assert not has_table_privilege('anon', 'public.wash_reviews_public', 'insert, update, delete'), 'anon يكتب عبر wash_reviews_public';
  assert (select count(*) from information_schema.columns where table_name = 'car_washes' and column_name = 'area') = 1, 'area غائب';
  assert (select count(*) from information_schema.columns where table_name = 'washes_public' and column_name in ('area','sponsored')) = 2, 'area/sponsored غائبان من washes_public';
  assert exists (select 1 from pg_views where schemaname = 'public' and viewname = 'wash_ads_public'), 'wash_ads_public غائب';
  assert (select relrowsecurity from pg_class where relname = 'wash_ads' and relnamespace = 'public'::regnamespace), 'wash_ads بلا RLS';
  assert (select count(*) from pg_proc where proname = 'wash_is_admin') = 1, 'wash_is_admin مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'wash_next_slot_all') = 1, 'wash_next_slot_all مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'wash_my_bookings') = 1, 'wash_my_bookings مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'wash_storage_ok') = 1, 'wash_storage_ok مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'book_wash') = 1, 'book_wash مكرّرة';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and policyname in ('wash: owner writes own folder', 'wash: owner replaces own folder')) = 2, 'سياستا الحاوية غائبتان';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
  assert not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                     where c.relname in ('stations','station_products','alerts','device_tokens','traffic_votes','profiles')
                       and t.tgname like '%wash%'), 'مُشغّلُ مغاسل على جدول وقود';
end $$;

commit;

-- «المشتركون+» و«الحالات» — طلبُ صاحب المنصّة، ١٣ أيلول ٢٠٢٦.
--
-- ١ · «قسمٌ للمشتركين عبر البوت وعبر الرسائل — بأرقامهم وأسمائهم ومعرّفاتهم،
--     ولماذا سجّل كلٌّ منهم، وإمكانيةُ التواصل معهم داخليّاً». المقيس: لا
--     جدولَ من هذه يُقرأ من المتصفّح (RLS)، وتيليجرام كان يرمي الاسمَ
--     والمعرّفَ مع كلّ تحديث. فدالّةٌ للمدير وحدَه على نمط admin_stats،
--     و«لماذا سجّل» يُشتقّ: ربطُ محطة، متابعة، سؤالٌ عن الوقود، اشتراكٌ بالعروض.
-- ٢ · «الحالات: حالةٌ بخلفيةٍ خضراء وكتابةٍ بيضاء وصورةٍ برابطٍ أو شعارِ
--     المحطة، قابلةٌ للنشر». كانت واحدةً مكتوبةً في lib/news.ts تحتاج بناءً.
begin;

-- ── ١ · تيليجرام: ما كان يُرمى ────────────────────────────────────────────
alter table public.telegram_users
  add column if not exists first_seen timestamptz default now(),
  add column if not exists username   text,
  add column if not exists first_name text,
  add column if not exists last_seen  timestamptz;

-- ── ٢ · رسائلُ الإدارة ↔ المشترك (نمطُ station_messages) ─────────────────
-- المجرى (channel, address). sender='user' يكتبه البوت بمفتاح الخدمة وحدَه،
-- والختمان delivered_at/error تكتبهما دالّةُ broadcast. ولا حذف.
create table if not exists public.subscriber_messages (
  id           uuid primary key default gen_random_uuid(),
  channel      text not null check (channel in ('telegram', 'whatsapp', 'sms')),
  address      text not null,              -- chat_id | wa_id (9647…) | 7XXXXXXXXX
  sender       text not null check (sender in ('admin', 'user')),
  body         text not null check (btrim(body) <> '' and length(body) <= 2000),
  delivered_at timestamptz,
  error        text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists subscriber_messages_thread_idx
  on public.subscriber_messages (channel, address, created_at);

alter table public.subscriber_messages enable row level security;
revoke all on public.subscriber_messages from anon, authenticated;
grant select, insert on public.subscriber_messages to authenticated;
grant update (read_at) on public.subscriber_messages to authenticated;

drop policy if exists "subscriber_messages: admin reads" on public.subscriber_messages;
create policy "subscriber_messages: admin reads" on public.subscriber_messages
  for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "subscriber_messages: admin writes" on public.subscriber_messages;
create policy "subscriber_messages: admin writes" on public.subscriber_messages
  for insert with check (
    sender = 'admin' and delivered_at is null and error is null and read_at is null
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "subscriber_messages: admin marks read" on public.subscriber_messages;
create policy "subscriber_messages: admin marks read" on public.subscriber_messages
  for update using (sender = 'user' and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── ٣ · المشتركون — للمدير وحدَه ──────────────────────────────────────────
-- أرقامٌ ومعرّفاتٌ فلا تُعرض إلّا لدور admin (42501 لغيره، كنمط admin_stats).
-- أجهزةُ التطبيق (alerts) مجهولةُ الهويّة فلا تدخل. كلُّ مرجعٍ مؤهَّلٌ بجدوله.
create or replace function public.admin_subscribers(p_channel text default null)
returns table (
  channel text, address text, ident text, name text, why text, city text,
  since timestamptz, last_seen timestamptz, unread integer
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller_role text;
begin
  select p.role::text into caller_role from profiles p where p.id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with people as (
    select 'telegram'::text as ch, t.chat_id::text as ad,
           coalesce('@' || nullif(t.username, ''), '#' || t.telegram_id::text) as idn,
           t.first_name as nm,
           case
             when exists (select 1 from telegram_links l where l.telegram_id = t.telegram_id)
               then 'صاحب محطة: ' || coalesce((
                 select s.name from telegram_links l join stations s on s.id = l.station_id
                  where l.telegram_id = t.telegram_id limit 1), '')
             when exists (select 1 from telegram_favorites f where f.telegram_id = t.telegram_id)
               then 'يتابع محطة'
             else 'فتح البوت'
           end as wh,
           null::text as ct, t.first_seen as fs, t.last_seen as ls
      from telegram_users t
    union all
    select 'whatsapp', w.wa_id, '+' || w.wa_id, w.name,
           case
             when exists (select 1 from whatsapp_favorites f where f.wa_id = w.wa_id) then 'يتابع محطة'
             when w.onboarded_at is not null then 'سأل عن الوقود' || coalesce(' في ' || w.city, '')
             else 'راسل البوت'
           end,
           w.city, w.first_seen, w.last_seen
      from whatsapp_users w
    union all
    select 'sms', s.phone, '0' || s.phone, null,
           'اشترك بالعروض' || coalesce(' — ' || s.city, ''), s.city, s.created_at, null
      from subscribers s
     where s.unsubscribed_at is null
  )
  select p.ch, p.ad, p.idn, p.nm, p.wh, p.ct, p.fs, p.ls,
         (select count(*)::integer from subscriber_messages m
           where m.channel = p.ch and m.address = p.ad and m.sender = 'user' and m.read_at is null)
    from people p
   where p_channel is null or p.ch = p_channel
   order by coalesce(p.ls, p.fs) desc nulls last
   limit 1000;  -- ponytail: ٤٥٥ صفّاً اليوم؛ ترقيمُ صفحاتٍ حين يقترب من الألف
end
$fn$;
revoke all on function public.admin_subscribers(text) from public, anon;
grant execute on function public.admin_subscribers(text) to authenticated;

-- ── ٤ · حالاتُ المنصّة (نمطُ ads) ─────────────────────────────────────────
-- published_at هي Story.at ومفتاحُ story_views: تحديثُها = حلقةٌ خضراء
-- وعدّادٌ جديد — وهي الخدعةُ نفسُها التي كانت في NEWS.at.
create table if not exists public.platform_stories (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (btrim(title) <> ''),
  lines        text[] not null default '{}',
  image_url    text,        -- null = شعارُ المحطة
  href         text,        -- null أو label null = بلا زرّ
  label        text,
  active       boolean not null default true,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
alter table public.platform_stories enable row level security;
drop policy if exists "platform_stories: public read" on public.platform_stories;
create policy "platform_stories: public read" on public.platform_stories
  for select to public using (active and published_at <= now());
drop policy if exists "platform_stories: admin write" on public.platform_stories;
create policy "platform_stories: admin write" on public.platform_stories
  for all to public
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- الحالتان القائمتان: العبوات (الآن — «أضف الآن حالةً عن العبوات البلاستيكية») ودوري.
insert into public.platform_stories (id, title, lines, href, label, published_at) values
  ('a5c0f8d2-1b6e-4c3a-9d0e-000000000001',
   'العبوات البلاستيكية أصبحت متوفرة',
   array[
     'صار بإمكانك تعبئةُ العبوات البلاستيكية من منافذ البيع المباشر المخصّصة — لا من المحطات.',
     'في الرمادي: محطة الأوائل ومحطة بوابة الرمادي. وبقيّةُ المدن بمنافذها داخل الصفحة.',
     'تأكّد من المنفذ المعتمد في مدينتك قبل التوجّه إليه.'
   ],
   '/abwat', 'أين أعبّئ عبوتي؟', now()),
  ('a5c0f8d2-1b6e-4c3a-9d0e-000000000002',
   'دوري — الفرديّ والزوجيّ',
   array[
     'أدخل رقم لوحتك مرّةً واحدة، وتعرف فوراً: دورُك اليوم أم غداً.',
     'أسبوعٌ كاملٌ بأيّامك، والمحطاتُ التي يصلها البنزين في مدينتك.',
     'والقرارُ كاملاً بنصّه داخل البطاقة.'
   ],
   '/dori', 'اعرف دورك الآن', '2026-09-12T18:00:00+03:00')
on conflict (id) do nothing;

-- عدّادُ المشاهدات: حالاتُ المنصّة تعيش أطولَ من ثلاثة أيّام فتُستثنى من المسح.
create or replace function public.prune_story_views()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.story_views v
     where v.at < now() - interval '3 days'
       and not exists (select 1 from public.platform_stories p where p.id::text = v.story_id)
    returning 1
  )
  select count(*)::integer from gone;
$$;

commit;

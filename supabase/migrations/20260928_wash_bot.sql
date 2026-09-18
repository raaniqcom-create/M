-- «غسيل»: بوتُ تيليجرام «محطة الغسل» — مستخدموه، وجوهرُ تغيير الحالة مشتركاً بين الويب والبوت.
--
-- ── لماذا ────────────────────────────────────────────────────────────────
-- بوتٌ جديدٌ كلّيّاً بمفتاحه وسرّه (WASH_TELEGRAM_BOT_TOKEN) — لا يلمس جداولَ بوت الوقود
-- (telegram_users/links/drafts) ولا مفتاحَه. الزبونُ يحجز من تيليجرام، وصاحبُ المغسلة
-- يؤكّد ويُلغي من أزرارٍ تحت إشعار الحجز.
--
-- ── ما يتغيّر ─────────────────────────────────────────────────────────────
-- · wash_bot_users: المعرّفُ والمحادثةُ والهاتفُ والمغسلةُ المربوطة، والمسوّدةُ في الصفّ نفسِه.
-- · wash_apply_status: جسدُ set_wash_booking_status (20260918b:278) كما هو — خريطةُ الانتقالات
--   وبطاقةُ الغسلات والملاحظة — بلا حارس الصلاحيّة، لينادَى من بابين.
-- · set_wash_booking_status: التوقيعُ والمنحُ نفسُهما، تصير غلافاً رقيقاً (manages_wash ثمّ apply).
-- · wash_bot_set_status: بابُ البوت — يتحقّق أنّ معرّفَ تيليجرام مربوطٌ بمغسلة الحجز.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جداولُ ودوالُّ المغاسل وحدَها. التراجع:
--   drop function wash_bot_set_status(uuid,text,bigint), wash_apply_status(uuid,text,text,uuid);
--   drop table wash_bot_users; ثمّ إعادةُ set_wash_booking_status من 20260918b.
begin;

-- ── ١ · مستخدمو البوت ─────────────────────────────────────────────────────
create table if not exists public.wash_bot_users (
  telegram_id bigint primary key,
  chat_id     bigint not null,
  name        text,
  phone       text check (phone is null or phone ~ '^07\d{9}$'),
  city        text,
  wash_id     uuid references public.car_washes(id) on delete set null,  -- مالكٌ/موظّف
  step        text,            -- ponytail: المسوّدةُ هنا لا في جدولٍ ثالث (1:1 بالمعرّف)
  draft       jsonb,
  bookings    integer not null default 0,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists wash_bot_users_wash_idx on public.wash_bot_users(wash_id) where wash_id is not null;
alter table public.wash_bot_users enable row level security;
-- لا سياسةَ ولا منحاً: دورُ الخدمة وحدَه يقرأ ويكتب (كما wash_events).
comment on table public.wash_bot_users is 'مستخدمو بوت «محطة الغسل» على تيليجرام: زبائنُ ومالكون، والمسوّدةُ معهم.';

-- ── ٢ · الجوهرُ: خريطةُ الانتقالات وبطاقةُ الغسلات (نصُّ 20260918b حرفاً، بلا حارس) ────
create or replace function public.wash_apply_status(p_id uuid, p_status text, p_note text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b wash_bookings; w car_washes; allowed boolean;
begin
  select * into b from wash_bookings x where x.id = p_id for update;
  if not found then raise exception 'no booking' using errcode = 'P0002'; end if;
  allowed := case b.status
    when 'pending'    then p_status in ('confirmed','cancelled_by_business','no_show','arrived','completed')
    when 'confirmed'  then p_status in ('arrived','in_service','completed','no_show','cancelled_by_business')
    when 'arrived'    then p_status in ('in_service','completed','no_show')
    when 'in_service' then p_status in ('completed')
    else false end;
  if not allowed then raise exception 'لا يمكن نقل الحجز من «%» إلى «%»', b.status, p_status; end if;
  if p_status = 'completed' then
    select * into w from car_washes x where x.id = b.wash_id;
    if b.use_free then
      update wash_stamps set free_credits = greatest(free_credits - 1, 0), updated_at = now()
       where wash_id = b.wash_id and phone = b.phone;
    elsif w.loyalty_target > 0 and b.phone is not null then
      insert into wash_stamps (wash_id, phone, stamps) values (b.wash_id, b.phone, 1)
      on conflict (wash_id, phone) do update set stamps = wash_stamps.stamps + 1, updated_at = now();
      update wash_stamps set stamps = 0, free_credits = free_credits + 1
       where wash_id = b.wash_id and phone = b.phone and stamps >= w.loyalty_target;
    end if;
  end if;
  update wash_bookings set status = p_status, status_at = now() where id = p_id;
  if p_note is not null and btrim(p_note) <> '' then
    insert into wash_events (wash_id, booking_id, kind, payload, actor, actor_kind, sent_at)
    values (b.wash_id, b.id, 'note', jsonb_build_object('note', left(btrim(p_note), 200)), p_actor, 'owner', now());
  end if;
end $$;
revoke all on function public.wash_apply_status(uuid, text, text, uuid) from public, anon, authenticated;

-- ── ٣ · بابُ الويب: التوقيعُ والمنحُ كما كانا، والجسدُ غلافٌ ─────────────────
create or replace function public.set_wash_booking_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare wid uuid;
begin
  select x.wash_id into wid from wash_bookings x where x.id = p_id;
  if wid is null then raise exception 'no booking' using errcode = 'P0002'; end if;
  if not manages_wash(wid) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform wash_apply_status(p_id, p_status, p_note, auth.uid());
end $$;
revoke all on function public.set_wash_booking_status(uuid, text, text) from public;
grant execute on function public.set_wash_booking_status(uuid, text, text) to authenticated;

-- ── ٤ · بابُ البوت: دورُ الخدمة وحدَه، والحارسُ ربطُ المعرّف بالمغسلة ────────
create or replace function public.wash_bot_set_status(p_booking uuid, p_status text, p_telegram_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare b wash_bookings;
begin
  select * into b from wash_bookings x where x.id = p_booking;
  if not found then raise exception 'no booking' using errcode = 'P0002'; end if;
  if not exists (select 1 from wash_bot_users u where u.telegram_id = p_telegram_id and u.wash_id = b.wash_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- المُشغّلُ wash_booking_log يقرأ الفاعلَ من هنا (كما wash_tick): لا auth.uid() لدور الخدمة.
  perform set_config('wash.actor', 'owner', true);
  perform wash_apply_status(p_booking, p_status, null, null);
  return json_build_object('code', b.code, 'from', b.status, 'status', p_status);
end $$;
revoke all on function public.wash_bot_set_status(uuid, text, bigint) from public, anon, authenticated;

-- ── ٥ · تأكيدات ───────────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from pg_proc where proname = 'set_wash_booking_status') = 1, 'set_wash_booking_status مكرّرة';
  assert (select prosrc from pg_proc where proname = 'set_wash_booking_status') like '%wash_apply_status%', 'set_wash_booking_status ليست غلافاً';
  assert (select count(*) from pg_proc where proname = 'wash_apply_status') = 1, 'wash_apply_status مكرّرة أو غائبة';
  assert (select count(*) from pg_proc where proname = 'wash_bot_set_status') = 1, 'wash_bot_set_status مكرّرة أو غائبة';
  assert (select prosrc from pg_proc where proname = 'wash_apply_status') like '%wash_stamps%', 'بطاقةُ الغسلات ضاعت من الجوهر';
  assert (select count(*) from pg_policies where tablename = 'wash_bot_users') = 0, 'سياسةٌ على wash_bot_users';
  -- عقدُ العزل
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
  assert not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                     where c.relname in ('stations','station_products','alerts','device_tokens','traffic_votes','profiles','telegram_users')
                       and t.tgname like '%wash%'), 'مُشغّلُ مغاسل على جدول وقود';
end $$;

commit;

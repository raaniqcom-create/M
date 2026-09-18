-- «غسيل»: إيصالُ الدفع من صاحب المغسلة — يرفعه هو، والإدارةُ تفعّل أو ترفض.
--
-- ── لماذا ────────────────────────────────────────────────────────────────
-- كان التفعيلُ كلُّه يدويّاً عبر واتساب: يحوّل المالكُ ثمّ يراسل الإدارة، وتُسجَّل الدفعةُ
-- من لوحة الإدارة وحدَها. الآن صفحةُ «إدارة الاشتراك» تعرض أرقامَ التحويل ورموزَ QR،
-- ويرفع المالكُ صورةَ الإيصال (أو يختار «الدفع لاحقاً») فتصير مطالبةً «claimed» في
-- wash_payments نفسِه — صفٌّ واحدٌ مفتوحٌ لكلّ مغسلة — ثمّ تحوّلها الإدارةُ إلى «paid»
-- (فيُمَدّ paid_until كما كان) أو «rejected» بملاحظةٍ يراها المالك.
--
-- ── ما يتغيّر ─────────────────────────────────────────────────────────────
-- · wash_payments: status (claimed/paid/rejected؛ الصفوفُ القديمة paid)، method،
--   receipt_path (مسارٌ في حاوية wash-receipts الخاصّة)، admin_note؛ وفهرسٌ فريدٌ جزئيٌّ: مطالبةٌ مفتوحةٌ واحدة.
-- · حاوية wash-receipts: خاصّة — الإيصالُ لقطةُ تحويلٍ (اسمٌ ورقمُ محفظةٍ ورصيد) فلا يصلح
--   في «wash» العامّة التي يقرؤها anon ويُعدّد مجلّداتِها. المالكُ يرفع في مجلّده (owns_wash)،
--   والمالكُ والإدارةُ يقرآن برابطٍ موقّع (createSignedUrl) من لوحة الإدارة.
-- · claim_wash_payment: بابُ المالك (owns_wash) — يُدرج أو يحدّث المطالبةَ المفتوحة؛ و«لاحقاً»
--   لا يمحو إيصالاً رُفع قبله.
-- · admin_wash_payment: التوقيعُ يزيد p_claim (اختياريّ) فتُغلق المطالبةُ بدل صفٍّ جديد.
--   تُحذف النسخةُ القديمة أوّلاً وإلّا التبس التحميلُ الزائد على PostgREST.
-- · admin_reject_wash_claim: رفضٌ بملاحظة.
-- · wash_admin_stats: paid_30d من المدفوع فقط، وclaims_open عدّادٌ جديد.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جداولُ ودوالُّ المغاسل وحدَها. التراجع:
--   drop function claim_wash_payment(uuid,text,integer,text,text), admin_reject_wash_claim(uuid,text),
--     admin_wash_payment(uuid,text,integer,integer,text,uuid);
--   drop index wash_payments_open_claim_idx;
--   alter table wash_payments drop column status, drop column method, drop column receipt_path, drop column admin_note;
--   drop policy "wash-receipts: owner writes own folder" on storage.objects; drop policy "wash-receipts: owner and admin read" on storage.objects;
--   drop function wash_receipt_ok(text); delete from storage.objects where bucket_id = 'wash-receipts'; delete from storage.buckets where id = 'wash-receipts';
--   ثمّ إعادةُ admin_wash_payment من 20260918 وwash_admin_stats من 20260921b.
begin;

-- ── ١ · الأعمدة والفهرس ───────────────────────────────────────────────────
alter table public.wash_payments
  add column if not exists status      text not null default 'paid' check (status in ('claimed', 'paid', 'rejected')),
  add column if not exists method      text check (method in ('zaincash', 'qicard', 'later')),
  add column if not exists receipt_path text check (receipt_path is null or receipt_path ~ '^[0-9a-f-]{36}/[^/]+$'),
  add column if not exists admin_note  text check (admin_note is null or char_length(admin_note) <= 200);
comment on column public.wash_payments.status is 'claimed = إيصالٌ بانتظار التدقيق؛ paid = دفعةٌ مسجَّلة؛ rejected = رُفض الإيصال.';
comment on column public.wash_payments.receipt_path is 'مسارُ الصورة في حاوية wash-receipts الخاصّة (<wash_id>/receipt-<ts>.jpg) — لا رابطٌ عامّ؛ يُوقَّع عند العرض.';
-- مطالبةٌ مفتوحةٌ واحدةٌ لكلّ مغسلة — والإيصالُ الجديدُ يحلّ محلّ القديم (on conflict).
create unique index if not exists wash_payments_open_claim_idx on public.wash_payments(wash_id) where status = 'claimed';

-- ── ١ب · حاوية الإيصالات الخاصّة ─────────────────────────────────────────
-- «wash: public read» تقيّد نفسَها بـbucket_id = 'wash' فلا تمسّ هذه.
insert into storage.buckets (id, name, public) values ('wash-receipts', 'wash-receipts', false) on conflict (id) do nothing;
/** مجلّدُ الإيصال = معرّفُ المغسلة؛ owns_wash لا manages_wash — الموظّفُ لا يطالب بدفع.
 *  plpgsql كي لا يُرمى '::uuid' على مجلّدٍ غريبٍ داخل تعبير السياسة (كما wash_storage_ok). */
create or replace function public.wash_receipt_ok(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare folder text := (storage.foldername(p_name))[1];
begin
  if folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return owns_wash(folder::uuid);
  end if;
  return false;
end $$;
revoke all on function public.wash_receipt_ok(text) from public;
grant execute on function public.wash_receipt_ok(text) to authenticated;
drop policy if exists "wash-receipts: owner writes own folder" on storage.objects;
create policy "wash-receipts: owner writes own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'wash-receipts' and wash_receipt_ok(name));
drop policy if exists "wash-receipts: owner and admin read" on storage.objects;
create policy "wash-receipts: owner and admin read" on storage.objects for select to authenticated
  using (bucket_id = 'wash-receipts' and wash_receipt_ok(name));

-- ── ٢ · المالكُ يطالب ─────────────────────────────────────────────────────
/** إيصالُ دفعٍ أو «الدفع لاحقاً»: صفٌّ claimed بأيّامٍ مؤقّتة (30) — الإدارةُ تضبط الأيّامَ عند التفعيل. */
create or replace function public.claim_wash_payment(p_wash uuid, p_plan text, p_amount integer, p_method text, p_receipt_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare w car_washes; rid uuid;
begin
  if not owns_wash(p_wash) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from car_washes x where x.id = p_wash for update;
  if not found then raise exception 'no wash' using errcode = 'P0002'; end if;
  if w.status in ('rejected', 'suspended') then raise exception 'الحساب موقوف — تواصل مع الإدارة'; end if;
  if not exists (select 1 from wash_plans p where p.code = p_plan and p.public and p.active) then raise exception 'الباقة غير متاحة'; end if;
  if p_method not in ('zaincash', 'qicard', 'later') then raise exception 'bad method' using errcode = '22023'; end if;
  if p_method = 'later' then
    p_receipt_path := null;
  elsif position(p_wash || '/' in coalesce(p_receipt_path, '')) <> 1 then
    raise exception 'الإيصال غير صالح — ارفع صورةً من جهازك';
  end if;
  -- «لاحقاً» فوق مطالبةٍ لها إيصالٌ: يبقى الإيصالُ وطريقتُه — لا يُمحى ما رُفع.
  insert into wash_payments (wash_id, plan, amount_iqd, days, status, method, receipt_path, created_by)
  values (p_wash, p_plan, greatest(0, p_amount), 30, 'claimed', p_method, p_receipt_path, auth.uid())
  on conflict (wash_id) where status = 'claimed' do update
    set plan = excluded.plan, amount_iqd = excluded.amount_iqd,
        method = case when excluded.receipt_path is null and wash_payments.receipt_path is not null then wash_payments.method else excluded.method end,
        receipt_path = coalesce(excluded.receipt_path, wash_payments.receipt_path),
        created_by = excluded.created_by, created_at = now(), admin_note = null
  returning id into rid;
  return rid;
end $$;
revoke all on function public.claim_wash_payment(uuid, text, integer, text, text) from public;
grant execute on function public.claim_wash_payment(uuid, text, integer, text, text) to authenticated;

-- ── ٣ · الإدارةُ تفعّل (صفٌّ جديدٌ أو إغلاقُ مطالبة) ─────────────────────
drop function if exists public.admin_wash_payment(uuid, text, integer, integer, text);
/** تسجيلُ دفعةٍ يدويّة: يُدرج الصفَّ (أو يُغلق المطالبةَ p_claim) ويضبط الباقةَ ويمدّ paid_until من اليوم أو من الانتهاء أيّهما أبعد. */
create function public.admin_wash_payment(p_wash uuid, p_plan text, p_amount integer, p_days integer, p_note text default null, p_claim uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Baghdad')::date; w car_washes;
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into w from car_washes x where x.id = p_wash for update;
  if not found then raise exception 'no wash' using errcode = 'P0002'; end if;
  if not exists (select 1 from wash_plans p where p.code = p_plan and p.active) then raise exception 'bad plan' using errcode = '22023'; end if;
  if p_claim is null then
    insert into wash_payments (wash_id, plan, amount_iqd, days, note, created_by)
    values (p_wash, p_plan, p_amount, p_days, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  else
    update wash_payments
       set status = 'paid', plan = p_plan, amount_iqd = p_amount, days = p_days,
           note = nullif(btrim(coalesce(p_note, '')), ''), admin_note = null
     where id = p_claim and wash_id = p_wash and status = 'claimed';
    if not found then raise exception 'الإيصال عولج سابقاً' using errcode = 'P0002'; end if;
  end if;
  update car_washes
     set plan = p_plan, status = 'approved',
         paid_until = greatest(today, coalesce(paid_until, today)) + p_days
   where id = p_wash;
end $$;
revoke all on function public.admin_wash_payment(uuid, text, integer, integer, text, uuid) from public;
grant execute on function public.admin_wash_payment(uuid, text, integer, integer, text, uuid) to authenticated;

/** رفضُ إيصال: تبقى المطالبةُ سجلّاً بملاحظةٍ يقرؤها المالك، ويُفتح بابُ إيصالٍ آخر. */
create or replace function public.admin_reject_wash_claim(p_claim uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update wash_payments set status = 'rejected', admin_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_claim and status = 'claimed';
  if not found then raise exception 'الإيصال عولج سابقاً' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.admin_reject_wash_claim(uuid, text) from public;
grant execute on function public.admin_reject_wash_claim(uuid, text) to authenticated;

-- ── ٤ · الإحصاءات: المدفوعُ وحدَه، والمطالباتُ المفتوحة ──────────────────
-- نسخةُ 20260921b كاملةً — تغييران: paid_30d بشرط status='paid'، وclaims_open.
create or replace function public.wash_admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Baghdad')::date; tick text;
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  tick := (select value from app_config where key = 'wash_tick_last');
  return json_build_object(
    'live',     (select count(*) from car_washes w where wash_published(w)),
    'pending',  (select count(*) from car_washes where status = 'pending'),
    'expiring', (select count(*) from car_washes where status = 'approved' and paid_until between today and today + 7),
    'expired',  (select count(*) from car_washes where status = 'approved' and paid_until < today),
    'today',    (select count(*) from wash_bookings where (starts_at at time zone 'Asia/Baghdad')::date = today and status in ('pending','confirmed','arrived','in_service','completed')),
    'month',    (select count(*) from wash_bookings where created_at > now() - interval '30 days'),
    'mrr',      (select coalesce(sum(p.price_iqd), 0) from car_washes w join wash_plans p on p.code = w.plan where wash_published(w)),
    'paid_30d', (select coalesce(sum(amount_iqd), 0) from wash_payments where status = 'paid' and created_at > now() - interval '30 days'),
    'claims_open', (select count(*) from wash_payments where status = 'claimed'),
    'reviews_7d', (select count(*) from wash_reviews where created_at > now() - interval '7 days'),
    'outbox_unsent', (select count(*) from wash_events where sent_at is null and error is null and kind in ('new','cancelled','review','confirmed','cancelled_by_business','in_service','completed','reminder')),
    'outbox_failed_24h', (select count(*) from wash_events where error is not null and error <> 'لا جهاز' and created_at > now() - interval '1 day'),
    'no_device_24h', (select count(*) from wash_events where error = 'لا جهاز' and created_at > now() - interval '1 day'),
    'expired_24h', (select count(*) from wash_bookings where status = 'expired' and status_at > now() - interval '1 day'),
    'pending_stale', (select count(*) from wash_bookings where status = 'pending' and created_at < now() - interval '1 hour' and starts_at > now()),
    'tick_last', tick,
    'tick_age_min', case when tick is null then null else round(extract(epoch from (now() - to_timestamp(tick, 'YYYYMMDDHH24MI'))) / 60) end
  );
end $$;
revoke all on function public.wash_admin_stats() from public, anon;
grant execute on function public.wash_admin_stats() to authenticated;

-- ── ٥ · تأكيدات ───────────────────────────────────────────────────────────
do $$ begin
  assert (select count(*) from information_schema.columns where table_name = 'wash_payments' and column_name in ('status', 'method', 'receipt_path', 'admin_note')) = 4, 'أعمدةُ المطالبة ناقصة';
  assert exists (select 1 from pg_indexes where indexname = 'wash_payments_open_claim_idx'), 'فهرسُ المطالبة المفتوحة غائب';
  assert exists (select 1 from storage.buckets where id = 'wash-receipts' and not public), 'حاويةُ الإيصالات عامّةٌ أو غائبة';
  assert (select count(*) from pg_policies where tablename = 'objects' and policyname like 'wash-receipts:%') = 2, 'سياساتُ wash-receipts ناقصة';
  assert public.wash_receipt_ok('ads/x.jpg') = false, 'wash_receipt_ok تقبل مجلّداً غريباً';
  assert (select count(*) from pg_proc where proname = 'admin_wash_payment') = 1, 'admin_wash_payment مكرّرة — التباسُ PostgREST';
  assert (select count(*) from pg_proc where proname = 'claim_wash_payment') = 1, 'claim_wash_payment غائبة';
  assert (select count(*) from pg_proc where proname = 'admin_reject_wash_claim') = 1, 'admin_reject_wash_claim غائبة';
  assert (select prosrc from pg_proc where proname = 'wash_admin_stats') like '%claims_open%', 'wash_admin_stats القديمة';
end $$;
commit;

-- «غسيل» M1: الباقاتُ والإعداداتُ والدفعُ اليدويّ — لا رقمَ ثابتاً في الكود.
--
-- وثيقةُ صاحب المنصّة (§6–8, 38–40, 44, 62, 81): ثلاثُ باقات (٤٠/٦٠/٩٠ ألفاً)
-- وعرضُ الإطلاق وحدودُ الحجز والغياب كلُّها تُضبط من لوحة الإدارة، وفترةُ سماحٍ
-- بعد انتهاء الاشتراك، ولا تُحذف بياناتُ المغسلة أبداً.
--
-- ── ما يُضاف ──────────────────────────────────────────────────────────────
-- wash_plans (الباقاتُ بمزاياها jsonb)، wash_payments (سجلُّ الدفعات اليدويّة)،
-- أعمدةٌ على car_washes (kind, owner_name, whatsapp, phone2, confirm_mode)،
-- مفاتيحُ app_config ببادئة wash_، دوالُّ القراءة/الضبط، وحدودُ حاوية الصور.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- لا جدولَ وقودٍ يُمسّ: app_config تُقرأ وتُكتب بمفاتيح wash_ فقط، والحاويةُ
-- wash وحدَها. التراجعُ اليدويّ:
--   drop function if exists wash_cfg(text,text), wash_features(car_washes), wash_config(),
--     admin_wash_payment(uuid,text,int,int,text), set_wash_config(text,text), wash_admin_config(),
--     admin_set_wash_plan(text,text,int,jsonb,boolean,boolean,smallint);
--   alter table car_washes drop column kind, drop column owner_name, drop column whatsapp,
--     drop column phone2, drop column confirm_mode; alter table car_washes drop constraint car_washes_plan_fkey;
--   drop table wash_payments; drop table wash_plans; delete from app_config where key like 'wash\_%';
begin;

-- ── ١ · الباقات ────────────────────────────────────────────────────────────
create table if not exists public.wash_plans (
  code      text primary key check (code ~ '^[a-z][a-z0-9_]{1,19}$'),
  name      text not null check (char_length(name) between 2 and 40),
  price_iqd integer not null check (price_iqd >= 0),
  -- المزايا والحدود: booking_monthly_limit, gallery_limit, staff_limit, offers_enabled,
  -- featured, analytics, sms_monthly_limit — تُقرأ بـ wash_features(w).
  features  jsonb not null default '{}',
  sort      smallint not null default 0,
  public    boolean not null default true,
  active    boolean not null default true
);
comment on table public.wash_plans is 'باقاتُ اشتراك المغاسل — الأسعارُ والحدودُ تُعدَّل من لوحة الإدارة.';

insert into public.wash_plans (code, name, price_iqd, features, sort, public, active) values
  ('basic',   'الأساسيّة',   40000, '{"booking_monthly_limit":60,"gallery_limit":1,"staff_limit":0,"offers_enabled":false,"featured":false,"analytics":false,"sms_monthly_limit":0}',   1, true,  true),
  ('pro',     'الاحترافيّة', 60000, '{"booking_monthly_limit":200,"gallery_limit":4,"staff_limit":2,"offers_enabled":true,"featured":false,"analytics":true,"sms_monthly_limit":100}', 2, true,  true),
  ('premium', 'المميّزة',    90000, '{"booking_monthly_limit":0,"gallery_limit":8,"staff_limit":5,"offers_enabled":true,"featured":true,"analytics":true,"sms_monthly_limit":250}',    3, true,  true),
  ('free',    'مجّانيّة',        0, '{"booking_monthly_limit":0,"gallery_limit":8,"staff_limit":5,"offers_enabled":true,"featured":false,"analytics":true,"sms_monthly_limit":0}',      9, false, true)
on conflict (code) do nothing;

alter table public.wash_plans enable row level security;
grant select on public.wash_plans to anon, authenticated;
drop policy if exists "wash_plans: public read active" on public.wash_plans;
create policy "wash_plans: public read active" on public.wash_plans for select using (active);

-- ── ٢ · المغاسل: الباقةُ مفتاحٌ خارجيّ، وأعمدةٌ جديدة ─────────────────────
alter table public.car_washes drop constraint if exists car_washes_plan_check;
update public.car_washes set plan = case plan when 'free' then 'free' else 'basic' end
 where plan not in (select code from public.wash_plans);
alter table public.car_washes alter column plan set default 'basic';
alter table public.car_washes drop constraint if exists car_washes_plan_fkey;
alter table public.car_washes add constraint car_washes_plan_fkey foreign key (plan) references public.wash_plans(code);

alter table public.car_washes
  add column if not exists kind         text not null default 'car_wash' check (kind ~ '^[a-z_]{2,30}$'),
  add column if not exists owner_name   text check (owner_name is null or char_length(owner_name) <= 60),
  add column if not exists whatsapp     text check (whatsapp is null or whatsapp ~ '^07\d{9}$'),
  add column if not exists phone2       text check (phone2 is null or phone2 ~ '^07\d{9}$'),
  add column if not exists confirm_mode text not null default 'manual' check (confirm_mode in ('manual','auto'));
comment on column public.car_washes.kind is 'نوعُ الخدمة: car_wash الآن، وغيرُه حين يتّسع القسمُ إلى خدمات السيارات.';
comment on column public.car_washes.confirm_mode is 'manual = الحجزُ ينتظر تأكيدَ المغسلة؛ auto = يُؤكَّد فورَ توفّر الموعد.';

-- ── ٣ · الدفعات اليدويّة ────────────────────────────────────────────────────
create table if not exists public.wash_payments (
  id         uuid primary key default gen_random_uuid(),
  wash_id    uuid not null references public.car_washes(id) on delete cascade,
  plan       text not null references public.wash_plans(code),
  amount_iqd integer not null check (amount_iqd >= 0),
  days       integer not null check (days between 1 and 400),
  note       text check (note is null or char_length(note) <= 200),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists wash_payments_wash_idx on public.wash_payments(wash_id, created_at desc);
alter table public.wash_payments enable row level security;
grant select on public.wash_payments to authenticated;
drop policy if exists "wash_payments: owner and admin read" on public.wash_payments;
create policy "wash_payments: owner and admin read" on public.wash_payments for select using (manages_wash(wash_id));

-- ── ٤ · الإعدادات العامّة (app_config ببادئة wash_) ────────────────────────
insert into app_config (key, value) values
  ('wash_grace_days', '3'),
  ('wash_promo_first_month', '20000'),
  ('wash_trial_days', '0'),
  ('wash_cancel_free_min', '30'),
  ('wash_no_show_block', '2'),
  ('wash_no_show_window_days', '30'),
  ('wash_max_active_guest', '1'),
  ('wash_max_active_sub', '2'),
  ('wash_horizon_guest', '1'),
  ('wash_horizon_sub', '3'),
  ('wash_device_daily', '5'),
  ('wash_pending_expire_min', '15'),
  ('wash_reminder_min', '60'),
  ('wash_push_daily_cap', '200'),
  ('wash_sms_enabled', 'false'),
  ('wash_sms_month_cap', '500'),
  ('wash_otp_required', 'false')
on conflict (key) do nothing;

create or replace function public.wash_cfg(p_key text, p_default text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_config where key = p_key), p_default);
$$;
revoke all on function public.wash_cfg(text, text) from public;
grant execute on function public.wash_cfg(text, text) to anon, authenticated, service_role;

/** مزايا الباقة كما تخصّ هذه المغسلة — jsonb يُقرأ بالمفتاح. */
create or replace function public.wash_features(w public.car_washes)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select features from wash_plans p where p.code = w.plan), '{}'::jsonb);
$$;
revoke all on function public.wash_features(public.car_washes) from public;
grant execute on function public.wash_features(public.car_washes) to anon, authenticated, service_role;

-- ── ٥ · النشرُ بفترة السماح ──────────────────────────────────────────────
-- «بعد انتهاء الاشتراك: فترةُ سماحٍ بسيطة، وخلالها تنبيهاتٌ ويمكن التجديد ولا
-- تُحذف البيانات» (§39–40). الصفحةُ والحجزُ يبقيان حتى paid_until + grace.
create or replace function public.wash_published(w public.car_washes)
returns boolean language sql stable as $$
  select w.status = 'approved' and w.paid_until is not null
     and w.paid_until + (wash_cfg('wash_grace_days', '3'))::int >= (now() at time zone 'Asia/Baghdad')::date;
$$;

-- ── ٦ · الحارس: kind والباقة لا يغيّرهما غيرُ الإدارة ────────────────────
create or replace function public.car_washes_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin boolean;
begin
  new.name := btrim(new.name);
  admin := auth.uid() is null or exists (select 1 from profiles where id = auth.uid() and role = 'admin');
  if admin then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.paid_until := null; new.admin_note := null; new.kind := 'car_wash';
    -- الباقةُ المختارةُ عند التسجيل تُحفظ (عامّةٌ ونشطة)، والدفعُ يفعّلها.
    if not exists (select 1 from wash_plans p where p.code = new.plan and p.public and p.active) then new.plan := 'basic'; end if;
  else
    new.status := old.status; new.owner_id := old.owner_id; new.paid_until := old.paid_until;
    new.plan := old.plan; new.admin_note := old.admin_note; new.kind := old.kind;
  end if;
  return new;
end $$;

-- ── ٧ · للجمهور: الباقاتُ والحدودُ في نداءٍ واحد ───────────────────────────
create or replace function public.wash_config()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'plans', (select coalesce(json_agg(json_build_object('code', code, 'name', name, 'price_iqd', price_iqd, 'features', features) order by sort), '[]'::json)
                from wash_plans where public and active),
    'promo_first_month', wash_cfg('wash_promo_first_month', '0')::int,
    'trial_days',        wash_cfg('wash_trial_days', '0')::int,
    'grace_days',        wash_cfg('wash_grace_days', '3')::int,
    'cancel_free_min',   wash_cfg('wash_cancel_free_min', '30')::int,
    'horizon_guest',     wash_cfg('wash_horizon_guest', '1')::int,
    'horizon_sub',       wash_cfg('wash_horizon_sub', '3')::int
  );
$$;
revoke all on function public.wash_config() from public;
grant execute on function public.wash_config() to anon, authenticated;

-- ── ٨ · الإدارة: دفعةٌ تفعّل، وإعداداتٌ تُضبط، وباقةٌ تُعدَّل ─────────────
/** تسجيلُ دفعةٍ يدويّة: يُدرج الصفَّ ويضبط الباقةَ ويمدّ paid_until من اليوم أو من الانتهاء أيّهما أبعد. */
create or replace function public.admin_wash_payment(p_wash uuid, p_plan text, p_amount integer, p_days integer, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Baghdad')::date; w car_washes;
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into w from car_washes x where x.id = p_wash for update;
  if not found then raise exception 'no wash' using errcode = 'P0002'; end if;
  if not exists (select 1 from wash_plans p where p.code = p_plan and p.active) then raise exception 'bad plan' using errcode = '22023'; end if;
  insert into wash_payments (wash_id, plan, amount_iqd, days, note, created_by)
  values (p_wash, p_plan, p_amount, p_days, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  update car_washes
     set plan = p_plan, status = 'approved',
         paid_until = greatest(today, coalesce(paid_until, today)) + p_days
   where id = p_wash;
end $$;
revoke all on function public.admin_wash_payment(uuid, text, integer, integer, text) from public;
grant execute on function public.admin_wash_payment(uuid, text, integer, integer, text) to authenticated;

/** ضبطُ مفتاحٍ عامّ — مفاتيحُ wash_ وحدَها، فلا يمسّ الإداريُّ إعداداتِ الوقود من هنا. */
create or replace function public.set_wash_config(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key !~ '^wash_[a-z_]{2,40}$' then raise exception 'bad key' using errcode = '22023'; end if;
  if p_value !~ '^[a-z0-9]{1,20}$' then raise exception 'bad value' using errcode = '22023'; end if;
  insert into app_config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.set_wash_config(text, text) from public;
grant execute on function public.set_wash_config(text, text) to authenticated;

create or replace function public.wash_admin_config()
returns json language plpgsql security definer set search_path = public as $$
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return json_build_object(
    'config', (select coalesce(json_object_agg(key, value), '{}'::json) from app_config where key like 'wash\_%'),
    'plans',  (select coalesce(json_agg(p order by p.sort), '[]'::json) from wash_plans p)
  );
end $$;
revoke all on function public.wash_admin_config() from public;
grant execute on function public.wash_admin_config() to authenticated;

create or replace function public.admin_set_wash_plan(
  p_code text, p_name text, p_price integer, p_features jsonb, p_public boolean, p_active boolean, p_sort smallint default 0
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into wash_plans (code, name, price_iqd, features, public, active, sort)
  values (p_code, btrim(p_name), p_price, coalesce(p_features, '{}'::jsonb), p_public, p_active, p_sort)
  on conflict (code) do update
    set name = excluded.name, price_iqd = excluded.price_iqd, features = excluded.features,
        public = excluded.public, active = excluded.active, sort = excluded.sort;
end $$;
revoke all on function public.admin_set_wash_plan(text, text, integer, jsonb, boolean, boolean, smallint) from public;
grant execute on function public.admin_set_wash_plan(text, text, integer, jsonb, boolean, boolean, smallint) to authenticated;

-- ── ٩ · حدودُ حاوية الصور — من القاعدة لا من المتصفّح (§55) ───────────────
update storage.buckets
   set file_size_limit = 1572864, allowed_mime_types = array['image/jpeg', 'image/webp']
 where id = 'wash';

-- ── ١٠ · تأكيداتُ العزل ─────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from wash_plans) >= 4, 'الباقاتُ لم تُبذر';
  assert (select count(*) from car_washes where plan not in (select code from wash_plans)) = 0, 'مغسلةٌ بباقةٍ غير معروفة';
  assert (select count(*) from app_config where key like 'wash\_%') >= 17, 'مفاتيحُ wash_ ناقصة';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
  assert not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                     where c.relname in ('stations','station_products','alerts','device_tokens','traffic_votes','profiles')
                       and t.tgname like '%wash%'), 'مُشغّلُ مغاسل على جدول وقود';
  assert (select count(*) from pg_proc where proname = 'book_wash') = 1, 'book_wash مكرّرة';
  assert (select file_size_limit from storage.buckets where id = 'wash') = 1572864, 'حدُّ الحاوية لم يُضبط';
end $$;

commit;

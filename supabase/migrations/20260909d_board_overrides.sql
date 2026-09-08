-- علاماتُ المشغّل على لوحة يومٍ بعينه: إخفاءُ محطةٍ أو مدينة، ووسمُ «نفد».
--
-- ── ولماذا جدولٌ مستقلٌّ لا عمودٌ في fuel_schedule ───────────────────────────
--
-- لأنّ السطرَ الظاهرَ للناس ليس دائماً سطرَ الجدول. `linkBack` في بوت تلغرام
-- يكتب `expected_at` في `station_products` عند كلّ نشر، فتدخل المحطةُ اللوحةَ
-- من مصدرها هي ويُبتلع سطرُ القناة فيها. فعمودُ إخفاءٍ في `fuel_schedule` كان
-- سيُخفي ما لا يُعرض ويترك ما يُعرض — وهو بعينه حالُ «غصن الزيتون» التي جاءت
-- الشكوى منها.
--
-- فالعلامةُ تصف **ما يُعرض** لا ما نُشر، وتُطبَّق بعد الدمج في `lib/board.ts`.
--
-- ── واليومُ وحدَه ──────────────────────────────────────────────────────────
--
-- `for_date` جزءٌ من العلامة لا مرشِّحٌ عليها. إخفاءٌ دائمٌ يُنسى يُخفي مدينةً
-- أسابيعَ بلا أن يلاحظ أحد، وهو عطلٌ صامت — وأصمتُ العطل أخطرُها في منصّةٍ
-- كلُّ رأسِ مالها أن يُصدَّق خبرُها. والجدولُ كائنُ يومٍ بطبعه.

begin;

create table if not exists public.board_overrides (
  id           uuid primary key default gen_random_uuid(),
  for_date     date not null,
  -- والفارغُ يعني «أيّ»: مدينةٌ بلا محطةٍ تعني المدينةَ كلَّها، ومحطةٌ بلا
  -- منتجٍ تعني منتجاتِها كلَّها. فسطرٌ واحدٌ يعبّر عن الثلاثة.
  city         text,
  station_id   uuid references public.stations(id) on delete cascade,
  station_name text,
  product      fuel_product,
  action       text not null check (action in ('hide', 'out')),
  -- ولا علامةَ فارغةً تُفرغ اللوحة: «أخفِ كلَّ شيء» يُكتب صراحةً لا سهواً.
  constraint board_overrides_targets_something
    check (city is not null or station_id is not null or station_name is not null or product is not null),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);

create index if not exists board_overrides_day_idx on public.board_overrides (for_date);

alter table public.board_overrides enable row level security;

-- تُقرأ علناً كما يُقرأ الجدول، وبالحدّ نفسِه: ما مضى لا يُعرض.
create policy "board_overrides: public read today" on public.board_overrides
  for select to public
  using (for_date >= (now() at time zone 'Asia/Baghdad')::date);

revoke all on public.board_overrides from anon, authenticated;
grant select on public.board_overrides to anon, authenticated;

-- ── والكتابةُ بدالّةٍ لا بسياسة ────────────────────────────────────────────
--
-- قاعدةُ هذا المشروع في كلّ إجراءٍ إداريّ — `cancel_announcement` و
-- `archive_station` وأخواتُهما: دالّةٌ `security definer` تفحص الدورَ بنفسها،
-- مسحوبةٌ من public، ممنوحةٌ لـauthenticated. والتصديرُ ساكنٌ فحارسُ المتصفّح
-- تجميليٌّ لا غير (`components/AdminOnly.tsx:12-16` يقولها صراحةً).
create or replace function public.set_board_override(
  p_for_date     date,
  p_action       text,
  p_city         text default null,
  p_station_id   uuid default null,
  p_station_name text default null,
  p_product      fuel_product default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('hide', 'out') then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  if coalesce(p_city, '') = '' and p_station_id is null
     and coalesce(p_station_name, '') = '' and p_product is null then
    raise exception 'override must target something' using errcode = '22023';
  end if;

  insert into board_overrides (for_date, city, station_id, station_name, product, action, created_by)
  values (p_for_date, nullif(p_city, ''), p_station_id, nullif(p_station_name, ''), p_product, p_action, auth.uid())
  returning id into v_id;
  return v_id;
end
$fn$;

-- والرفعُ يردّ **ما إن أصاب سطراً** — كما تفعل `cancel_announcement`. و«تمّ»
-- عن لا شيءٍ كذبةٌ صغيرةٌ يبني عليها المشغّلُ قراراً.
create or replace function public.clear_board_override(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare n int;
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from board_overrides where id = p_id;
  get diagnostics n = row_count;
  return n > 0;
end
$fn$;

revoke all on function public.set_board_override(date, text, text, uuid, text, fuel_product) from public;
revoke all on function public.clear_board_override(uuid) from public;
grant execute on function public.set_board_override(date, text, text, uuid, text, fuel_product) to authenticated;
grant execute on function public.clear_board_override(uuid) to authenticated;

comment on table public.board_overrides is
  'علاماتُ المشغّل على لوحة يومٍ بعينه — إخفاءٌ أو وسمُ نفاد. تصف ما يُعرض لا ما نُشر.';

commit;

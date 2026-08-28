-- لا تُمحى محطةٌ بلا نسخة.
--
-- ── ما جرى ──────────────────────────────────────────────────────────────
--
-- «محطة وقود المرزوق» سُجّلت 21:51 واعتُمدت 22:12 ثمّ حُذف صفُّها. ولم يبقَ
-- منها أثرٌ واحد: لا اسم، ولا عنوان، ولا إحداثيات، ولا رقم هاتف — إلا صفٌّ
-- يتيمٌ في notification_log يقول إن محطةً بهذا المعرّف اعتُمدت يوماً.
-- واستُعيدت لأن المالك تذكّر بياناتها، ولأن اسمها صادف وجودَه في بيانات
-- الخرائط المسحيّة. ولو لم يجتمع الأمران لضاعت.
--
-- ومرّتان قبلها في 23 و24 آب: معرّفان يتيمان لا يُعرف لهما اسم، ولا سبيل.
--
-- ── ولماذا الحذفُ أخطرُ مما يبدو ────────────────────────────────────────
--
-- خمسةَ عشرَ جدولاً تُصفَّى مع المحطة بـ on delete cascade، ومنها ما لا
-- يخصّها وحدها:
--
--   alerts              متابعو المواطنين لهذه المحطة — عناوينُ دفعٍ لا تُستعاد
--   device_tokens       جهازُ صاحبها المربوط
--   telegram_links      ربطُه بالبوت
--   station_reviews · traffic_votes · complaints    تاريخُها كلُّه
--
-- فضغطةٌ واحدة تمحو ما بناه الناس لا ما بنته المحطة.
--
-- ── والحارسُ مُشغِّل، لا زرٌّ في واجهة ───────────────────────────────────
--
-- الحذفُ يقع من ثلاثة أبواب لا باب: زرُّ لوحة الإدارة، وحذفُ الحساب الذي
-- يُسقط الملفَّ فتسقط معه المحطة، وأيُّ SQL يُكتب بيد. وحارسٌ في الواجهة
-- يحرس واحداً منها. فالنسخُ في المشغِّل: يقع مهما كان الباب.

create table if not exists public.station_archive (
  id          uuid primary key,          -- معرّفُ المحطة الأصليّ، فتعود بمعرّفها
  station     jsonb not null,            -- الصفُّ كاملاً كما كان
  products    jsonb not null default '[]'::jsonb,
  -- ما ضاع ولا يعود: تُعَدّ لحظةَ الحذف ليُعرف حجمُ ما لا يُسترجَع
  lost        jsonb not null default '{}'::jsonb,
  deleted_at  timestamptz not null default now(),
  deleted_by  uuid
);

alter table public.station_archive enable row level security;
revoke all on public.station_archive from anon, authenticated;

comment on table public.station_archive is
  'نسخةُ كلِّ محطةٍ حُذفت. تُكتب بمشغِّل قبل الحذف، ولا تُقرأ إلا بدالّة للإدارة.';

create or replace function public.archive_station()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.station_archive (id, station, products, lost, deleted_by)
  values (
    old.id,
    to_jsonb(old),
    coalesce((select jsonb_agg(to_jsonb(p)) from station_products p where p.station_id = old.id), '[]'::jsonb),
    jsonb_build_object(
      'followers', (select count(*) from alerts where station_id = old.id),
      'devices',   (select count(*) from device_tokens where station_id = old.id),
      'reviews',   (select count(*) from station_reviews where station_id = old.id),
      'messages',  (select count(*) from station_messages where station_id = old.id)
    ),
    auth.uid()
  )
  on conflict (id) do update
    set station = excluded.station,
        products = excluded.products,
        lost = excluded.lost,
        deleted_at = now(),
        deleted_by = excluded.deleted_by;
  return old;
end;
$$;

drop trigger if exists stations_archive_trg on public.stations;
create trigger stations_archive_trg
  before delete on public.stations
  for each row execute function public.archive_station();


-- ── الاسترجاع ────────────────────────────────────────────────────────────
--
-- بمعرّفها الأصليّ، فتعود روابطُها القديمة تعمل: /station/<id> ورابطُ الـslug
-- ومنشوراتُ صاحبها. والمنتجاتُ معها.
--
-- ولا تعود المتابعاتُ ولا الأجهزة: تلك عناوينُ دفعٍ حُذفت من جداولها، ولا
-- تُخترَع. ولذلك يُعَدّ ما ضاع وقتَ الحذف — ليُقال صراحةً لا ليُكتشَف بعد شهر.

create or replace function public.restore_station(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.station_archive;
begin
  if (select role from profiles where id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into a from public.station_archive where id = p_id;
  if a.id is null then
    raise exception 'no archived station %', p_id using errcode = 'P0002';
  end if;
  if exists (select 1 from stations where id = p_id) then
    raise exception 'station % already exists', p_id using errcode = '23505';
  end if;

  insert into stations
  select * from jsonb_populate_record(null::stations, a.station);

  insert into station_products
  select * from jsonb_populate_recordset(null::station_products, a.products)
  on conflict do nothing;

  delete from public.station_archive where id = p_id;
  return p_id;
end;
$$;

comment on function public.restore_station(uuid) is
  'تُعيد محطةً محذوفة بمعرّفها الأصليّ ومنتجاتها. للإدارة وحدها.';

revoke all on function public.restore_station(uuid) from public, anon;
grant execute on function public.restore_station(uuid) to authenticated;


-- ── قائمةُ المحذوفات للإدارة ─────────────────────────────────────────────

create or replace function public.deleted_stations()
returns table (
  id uuid, name text, city text, phone text, status text,
  deleted_at timestamptz, lost jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- profiles.id مؤهَّلٌ صراحةً: الدالّة تُرجع عموداً اسمه id، فـ«id» وحدَها
  -- ملتبسةٌ بينه وبين عمود الجدول — 42702، وتسقط الدالّة قبل أن تحرس شيئاً.
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select a.id,
           a.station->>'name',
           a.station->>'city',
           a.station->>'phone',
           a.station->>'status',
           a.deleted_at,
           a.lost
      from public.station_archive a
     order by a.deleted_at desc;
end;
$$;

revoke all on function public.deleted_stations() from public, anon;
grant execute on function public.deleted_stations() to authenticated;

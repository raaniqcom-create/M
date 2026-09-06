-- استرجاعُ محطةٍ صاحبُها حُذف حسابُه.
--
-- ── العطل ───────────────────────────────────────────────────────────────
--
--   insert or update on table "stations" violates foreign key
--   constraint "stations_owner_id_fkey"
--
-- `station_archive` تحفظ صفَّ المحطة كاملاً في jsonb، و`owner_id` من جملته.
-- فإذا حُذف حسابُ صاحبها بعد الأرشفة، سقط صفُّ `profiles` معه بالتتالي
-- (schema.sql:23)، وصار الاسترجاعُ يُدرج معرّفَ مالكٍ لا وجودَ له.
--
-- قِيس على القاعدة الحيّة: في الأرشيف صفّان —
--   «محطة النخيب»                        صاحبُها قائم   → تُسترجَع
--   «محطة تعبئة وقود الاوائل النموذجية»  صاحبُها محذوف → ترتدّ
-- وهي المحذوفةُ يوم ٣١ آب، والحسابُ زال بعدها.
--
-- ── والعلاجُ ليس منعَ الاسترجاع ─────────────────────────────────────────
--
-- المحطةُ موجودةٌ على الأرض ولها روّادها ورابطُها القديم؛ ومنعُ عودتها لأن
-- حساباً زال عقوبةٌ على الخطأ لا إصلاحٌ له. فتعود باسم المدير الذي استرجعها
-- — وهو ما يقع أصلاً حين تُنشئ الإدارةُ محطةً من لوحتها — ثمّ تُسلَّم إلى
-- صاحبها بربط رقمه (station-phone) متى عاد.
--
-- والبديلُ المرفوض: `owner_id` فارغاً. العمودُ `not null`، وجعلُه اختياريّاً
-- يُدخل حالةَ «محطةٌ بلا مالك» في كلِّ استعلامٍ في المنصّة.

create or replace function public.restore_station(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.station_archive;
  row_json jsonb;
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

  -- صاحبُها إن زال، فالمديرُ المسترجِع. ولا يُلمس `owner_id` إن كان قائماً:
  -- الاسترجاعُ يعيد المحطةَ كما كانت، ولا ينزع مِلكيّةً لم تُفقد.
  row_json := a.station;
  if not exists (
    select 1 from profiles p where p.id = (a.station->>'owner_id')::uuid
  ) then
    row_json := jsonb_set(row_json, '{owner_id}', to_jsonb(auth.uid()));
  end if;

  insert into stations
  select * from jsonb_populate_record(null::stations, row_json);

  insert into station_products
  select * from jsonb_populate_recordset(null::station_products, a.products)
  on conflict do nothing;

  delete from public.station_archive where id = p_id;
  return p_id;
end;
$$;

comment on function public.restore_station(uuid) is
  'تُعيد محطةً محذوفة بمعرّفها الأصليّ ومنتجاتها. للإدارة وحدها. وإن كان صاحبُها قد حُذف حسابُه عادت باسم المدير المسترجِع.';

revoke all on function public.restore_station(uuid) from public, anon;
grant execute on function public.restore_station(uuid) to authenticated;


-- ── ويُقال للمدير قبل أن يضغط، لا بعد ───────────────────────────────────
--
-- زرٌّ يعمل ثمّ يُخبرك أنه غيّر المالك أسوأُ من زرٍّ يقول ذلك قبل الضغط.
-- فتُضاف رايةٌ إلى القائمة، وتُقرأ في نصّ التأكيد.
--
-- و`drop` لازمٌ لا `replace`: النوعُ الراجع جدولٌ، وإضافةُ عمودٍ إليه تغييرٌ
-- في التوقيع لا يقبله `create or replace`. وقارئُها واحدٌ في المستودع كلِّه
-- (components/DeletedStations.tsx:31) ولا مُشغِّلَ يعتمدها، فالإسقاطُ آمن.
drop function if exists public.deleted_stations();

create function public.deleted_stations()
returns table (
  id uuid, name text, city text, phone text, status text,
  deleted_at timestamptz, lost jsonb, owner_gone boolean
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
           a.lost,
           not exists (
             select 1 from profiles p where p.id = (a.station->>'owner_id')::uuid
           )
      from public.station_archive a
     order by a.deleted_at desc;
end;
$$;

revoke all on function public.deleted_stations() from public, anon;
grant execute on function public.deleted_stations() to authenticated;

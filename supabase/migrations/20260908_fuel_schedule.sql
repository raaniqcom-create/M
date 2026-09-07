-- جدولُ الغد: ما يصل من وقودٍ في محطاتٍ مسمّاة، قبل أن يصل.
--
-- ── لماذا جدولٌ خاصّ ولا يُحشر في announcements ─────────────────────────
--
-- الإغراءُ قويّ: هناك `station_name` و`linked_station_id` واللوحةُ الخضراء
-- والحمراء جاهزة. لكنّ `open_announcements()` مبنيٌّ على سؤالٍ آخر — «هل
-- الوقودُ هناك **الآن**؟» — وثلاثةُ بنودٍ فيه تقاتل جدولَ الغد:
--
--   ١ ـ يشترط اليومَ التقويميَّ نفسَه لـ`sent_at` (20260823c:83)، وجدولُ الغد
--       يُنشر الليلةَ عن الغد.
--   ٢ ـ والصفوفُ غيرُ المسجّلة تموت عند `unregistered_close_hm` (٢١:٠٠)
--       (20260823c:84-85) — فجدولٌ يُنشر التاسعةَ والنصف يُخفى فور نشره.
--   ٣ ـ ومِكنسةُ الدقيقتين تُرسل إشعاراً لكلّ صفّ (notify-favorites:77-83)،
--       فثمانيةُ محطاتٍ = ثمانيةُ إشعاراتٍ في دقيقة.
--
-- ثلاثةُ خصوماتٍ لأمرٍ واحد. فجدولٌ مستقلّ، ولا يُلمس ما يعمل.

create table if not exists public.fuel_schedule (
  id uuid primary key default gen_random_uuid(),

  -- اليومُ الذي يخصّه، بتقويم بغداد. تاريخٌ مجرّدٌ لا طابعُ وقت — كما
  -- `station_products.expected_at`، وللسبب نفسِه: «غداً» يومٌ لا لحظة.
  for_date date not null,
  product fuel_product not null,

  -- رسالةٌ واحدة = دفعةٌ واحدة. فرسالةٌ ثانيةٌ عن الوقود نفسِه تُضاف ولا
  -- تستبدل (قرارُ صاحب المنصّة)، والتراجعُ عن رسالةٍ حذفُ دفعةٍ لا صفوفٍ.
  batch_id uuid not null,

  -- الاسمُ كما وصل، بلهجته. يبقى محفوظاً حتى بعد المطابقة: هو ما يعرفه
  -- الناسُ في الشارع، وقد يكون أوضحَ لهم من الاسم الرسميّ.
  raw_name text not null,
  -- الاسمُ المعروض — الرسميُّ إن طوبق، وإلّا فهو `raw_name`.
  station_name text not null,
  city text,
  linked_station_id uuid references stations(id) on delete set null,

  -- ثقةُ المطابقة وقتَ النشر. تُحفظ لتُقاس لاحقاً: أيُّ الأسماء يُخطئ فيها
  -- المطابقُ باستمرار؟ بلا هذا العمود يبقى السؤالُ بلا جواب.
  match_score int not null default 0,

  note text,
  created_at timestamptz not null default now(),
  created_by uuid,

  -- مِفتاحُ المصدر: معرّفُ المنشور الذي جاء منه هذا الصفّ. فريدٌ كي تكون
  -- إعادةُ القراءة بلا أثر — مهمّةٌ تقرأ القناةَ كلَّ عشر دقائق سترى المنشورَ
  -- نفسَه مرّاتٍ، ولا يجوز أن يُستورد مرّتين.
  source_ref text
);

create unique index if not exists fuel_schedule_source_uniq
  on public.fuel_schedule (source_ref, raw_name)
  where source_ref is not null;

create index if not exists fuel_schedule_day_idx
  on public.fuel_schedule (for_date, product);

comment on table public.fuel_schedule is
  'جدولُ وصول الوقود غداً. يُكتب بمفتاح الخدمة بعد تأكيد الإدارة، ويُقرأ للجميع.';

alter table public.fuel_schedule enable row level security;

-- **قراءةٌ لليوم والغد فقط.** جدولُ أمس ليس خبراً بل أرشيف، وعرضُه يجعل
-- الصفحةَ تكذب. والتاريخُ بتقويم بغداد لا بتوقيت الخادم: الخادمُ في سنغافورة،
-- و`current_date` عنده يسبق بغدادَ أو يتأخّر عنها بحسب الساعة.
drop policy if exists "fuel_schedule: public read today" on public.fuel_schedule;
create policy "fuel_schedule: public read today" on public.fuel_schedule
  for select to public
  using (for_date >= (now() at time zone 'Asia/Baghdad')::date);

revoke all on public.fuel_schedule from anon, authenticated;
grant select on public.fuel_schedule to anon, authenticated;


-- ── وهجرةُ سجلٍّ لعمودين بلا هجرة ───────────────────────────────────────
--
-- `expected_at` و`expected_period` قائمان على القاعدة الحيّة منذ زمن، ولا
-- ملفَّ في هذا المستودع يُنشئهما — ذكرُهما الوحيد تعليقٌ في
-- 20260903_runs_out_at.sql. فأيُّ إعادةِ بناءٍ من المستودع تُخرج قاعدةً
-- ينقصها عمودان يكتب فيهما app/owner/page.tsx وتقرؤهما خمسةُ أسطح.
--
-- وهو انحرافُ المخطَّط نفسُه الذي عولج مرّةً في
-- 20260817f_announcements_schema_of_record.sql. `if not exists` فلا أثرَ على
-- قاعدةٍ تحملهما سلفاً.

alter table public.station_products
  add column if not exists expected_at date,
  add column if not exists expected_period text;

comment on column public.station_products.expected_at is
  'تاريخٌ مجرّد: متى يتوقّع صاحبُ المحطة وصولَ هذا المنتج. يكتبه المالك وحدَه.';
comment on column public.station_products.expected_period is
  'morning | afternoon | evening — فترةُ اليوم، بلا ساعةٍ دقيقة.';


-- ── واسمٌ محجوزٌ جديد ───────────────────────────────────────────────────
--
-- `/schedule` مسارٌ ساكنٌ يُحلّ قبل `/[slug]`، فمحطةٌ تحمله تملك رابطاً لا
-- يُفتح. و`create or replace` لا `drop`: المُشغّلُ stations_guard_trg يعتمدها،
-- و`drop ... cascade` يمحوه صامتاً فتمضي التسجيلاتُ بلا slug وبلا pending.

CREATE OR REPLACE FUNCTION public.stations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  candidate text;
  n int := 0;
begin
  -- اسمٌ بلا كلمة «محطة» يُقرأ حيّاً أو شارعاً حين يصل في إشعار — وعشرٌ من
  -- ثمانٍ وثلاثين كانت كذلك. والاختبارُ «يحوي» لا «يبدأ بـ»، وبإملاءَي التاء.
  new.name := btrim(new.name);
  if new.name <> '' and new.name !~ 'محط[ةه]' then
    new.name := 'محطة ' || new.name;
  end if;

  -- Every insert passes here, whoever makes it, so this is the one place a
  -- missing slug can be caught for good.
  if new.slug is null or btrim(new.slug) = '' then
    candidate := station_slug(new.name, new.id);
    -- these static routes resolve before the /[slug] catch-all, so a station
    -- claiming one would own a link that never opens
    while candidate in ('login','register','owner','admin','station','offline','api',
                        'icons','ads','alerts','download','privacy','subscribe',
                        'reset','test-push','about','news','road','branch','sounds',
                        'schedule','manifest.json','sw.js')
          or exists (select 1 from stations s where s.slug = candidate and s.id <> new.id)
    loop
      n := n + 1;
      candidate := station_slug(new.name, new.id) || '-' || n::text;
    end loop;
    new.slug := candidate;
  end if;

  -- service-role callers (edge functions) and admins are trusted
  if auth.uid() is null
     or exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
  else
    new.status := old.status;
    new.owner_id := old.owner_id;
  end if;
  return new;
end $function$;

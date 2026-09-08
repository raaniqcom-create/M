-- ساعةٌ اختياريّةٌ للوعد — «متوقّع غداً ٦:٠٠»، لا «متوقّع غداً» وحدَها.
--
-- ── من أين جاءت ─────────────────────────────────────────────────────────
--
-- اتّصل صاحبُ محطةٍ بصاحب المنصّة فقال: «نحن نجبر على وضع كلمة متوقع غدا
-- وهذه عدم مصداقية مع الزبون، فنرجو إضافة خيار: منتج غير متوفر - متوفر -
-- متوقع، ويحدد الوقت».
--
-- وهو محقٌّ في شطرين. الأوّل أنّ وعداً بلا ساعةٍ لا يُبنى عليه قرار: مسافرٌ
-- يقرأ «غداً» لا يعرف أيخرج فجراً أم عصراً. والثاني — وهو الأثقل — أنّ
-- لوحتَه لم يكن فيها زرٌّ يقول «لا شيء عندي ولا أعِد بشيء» إلّا وهو يعني
-- الاختفاءَ من القائمة. وقِيست القاعدةُ يومَ كُتب هذا: من إحدى وأربعين محطةً
-- معتمدة، **أربعَ عشرةَ تبقى ظاهرةً بالوعد وحدَه**. ثلثُ المنصّة يشتري ظهورَه
-- بوعد، وهذا ما اتّصل بشأنه.
--
-- ── ولماذا عمودٌ جديدٌ لا تحويلُ expected_at إلى timestamptz ─────────────
--
-- سببان، كلٌّ منهما كافٍ وحدَه.
--
-- **المدى.** `expected_at` تُقارَن **نصّاً** في ستّة مواضع لا ينجو منها واحد:
-- lib/board.ts:167 (`p.expected_at !== day`)، و lib/scheduleData.ts:127
-- (`.eq('expected_at', day)`)، و components/BranchBoard.tsx:207، و
-- components/ProductControl.tsx:131، و supabase/functions/telegram/index.ts:2174،
-- و expectedLabel نفسُها في lib/products.ts.
--
-- **وفسادٌ صامتٌ لحظةَ الهجرة.** `'2026-09-09'::date::timestamptz` يُحسب بتوقيت
-- **الخادم** لا بتوقيت بغداد. فكلُّ وعدٍ قائمٍ في القاعدة ينزلق ثلاثَ ساعاتٍ
-- إلى الوراء: «متوقع غداً» تصير «متوقع اليوم ٣:٠٠ فجراً» — بلا خطأٍ يُرمى ولا
-- سطرٍ في سجلّ. وهو الانزلاقُ نفسُه الذي كُتبت `isoDateIn` لتفاديه
-- (lib/products.ts:107-109).
--
-- فالساعةُ عمودٌ مجرّدٌ كالتاريخ: `time` بساعة بغداد. و`formatTime` في
-- lib/hours.ts:57 تقرأ "HH:MM:SS" منذ اليوم الأوّل — وهي الصيغةُ التي تُرجعها
-- PostgREST لعمود `time` — فلا سطرَ تنسيقٍ واحدٍ جديد.
--
-- ولا يُحمَّل `expected_period` الساعةَ: عمودُ نصٍّ يُقرأ بقاموسٍ في أربعة
-- مواضع، فقيمةُ '14:30' تطبع `undefined` صامتةً على شاشة القارئ.

begin;

alter table public.station_products
  add column if not exists expected_time time;

comment on column public.station_products.expected_time is
  'ساعةُ الوصول المتوقّعة بتوقيت بغداد — اختياريّة. تُغني عن expected_period حين تُذكر، ولا تُذكر بلا expected_at.';


-- ── وحارسان في القاعدة لا في الواجهة ────────────────────────────────────
--
-- الكاتبون في هذا الجدول خمسة: لوحةُ الويب، ولوحةُ الإدارة، وبوتا تيليجرام
-- وواتساب، و`linkBack`. والبوتان يكتبان بمفتاح الخدمة — فوق كلّ حارسٍ في
-- المتصفّح. فما يجب ألّا يقع يُمنع هنا.

-- وساعةٌ بلا يومٍ لا معنى لها: «٦:٠٠» من أيّ يوم؟
alter table public.station_products
  drop constraint if exists station_products_time_needs_day;
alter table public.station_products
  add  constraint station_products_time_needs_day
  check (expected_time is null or expected_at is not null);

-- والفترةُ ثلاثُ كلماتٍ لا نصٌّ حرّ — وقد كانت بلا حارسٍ إطلاقاً منذ أُضيفت
-- في 20260908_fuel_schedule.sql:89. وقِيست القاعدةُ قبل كتابة هذا السطر:
-- القيمُ الموجودة فعلاً morning و afternoon و evening لا رابع، فالقيدُ يُفحص
-- على الصفوف القائمة ولا يُؤجَّل بـ`not valid`.
alter table public.station_products
  drop constraint if exists station_products_period_domain;
alter table public.station_products
  add  constraint station_products_period_domain
  check (expected_period is null or expected_period in ('morning', 'afternoon', 'evening'));

-- ولا فهرس — للسبب المكتوب في 20260903_runs_out_at.sql: الجدولُ صفوفُه بعددِ
-- المحطات في سبعة، والعمودُ لا يُصفّى به قطّ.

commit;

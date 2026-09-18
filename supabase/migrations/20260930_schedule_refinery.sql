-- ═══ المصفى المجهِّز، وغرضُ الحمولة ═══════════════════════════════════════
--
-- بدأ الجدولُ يصل بصيغةٍ ثالثة: عنوانٌ يجمع الوقودَ والمصفى «كاز | مصفى
-- الصينية»، وتحته أسماءٌ مجرّدة، بعضُها موسومٌ «- مولدات» أو «- خط سير تصدير».
-- وطلبُ صاحب المنصّة: «سنضيف بجانب اسم منتج الوقود في اعلى الجدول: نوع
-- المصفى… و كاز المولدات جدولٌ مخصّصٌ مع اسم المصفى».
--
-- ── ولماذا لا قيمةٌ ثامنةٌ في fuel_product ───────────────────────────────
--
-- قرارُ صاحب المنصّة: كازُ المولّدات كازٌ، والفرقُ في وجهته لا في مادّته.
-- وإضافةُ قيمةٍ إلى التعداد تمسّ كلَّ سطح — PRODUCT_LABELS وPRODUCT_ORDER
-- والبطاقةَ ولوحةَ المالك والإشعارَ وواتساب وCarPlay — لتقول ما يقوله عمودٌ
-- نصّيّ. وهو الاختيارُ نفسُه المسجَّل في lib/officialTable.ts:70-78 عن زيت
-- الغاز: عُرضت قيمةٌ ثامنةٌ فطُويت في الكاز.
--
-- ونصٌّ بحارسٍ لا نوعٌ معدود: النوعُ هجرةٌ ثانيةٌ يومَ يُضاف غرضٌ ثالث.
--
-- ── ولا تعبئةَ رجعيّة ───────────────────────────────────────────────────
--
-- `null` تعني اليومَ بالضبط ما يعنيه كلُّ صفٍّ قائم: «للسيارات، ولا مصفى
-- معلوم». وهو ما ترسمه اللوحةُ أصلاً.
begin;

alter table public.fuel_schedule add column if not exists refinery text;
alter table public.fuel_schedule add column if not exists purpose  text;

do $$ begin
  alter table public.fuel_schedule
    add constraint fuel_schedule_purpose_chk
    check (purpose is null or purpose in ('generators', 'export'));
exception when duplicate_object then null; end $$;

comment on column public.fuel_schedule.refinery is
  'المصفى المجهِّز كما في عنوان القسم: «مصفى الصينية». فارغٌ لمنشور القناة.';
comment on column public.fuel_schedule.purpose is
  'generators مولّدات · export خط سير تصدير · فارغٌ = سيارات، وهو الأصل.';

-- ── والفهرسُ يُنزع عنه شرطُه ─────────────────────────────────────────────
--
-- الفهرسُ الجزئيُّ لا يُستنتج مُحكِّماً في `on conflict` ما لم يُعَد شرطُه في
-- الجملة، وPostgREST لا يعيده — فكلُّ لصقٍ بمرجعٍ كان يخاطر بـ42P10.
--
-- والنزعُ لا يغيّر سلوكاً: مفتاحٌ فيه `null` لا يساوي نفسَه، فصفوفُ القناة
-- (source_ref فارغ) تبقى تتكرّر بحقّ — الرسالةُ الثانيةُ من القناة إضافةٌ
-- مقصودةٌ لا تكرار.
drop index if exists public.fuel_schedule_source_uniq;
create unique index if not exists fuel_schedule_source_uniq
  on public.fuel_schedule (source_ref, raw_name);

do $$
declare
  n int;
begin
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'fuel_schedule'
             and column_name in ('refinery', 'purpose')) = 2, 'العمودان لم يُضافا';

  -- والحارسُ يردّ غرضاً لم يُعرَّف
  begin
    insert into fuel_schedule (for_date, product, batch_id, raw_name, station_name, purpose)
    values (current_date, 'kerosene', gen_random_uuid(), 'فحصٌ', 'فحصٌ', 'لا شيء');
    raise exception 'الحارسُ قبِل غرضاً مجهولاً';
  exception when check_violation then null; end;

  -- والفهرسُ صار كلّيّاً، فيصلح مُحكِّماً
  select count(*) into n from pg_index i
    join pg_class c on c.oid = i.indexrelid
   where c.relname = 'fuel_schedule_source_uniq' and i.indpred is null;
  assert n = 1, 'الفهرسُ ما زال جزئيّاً';
end $$;

commit;

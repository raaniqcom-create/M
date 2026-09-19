-- ═══ التسجيلُ يسقط منذ ١٥ أيلول: `returning` يُرفض فيُلغى الإدراج ═════════
--
-- «راجع محاولات التسجيل كمحطات جديدة — جميعها لم تتم» — صاحبُ المنصّة، ١٩ أيلول.
--
-- ── القياس ──────────────────────────────────────────────────────────────
--
-- آخرُ محطةٍ سُجّلت بنجاح: ٢٠٢٦-٠٩-١٤ ١٨:٠٤. وبعدها **إحدى وعشرون محاولة**
-- خلّفت حساباً بلا محطة — والحسابُ وحدَه ليس شيئاً: صاحبُ المحطة يرى «تعذّر
-- حفظ بيانات المحطة» فينصرف ولا يعود.
--
-- وأوّلُ فشلٍ وقع ٢٠٢٦-٠٩-١٥ ٢٠:١٢ (بتوقيت UTC)، و`20260916_station_managers`
-- دُفع ٢٠٢٦-٠٩-١٦ ٠٠:٠٨ بتوقيت بغداد+١ — أي ٢٠:٠٨ بنفس التوقيت. **أربعُ دقائق
-- بينهما.**
--
-- ── والعلّة ─────────────────────────────────────────────────────────────
--
-- `StationRegisterForm.tsx:261-274` تكتب:
--
--     .from('stations').insert({...}).select('id').single()
--
-- و`select` بعد الإدراج يعني `returning` — وPostgres يُطبّق **سياسةَ القراءة**
-- على الصفّ الجديد. وذاك الترحيلُ بدّل السياسة:
--
--     كانت:  using (owner_id = auth.uid())      ← عمودٌ في الصفّ نفسِه
--     صارت:  using (manages_station(id))        ← دالّةٌ تستعلم عن الجدول
--
-- و`manages_station` معرَّفةٌ `stable`، والدالّةُ المستقرّة تقرأ بلقطة الاستعلام
-- الذي ناداها — **واللقطةُ لا تحوي الصفَّ الذي يُدرَج في الاستعلام نفسِه**. فتردّ
-- `false`، فيُرفض `returning`، فتسقط الجملةُ كلُّها ويُلغى الإدراج.
--
-- ولذلك لم يبقَ أثرٌ في `stations` أصلاً: لا صفَّ معلَّقاً ولا محذوفاً. الحسابُ
-- وحدَه بقي، لأنّه أُنشئ في نداءٍ سابقٍ منفصل.
--
-- ولذلك أيضاً بقي تسجيلُ الإدارة يعمل: `stations: admin read all` تقرأ بلا
-- استعلامٍ عن الجدول، فلا تقع في اللقطة نفسِها.
--
-- ── والعلاج: العمودُ أوّلاً، والدالّةُ بعده ──────────────────────────────
--
-- المالكُ يُعرف من الصفّ نفسِه بلا استعلام — وهو ما كان قبل الترحيل ويعمل في
-- `returning`. والورديّةُ تبقى على حالها: من ليس مالكاً تُسأل عنه الدالّة.
-- فلا يُنقَص حقٌّ ولا يُفتح باب: `owner_id = auth.uid()` أضيقُ من
-- `manages_station` لا أوسع.
begin;

drop policy if exists "stations: owner read own" on public.stations;
create policy "stations: owner read own" on public.stations
  for select using (owner_id = auth.uid() or manages_station(id));

-- والتحديثُ مثلُها: `update ... returning` يقع في اللقطة نفسِها، ولوحةُ المالك
-- تقرأ ما كتبت. ولم يظهر عطبُه لأنّ الصفَّ هناك قائمٌ قبل الجملة — لكنّ الشرطَ
-- يُوحَّد كي لا يُكتشف الفرقُ يوماً في مسلكٍ آخر.
drop policy if exists "stations: owner update own" on public.stations;
create policy "stations: owner update own" on public.stations
  for update using (owner_id = auth.uid() or manages_station(id));

do $$
declare
  q text;
begin
  select pg_get_expr(polqual, polrelid) into q
    from pg_policy
   where polrelid = 'public.stations'::regclass
     and polname = 'stations: owner read own';
  assert q like '%owner_id%', 'سياسةُ القراءة لا تفحص العمود مباشرةً — و«returning» سيسقط ثانيةً';

  assert exists (
    select 1 from pg_policy
     where polrelid = 'public.stations'::regclass and polname = 'stations: owner insert'
  ), 'سياسةُ الإدراج غائبة';
end $$;

commit;

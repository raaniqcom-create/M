-- «ضغطتُ اعتماد ولم ينفذ» — ١٣ أيلول ٢٠٢٦.
--
-- على stations سياساتُ قراءةٍ اثنتان: «العامّةُ تقرأ المعتمدَ» و«المالكُ يقرأ
-- محطتَه» — ولا سياسةَ قراءةٍ للإدارة، مع أنّ لها «تحديثَ أيّ محطة». وفي
-- Postgres تحديثٌ فيه `where id = …` يُخضع الصفَّ لسياسات القراءة أيضاً:
-- فطلبٌ معلّق (غيرُ معتمدٍ، وليس للمدير) لا يراه التحديثُ أصلاً — صفرُ صفوفٍ
-- بلا خطأ. وهكذا كان زرُّ الاعتماد يُزيل الطلبَ من القائمة ثمّ يعيده الجلبُ.
-- (كان ينجح حين تكون المحطةُ باسم المدير: «المالكُ يقرأ محطتَه».)
begin;

drop policy if exists "stations: admin read all" on public.stations;
create policy "stations: admin read all" on public.stations
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

commit;

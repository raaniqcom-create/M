-- المالكُ يقرأ شكاوى محطته وحدَها.
--
-- كانت الشكاوى للمدير وحدَه (`app/admin/station`)، وصاحبُ المحطة لا يعلم أنّ
-- أحداً اشتكى منه إلّا إن هاتفته الإدارة. وطلبُ صاحب المنصّة ١١ أيلول ٢٠٢٦:
-- أيقونةُ «الشكاوي» في لوحة المالك. قراءةً فقط — «تمّت المعالجة» تبقى للمدير،
-- فلا يُثبت أحدٌ لنفسه أنّه عالج. والصفُّ لا يحمل هويّةَ المشتكي أصلاً.
--
-- سياسةٌ تُضاف ولا تُبدَّل: سياساتُ الإدراج (من المتصفّح) والقراءة (للمدير)
-- كما هي.
create policy complaints_owner_read on public.complaints
  for select to authenticated
  using (
    exists (
      select 1 from public.stations s
       where s.id = complaints.station_id
         and s.owner_id = auth.uid()
    )
  );

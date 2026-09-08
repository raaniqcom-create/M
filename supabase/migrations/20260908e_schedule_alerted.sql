-- متى خرج إشعارُ هذا الجدول — وإن لم يخرج.
--
-- نُشر جدولُ ٢٠٢٦-٠٩-٠٨ ولم يخرج إشعارُه (بطءُ alerts_for، انظر 20260908d).
-- ولم يكن في القاعدة ما يقول ذلك: `notification_log` سجلُّ إرسالٍ لا سجلُّ
-- جداول، فلا يُعرف منه أيُّ جدولٍ بقي بلا خبر.
--
-- وبهذا العمود تصير شبكةُ الأمان ممكنة: مهمّةٌ صباحيّة تسأل «أيُّ جدولٍ لليوم
-- بلا إشعار؟» فتُرسله، وتصمت إن كان قد خرج مساءً — فلا يصل الناسَ مرّتان.
alter table public.fuel_schedule
  add column if not exists alerted_at timestamptz;

comment on column public.fuel_schedule.alerted_at is
  'لحظةُ خروج الإشعار عن هذا الصفّ. فارغٌ يعني أنّ الخبرَ نُشر ولم يُرسَل بعد.';

create index if not exists fuel_schedule_unalerted_idx
  on public.fuel_schedule (for_date)
  where alerted_at is null;

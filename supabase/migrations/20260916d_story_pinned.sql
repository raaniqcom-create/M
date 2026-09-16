-- حالةٌ مثبَّتة: تبقى أوّلَ الشريط يميناً مهما جدّ بعدها.
--
-- «ثبّت هذه الحالةَ الأولى على اليمين كي تستمرّ للمشاهدة» — صاحبُ المنصّة،
-- ١٦ أيلول، عن حالة «نصائح لنُنهي الأزمة معاً».
begin;
alter table public.platform_stories add column if not exists pinned boolean not null default false;
comment on column public.platform_stories.pinned is 'مثبَّتةٌ أوّلَ الشريط — قبل الترتيب بالزمن.';
commit;

-- تنبيهُ «التوزيع غداً لا اليوم» يظهر حلقةً صفراء بين الحالات.
--
-- «الإشعارُ الذي يرتبط بهذا الجدول يظهر على حالةٍ صفراء مع الحالات عندما
-- يتمّ نشرُه» — صاحبُ المنصّة، ١٥ أيلول.
--
-- الصفُّ يبقى بلا `station_name` عمداً: اللوحةُ الحمراء (`open_announcements`)
-- تقرأ كلَّ صفٍّ له اسمُ محطة على أنّه خبرُ **توفّر** يُصوَّت عليه — وهذا
-- خبرُ **غياب**. فالاسمُ في `subject`، والنوعُ في `kind`، وما عداهما من
-- الصفوف `kind` فيها فارغ ولا يتغيّر فيها شيء.
begin;

alter table public.announcements add column if not exists kind    text;
alter table public.announcements add column if not exists subject text;

comment on column public.announcements.kind is
  'null للخبر العاديّ؛ tomorrow لتنبيه «التوزيع غداً لا اليوم» — حلقةٌ صفراء في الحالات.';
comment on column public.announcements.subject is
  'اسمُ المحطة التي يخصّها التنبيه — لا station_name كي لا تدخل اللوحةَ الحمراء.';

create index if not exists announcements_kind_live
  on public.announcements (kind, sent_at desc)
  where kind is not null and active;

commit;

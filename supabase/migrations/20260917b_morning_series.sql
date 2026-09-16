-- سلسلةُ الصباح: وجهةُ النقر تُحفظ مع الصفّ.
--
-- طلبُ صاحب المنصّة ١٦ أيلول: بعد نشر الجدول، إشعارٌ لكلّ مدينةٍ ووقودٍ باسم
-- أنشط محطةٍ مسجّلة (أو الأكثر منتجاتٍ حيث لا مسجّلة)، بفارق دقيقتين من السابعة
-- صباحاً. الصفوفُ تُدرج في `announcements` بـ`send_at` متدرّج و`kind='schedule'`،
-- وتكنسها `notify-favorites` كلَّ دقيقتين كما تكنس أيَّ خبرٍ مؤجَّل.
--
-- والمِكنسةُ كانت تشتقّ وجهةَ النقر من `linked_station_id` وحدَه: محطةٌ مسجّلة →
-- صفحتُها، وإلّا الرئيسيّة. وصفُّ السلسلة لمحطةٍ غيرِ مسجّلة يفتح صفحةَ «مكان»
-- (/place/?n=…&c=…) — فعمودٌ اختياريّ: null يُبقي الاشتقاقَ القديمَ لكلّ ما سبق.
begin;

alter table public.announcements add column if not exists url text;
comment on column public.announcements.url is
  'وجهةُ النقر داخل التطبيق (تبدأ بـ/). null = /station/<linked_station_id> أو الرئيسيّة.';
comment on column public.announcements.kind is
  'null للخبر العاديّ؛ tomorrow لتنبيه «التوزيع غداً» (حلقةٌ صفراء)؛ schedule لإشعار سلسلة الصباح (لا حالةَ ولا لوحةَ حمراء ولا /news).';

do $$
begin
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'announcements' and column_name = 'url') = 1,
    'announcements.url غائب';
end $$;

commit;

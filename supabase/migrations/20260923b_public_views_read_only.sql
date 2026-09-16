-- المنظوراتُ العامّةُ قراءةٌ فقط: stations_public كان يقبل تعديلاً وحذفاً من anon.
--
-- ── ما وُجد (17 أيلول، أثناء مراجعة «غسيل» v3) ──────────────────────────
-- Supabase تمنح anon وauthenticated كلَّ الصلاحيّات على كلّ جدولٍ ومنظورٍ جديدٍ في public
-- (default privileges). وstations_public منظورٌ من جدولٍ واحد فهو «قابلٌ للتحديث تلقائيّاً»،
-- وsecurity_invoker = false منذ 20260819d فيعمل بصلاحيّة مالكه متجاوزاً RLS، وstations_guard
-- يعدّ auth.uid() الفارغَ إدارةً. قِيس بمفتاح anon: PATCH /rest/v1/stations_public → 204،
-- أي إنّ أيّ زائرٍ كان يستطيع تغييرَ اسم أيّ محطةٍ معتمدة أو موقعَها أو حالتَها أو حذفَها.
-- لا أثرَ لاستغلاله في الصفوف الحاليّة، لكنّ البابَ كان مفتوحاً.
--
-- ── العلاج ────────────────────────────────────────────────────────────────
-- سحبُ كلّ شيءٍ عدا القراءة من المنظورات العامّة كلِّها — لا مسارَ في المنصّة يكتب عبر منظور.
-- (منظوراتُ «غسيل» تُسحب في 20260923_wash_v3.sql أيضاً؛ التكرارُ هنا آمن.)
-- التراجع: لا يُتراجَع — الصلاحيّةُ لم تكن مقصودةً قطّ.
begin;

do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'public' loop
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v.viewname);
  end loop;
end $$;

do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'public' loop
    assert not has_table_privilege('anon', format('public.%I', v.viewname), 'insert, update, delete'),
      format('anon يكتب عبر %s', v.viewname);
    assert not has_table_privilege('authenticated', format('public.%I', v.viewname), 'insert, update, delete'),
      format('authenticated يكتب عبر %s', v.viewname);
  end loop;
  -- القراءةُ العامّةُ لم تُمسّ.
  assert has_table_privilege('anon', 'public.stations_public', 'select'), 'stations_public فقد القراءة';
end $$;

commit;

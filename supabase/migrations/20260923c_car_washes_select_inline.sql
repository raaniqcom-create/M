-- قراءةُ car_washes: المالكُ يُقاس بعمودِ الصفّ لا بدالّةٍ تُعيد الاستعلام — كي ينجح insert…returning.
--
-- ── العطل (17 أيلول) ──────────────────────────────────────────────────────
-- سياسةُ SELECT كانت `manages_wash(id)`، وهي دالّةٌ STABLE security definer تنفّذ
-- `select 1 from car_washes where id = p_wash and owner_id = p_user`. وفي جملةِ
-- `insert … returning *` (يستدعيها العميلُ بـ.select())، تعمل الدالّةُ على لقطةِ
-- الجملة التي بدأت **قبل** وجود الصفّ، فلا تراه فتردّ false، فيُرفض إرجاعُ الصفّ
-- بـ42501 وتُلغى الجملةُ كلُّها — فلا يُحفظ التسجيل. لهذا لم تُنشأ أيُّ مغسلةٍ
-- لمالكٍ حقيقيّ قطّ (التجريبيّةُ أنشأتها الإدارةُ بمفتاح الخدمة فتجاوزت RLS).
-- والمحطاتُ لم تُصب لأنّ سياستَها inline `owner_id = auth.uid()`، ولأنّها تُنشأ من الإدارة.
--
-- ── العلاج ────────────────────────────────────────────────────────────────
-- المالكُ يُقاس بـ`owner_id = auth.uid()` مباشرةً على الصفّ (يراه الإرجاعُ فوراً)،
-- والإدارةُ والموظّفُ عبر مسندَين لا يمسّان car_washes (profiles وwash_managers).
-- الكتابةُ الحسّاسة تبقى كما هي (owns_wash/manages_wash) — هذا يخصّ القراءةَ فقط.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- سياسةٌ واحدةٌ على car_washes. لا مساسَ بأيّ جدولِ وقود. التراجع:
--   إعادةُ السياسة إلى using (manages_wash(id)).
begin;

drop policy if exists "car_washes: owner and admin read" on public.car_washes;
create policy "car_washes: owner and admin read" on public.car_washes for select using (
  owner_id = auth.uid()
  or wash_is_admin()
  or exists (select 1 from wash_managers m where m.wash_id = id and m.user_id = auth.uid() and m.active)
);

do $$
begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'car_washes'
           and policyname = 'car_washes: owner and admin read') = 1, 'سياسةُ القراءة غائبة';
  -- wash_is_admin موجودةٌ من 20260923 (تسبقُ هذه أبجديّاً فتُطبَّق قبلها).
  assert (select count(*) from pg_proc where proname = 'wash_is_admin') = 1, 'wash_is_admin غائبة';
end $$;

commit;

-- لوحةُ الفرع — ومعها سدُّ ثلاثِ دوالٍّ كانت تُجيب مفتاحَ anon.
--
-- ── ما وُجد بالقياس ─────────────────────────────────────────────────────
--
-- قبل تصميم دخولِ موظّفي فرع التوزيع، نُوديت دوالُّ القراءة كلُّها بمفتاح
-- `anon` — وهو مفتاحٌ عامٌّ منشورٌ في حزمة الموقع يملكه كلُّ من يفتح التطبيق.
-- فأجابت ثلاثٌ ببياناتٍ حقيقية:
--
--   notification_history   تسعون يوماً من أعداد المُرسَل والمستقبِلين
--                          (4,104 إشعاراً إلى 3,709 أشخاص في 2026-09-05)
--   watchers_by_city       5,780 مشتركاً في الرمادي
--   health_counts          {stations: 38, subscribers: 9,831, devices: 10,890}
--
-- وهذا يناقض سياسةَ المنصّة المكتوبة بيدها: `admin_stats` محروسةٌ بالدور
-- (schema.sql:263) لأن أعدادَ المشتركين ليست عامّة — ثمّ تخرج الأعدادُ نفسُها
-- من بابٍ آخر بلا حارس. وليس فيها بياناتٌ شخصية ولا رموزُ أجهزة؛ هي أرقامُ
-- تشغيلٍ وتجارة. لكنها ما اختارت المنصّةُ حجبَه.
--
-- ── وثلاثٌ ظُنّت مسرِّبةً وليست كذلك ────────────────────────────────────
--
-- `admin_announcements` و`pending_announcements` أجابتا `200 []` — وذلك
-- **حارسُهما يعمل**: كلتاهما ترشّح الصفوف داخل الاستعلام بـ
-- `(select p.role from profiles p where p.id = auth.uid()) = 'admin'`
-- (20260823c:76 و20260822:33)، فتُرجعان فراغاً لغير المدير لا خطأً. تُركتا.
-- و`get_unregistered_close` تُرجع «21:00» — إعدادُ عرضٍ لا سرّ، لكنها تُنزَع
-- عن anon مع الباقي إذ لا حاجة بأحدٍ إليها قبل الدخول.
--
-- ── ولا يُلمس جسمُ دالّةٍ واحدة ─────────────────────────────────────────
--
-- الثلاثُ المسرِّبةُ لا يناديها من الشيفرة إلا مفتاحُ الخدمة:
--   watchers_by_city   <- supabase/functions/owner-daily/index.ts:303, :473
--   health_counts      <- supabase/functions/health/index.ts
--   notification_history <- لا مُنادِيَ لها في المستودع كلِّه
--
-- فالإصلاحُ نزعُ صلاحيةٍ لا إعادةُ كتابة. وذلك مقصود: القاعدةُ الحيّة تنحرف
-- عن هجراتها — `20260821_daily_rollup.sql:98` يكتب
-- `revoke all ... from public` لـnotification_history، وهي حيّةً تُجيب anon.
-- فإعادةُ كتابة جسمٍ من ملفٍّ قد تُرجع سلوكاً صُحّح في اللوحة ولم يُكتب هنا.
-- والنزعُ لا يحمل هذا الخطر.

revoke all on function public.notification_history(int)  from public, anon, authenticated;
revoke all on function public.watchers_by_city(text[])   from public, anon, authenticated;
revoke all on function public.health_counts()            from public, anon, authenticated;
revoke all on function public.get_unregistered_close()   from public, anon;

grant execute on function public.notification_history(int) to service_role;
grant execute on function public.watchers_by_city(text[])  to service_role;
grant execute on function public.health_counts()           to service_role;
-- ولوحةُ الإدارة تقرؤها من المتصفّح (UnregisteredAdmin.tsx)، فتبقى للمسجَّلين
grant execute on function public.get_unregistered_close()  to authenticated, service_role;


-- ── مُشاهِدُ الفرع ───────────────────────────────────────────────────────
--
-- **جدولٌ لا قيمةُ enum.** `profiles.role` نوعٌ مُعدَّد بقيمتين (schema.sql:19)،
-- وإضافةُ ثالثةٍ لا رجعةَ فيها في Postgres، وتحتاج هجرةً خارج أيّ معاملة،
-- وتكسر `lib/useSession.ts:52-56` التي تصنّف كلَّ ما ليس admin مالكاً —
-- فيُرسَل موظّفُ الفرع إلى /owner فيجده بلا محطة.
--
-- والجدولُ إضافيّ، ورجوعُه حذفُ صفّ.

create table if not exists public.branch_viewers (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  -- «عبيد مخلف — مدير فرع الأنبار». يُكتب ليُعرف من دخل حين تُراجَع القائمة
  -- بعد شهر — ومعرّفُ مستخدمٍ وحدَه لا يقول شيئاً.
  name     text not null,
  added_at timestamptz not null default now(),
  added_by uuid
);

alter table public.branch_viewers enable row level security;
revoke all on public.branch_viewers from anon, authenticated;

comment on table public.branch_viewers is
  'موظّفو فرع توزيع المنتجات النفطية المصرَّح لهم بلوحة المتابعة. مشاهدةٌ فقط، والسحبُ حذفُ صفّ.';


-- والسؤالُ عن السائل نفسِه لا عن غيره: الدالّة لا تأخذ معرّفاً، فلا يستطيع
-- أحدٌ أن يسأل بها عن ثالث. والمديرُ داخلٌ بلا صفٍّ فيها ليعاين اللوحة.
create or replace function public.is_branch_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from branch_viewers b where b.user_id = auth.uid())
      or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

revoke all on function public.is_branch_viewer() from public, anon;
grant execute on function public.is_branch_viewer() to authenticated;


-- ── الاسمُ المحجوز ───────────────────────────────────────────────────────
--
-- المسارُ الساكن يُحلّ قبل `/[slug]`، فمحطةٌ تحمل «branch» تملك رابطاً لا
-- يُفتح أبداً. والقائمةُ في stations_guard كانت تنقصها خمسةُ مساراتٍ قائمة —
-- about, news, road, sounds — وليست branch وحدَها. فُحصت القاعدةُ قبل هذا:
-- لا محطةَ تحمل واحداً منها اليوم.
--
-- `create or replace` لا `drop`: المُشغّل stations_guard_trg يعتمدها، فـ
-- `drop ... cascade` يمحوه صامتاً — وتمضي التسجيلاتُ بعدها بلا slug وبلا
-- status := 'pending'. والجسمُ منقولٌ كما هو من supabase/schema.sql:317.
CREATE OR REPLACE FUNCTION public.stations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  candidate text;
  n int := 0;
begin
  -- Every insert passes here, whoever makes it, so this is the one place a
  -- missing slug can be caught for good.
  if new.slug is null or btrim(new.slug) = '' then
    candidate := station_slug(new.name, new.id);
    -- these static routes resolve before the /[slug] catch-all, so a station
    -- claiming one would own a link that never opens
    while candidate in ('login','register','owner','admin','station','offline','api',
                        'icons','ads','alerts','download','privacy','subscribe',
                        'reset','test-push','about','news','road','branch','sounds',
                        'manifest.json','sw.js')
          or exists (select 1 from stations s where s.slug = candidate and s.id <> new.id)
    loop
      n := n + 1;
      candidate := station_slug(new.name, new.id) || '-' || n::text;
    end loop;
    new.slug := candidate;
  end if;

  -- service-role callers (edge functions) and admins are trusted
  if auth.uid() is null
     or exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
  else
    new.status := old.status;
    new.owner_id := old.owner_id;
  end if;
  return new;
end $function$;

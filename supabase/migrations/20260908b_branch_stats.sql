-- إحصائيّاتُ الفرع — أعدادٌ بلا أشخاص. ومعها مدّةٌ لأرشيف المحطات المحذوفة.


-- ── ١ ـ branch_stats() ──────────────────────────────────────────────────
--
-- موظّفُ الفرع طلب «الاطّلاع على الإحصائيّات». وقِيس أنّ كلَّ رقمٍ في لوحة
-- الإدارة محجوبٌ عنه **على الخادم** لا في الواجهة: `admin_stats` ترمي 42501
-- لغير المدير، و`health_counts` و`watchers_by_city` نُزعتا عن authenticated
-- في 20260906. فلا شيءَ يُعرض له بلا دالّةٍ جديدة.
--
-- ولا يُعاد استعمالُ `admin_stats`: هي تطبع أرقامَ هواتف الملّاك وأسماءهم
-- ومعها زرُّ واتساب. وهذه اللوحةُ حسابٌ **مشترَك** يدخله أكثرُ من موظّف
-- (scripts/add-branch-viewer.mjs:11-14) — فما يُعرض فيها يُعرض للفرع كلِّه.
-- فأعدادٌ فقط: كم محطةً، وكم مشتركاً، وكم إشعاراً. ولا عنوانَ دفعٍ ولا رقمَ
-- هاتفٍ ولا اسمَ صاحبِ محطةٍ يخرج من هنا.
--
-- **والمشتركُ يُعدّ بعنوانٍ مميَّزٍ لا بصفّ.** جدولُ alerts فيه اليومَ ٦٥٬٦٣٤
-- صفّاً و١٢٬٠٥٩ عنواناً: من اختار ثلاثَ مدنٍ وأربعةَ منتجاتٍ له اثنا عشر
-- صفّاً وهو شخصٌ واحد. وعدُّ الصفوف كان سيُبلغ الفرعَ عن جمهورٍ خمسةَ أضعافِ
-- حقيقته.

create or replace function public.branch_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  -- الحارسُ يرمي ولا يُرجع فراغاً: صفرٌ صامتٌ يُقرأ «لا مشتركين» لا «ممنوع».
  if not is_branch_viewer() then
    raise exception 'هذه الأرقام لموظّفي فرع التوزيع وإدارة المنصّة'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- لحظةُ القراءة تُرافق الأرقام. ورقةٌ بلا تاريخٍ تُقرأ بعد شهرٍ كأنها اليوم.
    'as_of', now(),

    'stations', jsonb_build_object(
      'approved', (select count(*) from stations where status = 'approved'),
      'pending',  (select count(*) from stations where status = 'pending')
    ),

    'subscribers', (select count(distinct address) from alerts),

    'devices', jsonb_build_object(
      'ios',     (select count(*) from device_tokens where platform = 'ios'),
      'android', (select count(*) from device_tokens where platform = 'android'),
      'web',     (select count(distinct address) from alerts where channel = 'web')
    ),

    -- ومدينةً مدينة. والقائمةُ من المدن التي فيها محطةٌ معتمدةٌ **أو** مشترك:
    -- مدينةٌ بلا محطةٍ وفيها ثلاثمئة منتظرٍ خبرٌ للفرع لا فراغ.
    'cities', (
      select coalesce(jsonb_agg(t order by t->>'city'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'city', c.city,
          'stations', (
            select count(*) from stations s
             where s.status = 'approved' and s.city = c.city
          ),
          -- ومن اختار «كلَّ المدن» يُحتسب لكلّ مدينة — هو ينتظر خبرَ الأنبار
          -- كلِّها. وهو حكمُ watchers_by_city نفسُه، بلا تبديل.
          'subscribers', (
            select count(distinct a.address) from alerts a
             where a.station_id is null and (a.city is null or a.city = c.city)
          )
        ) as t
        from (
          select city from stations where status = 'approved' and city is not null
          union
          select city from alerts where city is not null
        ) c
      ) q
    ),

    -- ثلاثون يوماً: هي مدّةُ الاحتفاظ بسجلّ الإشعارات نفسِها، فالرقمُ يصف
    -- كلَّ ما في السجلّ لا شريحةً منه.
    'notifications_30d', (
      select count(*) from notification_log
       where sent_at > now() - interval '30 days'
    )
  ) into v;

  return v;
end $$;

revoke all on function public.branch_stats() from public, anon;
grant execute on function public.branch_stats() to authenticated;

comment on function public.branch_stats() is
  'أعدادٌ مجمَّعةٌ لموظّفي فرع التوزيع. بلا هواتفَ ولا أسماءِ ملّاكٍ ولا عناوينِ دفع.';


-- ── ٢ ـ ومدّةٌ لأرشيف المحطات ───────────────────────────────────────────
--
-- صفحةُ الخصوصيّة تقول إنّ الحذف «فوريٌّ ونهائيّ». وهي غيرُ صحيحة:
-- `station_archive` (20260829b) يحتفظ بنسخةٍ كاملةٍ من صفّ المحطة في jsonb —
-- **بالهاتف واسم المسؤول** — بلا أيّ انتهاء. فإمّا أن تُصحَّح السياسة، وإمّا
-- أن يُعطى الأرشيفُ مدّةً تنتهي عندها. والثاني أصحّ: للاسترجاع سببٌ حقيقيّ
-- (حُذفت محطةٌ بالخطأ فأُعيدت)، ولا سببَ لبقاء الهاتف سنة.
--
-- ثلاثون يوماً — مدّةُ الاحتفاظ نفسُها في notification_log، فلا مدّتان في
-- منصّةٍ واحدةٍ يُشرح فرقُهما في وثيقةٍ رسميّة.

select cron.unschedule('purge-station-archive')
 where exists (select 1 from cron.job where jobname = 'purge-station-archive');

select cron.schedule(
  'purge-station-archive',
  -- بعد لملمةِ الإشعارات بعشر دقائق (rollup-notifications عند 20:30 UTC):
  -- مهمّتان في اللحظة نفسِها تتنازعان الاتصالات بلا داعٍ.
  '40 20 * * *',
  $$delete from station_archive where deleted_at < now() - interval '30 days'$$
);

-- طلبان من صاحب المنصّة، ١١ أيلول ٢٠٢٦، من لوحة المالك الجديدة:
--
-- ١ · «حالة الازدحام … يمكن أن يختار الحالة بعدد المنتجات»: طابورُ الكاز غيرُ
--     طابور البانزين في المحطة نفسِها. فلكلّ منتجٍ ازدحامُه، اختياريّاً، فوق
--     ازدحام المحطة القائم — ويسقط بعد ثلاثين دقيقة أو عند الإغلاق كما يسقط
--     ازدحامُ المحطة (`clear_stale_traffic`، كرون الخمس دقائق القائم).
--
-- ٢ · «اختار موعد ٣ ساعات وينفد المنتج تلقائياً — يُسحب منه بعد مرور الوقت»:
--     كان النفادُ يُحترم عند القراءة وحدَها (`isListed`، `station_products_live`،
--     البوتات)، والصفُّ يبقى `is_available = true` — فلوحةُ المالك تقول «متوفر»
--     عن منتجٍ قال صاحبُه إنّه نفد قبل ساعتين. فيُطفأ في القاعدة نفسِها.
begin;

-- ── ١ · ازدحامُ المنتج ───────────────────────────────────────────────────
alter table public.station_products
  add column if not exists traffic_level  public.traffic_level,
  add column if not exists traffic_set_at timestamptz;

comment on column public.station_products.traffic_level is
  'ازدحامُ طابور هذا المنتج بعينه، من صاحب المحطة. اختياريٌّ فوق stations.manual_traffic_level، ويسقط بعد ٣٠ دقيقة.';

-- التوقيعُ نفسُه (بلا معاملات) فـ`create or replace` يحلّ محلَّها ولا يُنشئ
-- نسخةً ثانية. وتُعيد ما مُسح من الاثنين معاً.
create or replace function public.clear_stale_traffic()
returns integer
language sql
security definer
set search_path = public
as $$
  with cleared as (
    update stations
       set manual_traffic_level = null, manual_traffic_set_at = null
     where manual_traffic_level is not null
       and (not station_open_now(stations)
            or manual_traffic_set_at < now() - interval '30 minutes')
    returning 1
  ),
  cleared_products as (
    update station_products sp
       set traffic_level = null, traffic_set_at = null
      from stations st
     where st.id = sp.station_id
       and sp.traffic_level is not null
       and (not station_open_now(st)
            or sp.traffic_set_at < now() - interval '30 minutes'
            -- ومنتجٌ لم يعد متوفّراً لا طابورَ له
            or not sp.is_available)
    returning 1
  )
  select (select count(*) from cleared)::int + (select count(*) from cleared_products)::int;
$$;

revoke all on function public.clear_stale_traffic() from public, anon, authenticated;

-- ── ٢ · النفادُ يقع في القاعدة ────────────────────────────────────────────
--
-- `runs_out_at` يبقى على قيمته: هو لحظةُ النفاد التي تقرؤها لوحةُ الجدول
-- («نفد» في lib/board.ts) وتُبقي «حتى X» صادقةً في السجلّ. و`updated_at` لا
-- يُمسّ: هو آخرُ لمسةٍ من صاحب المحطة، والنفادُ كلمتُه هو تحقّقت لا لمسةٌ جديدة.
create or replace function public.expire_run_outs()
returns integer
language sql
security definer
set search_path = public
as $$
  with done as (
    update station_products
       set is_available = false,
           traffic_level = null,
           traffic_set_at = null
     where is_available
       and runs_out_at is not null
       and runs_out_at <= now()
    returning 1
  )
  select count(*)::int from done;
$$;

revoke all on function public.expire_run_outs() from public, anon, authenticated;

-- يُحذف بالاسم أوّلاً ثمّ يُنشأ — الشكلُ الوحيدُ القابلُ للإعادة (انظر
-- 20260821b_cron_of_record.sql).
select cron.unschedule(jobid) from cron.job where jobname = 'expire-run-outs';
select cron.schedule('expire-run-outs', '*/5 * * * *', $$select public.expire_run_outs()$$);

commit;

-- الإحصائيات تُحفظ، والصفوف تُحذف.
--
-- المنصّة تكتب صفّاً لكل إشعار يصل إنساناً: ٤٢١٩ صفّاً أمس. والقاعدة اليوم ٢٦
-- ميجابايت، والحدّ المجّاني ٥٠٠، والنموّ ٣.٤ ميجابايت يومياً — أي نحو ١٤٠ يوماً
-- حتى تصير القاعدة للقراءة فقط: لا تسجيل محطة، ولا تحديث وقود، ولا اشتراك جديد.
--
-- والشرط المطلوب أن التنظيف لا يفقد رقماً، لأن قسم الإعلانات سيقوم على أعداد
-- المشتركين والمشاهدات. فلا يُحذف صفٌّ قبل أن يُلخَّص يومه: كم أُرسل، إلى كم
-- شخصاً، بأي نوع، من أي محطة. والملخّص صفٌّ واحد لليوم بدل أربعة آلاف — أي أن
-- تاريخ سنة كاملة يزن أقلّ من ميجابايت، ويبقى إلى الأبد.
--
-- ولا شيء في المنصّة يقرأ أقدم من خمسين صفّاً (notifications_for فيها limit 50)،
-- فالتفصيل بعد ثلاثين يوماً لا قارئ له أصلاً.
begin;

-- ما يبقى إلى الأبد: يومٌ في صفّ.
create table if not exists notification_daily (
  day          date    not null,
  kind         text    not null,
  station_id   uuid,
  sent         integer not null,
  people       integer not null
);

-- فهرس فريد على التعبير لا مفتاح أساسي: المفتاح لا يقبل coalesce، وstation_id
-- تكون null للإعلانات العامة — وnull لا تساوي null في القيود، فبلا التعبير
-- تتكرّر صفوف الإعلانات بلا حدّ.
create unique index if not exists notification_daily_key
  on notification_daily (day, kind, coalesce(station_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table notification_daily enable row level security;
-- لا سياسة: الجدول للإدارة عبر دوالّ security definer وحدها، كبقية الجداول
-- الداخلية. وليس فيه عنوان دفعٍ واحد — أرقامٌ مجمّعة فقط.

comment on table notification_daily is
  'ملخّص يومي دائم لسجلّ الإشعارات. يُكتب قبل الحذف فلا تُفقد إحصائية.';

-- التلخيص ثم الحذف، في معاملة واحدة.
--
-- والترتيب ملزِم: لو حُذف قبل أن يُلخَّص لضاع اليوم كلّه. وon conflict يجعل
-- تشغيلها مرتين بلا ضرر — تُعيد كتابة الملخّص بالقيم نفسها.
create or replace function public.rollup_notifications(p_keep_days int default 30)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  cutoff timestamptz := now() - make_interval(days => p_keep_days);
  summarised int;
  removed    int;
begin
  insert into notification_daily (day, kind, station_id, sent, people)
  select (n.sent_at at time zone 'Asia/Baghdad')::date,
         n.kind,
         n.station_id,
         count(*)::int,
         count(distinct n.address)::int
    from notification_log n
   where n.sent_at < cutoff
   group by 1, 2, 3
  on conflict (day, kind, coalesce(station_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set sent = excluded.sent, people = excluded.people;

  get diagnostics summarised = row_count;

  delete from notification_log where sent_at < cutoff;
  get diagnostics removed = row_count;

  return json_build_object('summarised_days', summarised, 'rows_removed', removed, 'cutoff', cutoff);
end
$fn$;

revoke all on function public.rollup_notifications(int) from public;
grant execute on function public.rollup_notifications(int) to service_role;

-- وقراءةٌ للإدارة تجمع المحفوظ والحيّ في سلسلة واحدة، فلا ينقطع الرسم البياني
-- عند حدّ الثلاثين يوماً.
create or replace function public.notification_history(p_days int default 90)
returns table(day date, kind text, sent int, people int)
language sql
security definer
set search_path = public
as $$
  select d.day, d.kind, sum(d.sent)::int, sum(d.people)::int
    from notification_daily d
   where d.day >= (current_date - p_days)
   group by d.day, d.kind
  union all
  select (n.sent_at at time zone 'Asia/Baghdad')::date, n.kind,
         count(*)::int, count(distinct n.address)::int
    from notification_log n
   where n.sent_at >= (current_date - p_days)
   group by 1, 2
  order by 1 desc, 2;
$$;

revoke all on function public.notification_history(int) from public;
grant execute on function public.notification_history(int) to authenticated, service_role;

commit;

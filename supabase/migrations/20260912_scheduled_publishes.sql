-- جدولةُ نشرِ الجدول: «لديّ جدولُ الغد جاهزاً الآن، انشره الساعةَ السادسة».
--
-- طلبُ صاحب المنصّة ١٢ أيلول ٢٠٢٦: زرُّ «جدولة» في البوت — يختار تاريخَ
-- التجهيز (ليظهر غداً) ووقتَ النشر (خلال اليوم)، وعند الموعد يُنشر الجدولُ
-- ويُستبدل القديمُ ويخرج الإشعار.
--
-- الصفُّ يحمل المسوّدةَ كاملةً (`sched` كما في telegram_drafts) فلا تعتمد
-- الجدولةُ على بقاء المسوّدة. والتنفيذُ في دالّة telegram نفسِها
-- (`?run=scheduled`) لأنّ النشرَ والإشعارَ ورسائلَ المدير كلَّها هناك.
begin;

create table if not exists public.scheduled_publishes (
  id          uuid primary key default gen_random_uuid(),
  for_date    date not null,
  publish_at  timestamptz not null,
  notify      boolean not null default true,
  replace     boolean not null default true,
  sched       jsonb not null,
  chat_id     bigint not null,
  telegram_id bigint not null,
  status      text not null default 'pending'
              check (status in ('pending', 'done', 'failed', 'cancelled')),
  error       text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);

comment on table public.scheduled_publishes is
  'جدولٌ ينتظر ساعتَه: يُنشر من دالّة telegram (?run=scheduled) بكرون الدقيقة.';

-- دورُ الخدمة وحدَه: لا سياسةَ للمتصفّح ولا للمجهول.
alter table public.scheduled_publishes enable row level security;

create index if not exists scheduled_publishes_due
  on public.scheduled_publishes (publish_at)
  where status = 'pending';

-- ── الكرون: كلَّ دقيقة، بالنداء نفسِه الذي يحمله «notify-favorites» ─────────
--
-- نصُّ النداء (العنوانُ ورأسُ x-cron-secret) محفوظٌ في cron.job على الخادم
-- ولا يُكتب هنا — فيُنسخ منه ويُبدَّل المسارُ وحدَه. وإن لم يوجد لا يُنشأ
-- شيءٌ ويُقال.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'notify-favorites' limit 1;
  if cmd is null then
    raise notice 'publish-scheduled: لم يُعثر على notify-favorites لنسخ ندائه — أنشئه بيدك';
    return;
  end if;
  cmd := replace(cmd, '/functions/v1/notify-favorites', '/functions/v1/telegram?run=scheduled');
  perform cron.unschedule(jobid) from cron.job where jobname = 'publish-scheduled';
  perform cron.schedule('publish-scheduled', '* * * * *', cmd);
end $$;

commit;

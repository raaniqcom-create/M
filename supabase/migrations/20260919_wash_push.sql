-- «غسيل» M4: الإشعارات — جهازُ صاحب المغسلة على صفّها، وكرونُ wash-tick.
--
-- الوثيقة §69–70, 45, 77: حجزٌ جديد وإلغاءٌ للمالك؛ تأكيدٌ وبدءٌ وإتمامٌ وتذكيرٌ
-- للزبون؛ تنبيهُ انتهاء الاشتراك؛ والفشلُ لا يمسّ الحجز (الصندوقُ wash_events).
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جهازُ المالك يُحفظ على car_washes لا على device_tokens: لا كتابةَ في جدول وقود.
-- كرونٌ واحدٌ كلَّ عشر دقائق بنسخ أمر notify-favorites. التراجع:
--   select cron.unschedule('wash-tick'); drop function claim_wash_device(text,text,jsonb);
--   alter table car_washes drop column owner_device, drop column owner_platform, drop column owner_keys;
begin;

alter table public.car_washes
  add column if not exists owner_device   text,
  add column if not exists owner_platform text check (owner_platform is null or owner_platform in ('ios','android','web')),
  add column if not exists owner_keys     jsonb;
comment on column public.car_washes.owner_device is 'جهازُ صاحب المغسلة (رمزُ FCM/APNs أو نقطةُ webpush) — يصله «حجزٌ جديد».';

/** يربط جهازَ المستخدم الحاليّ بمغسلته. الرمزُ سرٌّ لا يعرفه إلّا الجهاز، فتقديمُه إثباتُ ملكيّته. */
create or replace function public.claim_wash_device(p_token text, p_platform text, p_keys jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_platform not in ('ios','android','web') then raise exception 'bad platform' using errcode = '22023'; end if;
  if length(coalesce(p_token, '')) not between 20 and 512 then raise exception 'bad token' using errcode = '22023'; end if;
  update car_washes set owner_device = p_token, owner_platform = p_platform, owner_keys = case when p_platform = 'web' then p_keys else null end
   where owner_id = auth.uid();
  if not found then raise exception 'no wash' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.claim_wash_device(text, text, jsonb) from public;
grant execute on function public.claim_wash_device(text, text, jsonb) to authenticated;

-- ── الكرون: نسخُ نداء notify-favorites بمساره الجديد ─────────────────────
do $$
declare cmd text;
begin
  select command into cmd from cron.job where jobname = 'notify-favorites' limit 1;
  if cmd is null then
    raise notice 'wash-tick: لم يُعثر على notify-favorites لنسخ ندائه — أنشئه بيدك';
    return;
  end if;
  cmd := replace(cmd, '/functions/v1/notify-favorites', '/functions/v1/wash-tick');
  perform cron.unschedule(jobid) from cron.job where jobname = 'wash-tick';
  perform cron.schedule('wash-tick', '*/10 * * * *', cmd);
end $$;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'claim_wash_device') = 1, 'claim_wash_device غائبة';
  assert (select count(*) from cron.job where jobname = 'wash-tick') <= 1, 'wash-tick مكرّر';
  assert (select count(*) from cron.job where jobname like 'wash%') <= 1, 'أكثرُ من كرونٍ للمغاسل';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
end $$;

commit;

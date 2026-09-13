-- إشعارُ «فعّل الدخول بالوجه» لكلّ أصحاب المحطات — مرّةً، التاسعةَ صباحاً ببغداد.
--
-- «أرسل لهم طلبَ التفعيل ببصمة الوجه الآن» — ١٤ أيلول ٢٠٢٦. النداءُ بالكرون
-- المنسوخ من notify-favorites (يحمل السرَّ) إلى owner-daily?notice=face-login،
-- والدالّةُ تختم كلَّ محطةٍ في owner_pings فلا يتكرّر في اليوم. والموعدُ تاريخٌ
-- بعينه؛ يُلغى الجدولُ في ترحيلٍ لاحق (pg_cron لا يعرف السنة).
begin;

do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'notify-favorites' limit 1;
  if cmd is null then
    raise notice 'face-login-notice: لم يُعثر على notify-favorites لنسخ ندائه';
    return;
  end if;
  cmd := replace(cmd, '/functions/v1/notify-favorites', '/functions/v1/owner-daily?notice=face-login');
  perform cron.unschedule(jobid) from cron.job where jobname = 'face-login-notice';
  -- 06:00 UTC = 09:00 بغداد، ١٤ أيلول
  perform cron.schedule('face-login-notice', '0 6 14 9 *', cmd);
end $$;

commit;

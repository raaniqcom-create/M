-- «غسيل» M8: لوحةُ المالك (KPIs) وتقاريرُ الإدارة وصحّةُ القسم (§28–30, 80).
--
-- استعلامٌ واحدٌ على wash_bookings المفهرس بالفترة، والعدّاداتُ والتقييماتُ والاشتراكُ
-- وحدودُه — يقرؤه صاحبُ المغسلة (manages_wash). وإحصاءاتُ الإدارة تُضاف إليها الإيراداتُ
-- وصحّةُ الصندوق والنبض، فتحمرّ الكتلةُ في اللوحة حين يتعطّل شيء.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- دالّتان فقط. التراجع: drop function wash_dashboard(uuid,date,date); وإعادةُ wash_admin_stats من 20260917.
begin;

create or replace function public.wash_dashboard(p_wash uuid, p_from date, p_to date)
returns json language plpgsql stable security definer set search_path = public as $$
declare w car_washes; f jsonb; lo timestamptz; hi timestamptz; month_start timestamptz; today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  if not manages_wash(p_wash) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into w from car_washes x where x.id = p_wash;
  f := wash_features(w);
  lo := (p_from::timestamp) at time zone 'Asia/Baghdad';
  hi := ((p_to + 1)::timestamp) at time zone 'Asia/Baghdad';
  month_start := date_trunc('month', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad';
  return (
    with b as (select * from wash_bookings x where x.wash_id = p_wash and x.starts_at >= lo and x.starts_at < hi)
    select json_build_object(
      'created',   (select count(*) from b),
      'completed', (select count(*) from b where status = 'completed'),
      'cancelled', (select count(*) from b where status in ('cancelled','cancelled_by_business')),
      'no_show',   (select count(*) from b where status = 'no_show'),
      'expired',   (select count(*) from b where status = 'expired'),
      'walk_in',   (select count(*) from b where walk_in),
      'revenue',   (select coalesce(sum(price), 0) from b where status = 'completed'),
      'avg_value', (select coalesce(round(avg(price)), 0) from b where status = 'completed' and price > 0),
      'repeat_customers', (select count(*) from (select phone from b where status = 'completed' and phone is not null group by phone having count(*) >= 2) r),
      'rating_avg', case when w.rating_n > 0 then round(w.rating_sum::numeric / w.rating_n, 1) end,
      'rating_n', w.rating_n,
      'views',  coalesce((select v.views from wash_views v where v.wash_id = p_wash), 0),
      'calls',  coalesce((select v.calls from wash_views v where v.wash_id = p_wash), 0),
      'routes', coalesce((select v.routes from wash_views v where v.wash_id = p_wash), 0),
      'subscription', json_build_object(
        'plan', w.plan, 'paid_until', w.paid_until,
        'days_left', case when w.paid_until is null then null else w.paid_until - today end,
        'used_bookings', (select count(*) from wash_bookings x where x.wash_id = p_wash and x.created_at >= month_start
                             and x.status not in ('cancelled','cancelled_by_business','expired')),
        'limit', coalesce((f->>'booking_monthly_limit')::int, 0)
      )
    )
  );
end $$;
revoke all on function public.wash_dashboard(uuid, date, date) from public;
grant execute on function public.wash_dashboard(uuid, date, date) to authenticated;

create or replace function public.wash_admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Baghdad')::date; tick text;
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  tick := (select value from app_config where key = 'wash_tick_last');
  return json_build_object(
    'live',     (select count(*) from car_washes w where wash_published(w)),
    'pending',  (select count(*) from car_washes where status = 'pending'),
    'expiring', (select count(*) from car_washes where status = 'approved' and paid_until between today and today + 7),
    'expired',  (select count(*) from car_washes where status = 'approved' and paid_until < today),
    'today',    (select count(*) from wash_bookings where (starts_at at time zone 'Asia/Baghdad')::date = today and status in ('pending','confirmed','arrived','in_service','completed')),
    'month',    (select count(*) from wash_bookings where created_at > now() - interval '30 days'),
    'mrr',      (select coalesce(sum(p.price_iqd), 0) from car_washes w join wash_plans p on p.code = w.plan where wash_published(w)),
    'paid_30d', (select coalesce(sum(amount_iqd), 0) from wash_payments where created_at > now() - interval '30 days'),
    'reviews_7d', (select count(*) from wash_reviews where created_at > now() - interval '7 days'),
    'outbox_unsent', (select count(*) from wash_events where sent_at is null and error is null and kind in ('new','cancelled','review','confirmed','cancelled_by_business','in_service','completed','reminder')),
    'outbox_failed_24h', (select count(*) from wash_events where error is not null and error <> 'لا جهاز' and created_at > now() - interval '1 day'),
    'no_device_24h', (select count(*) from wash_events where error = 'لا جهاز' and created_at > now() - interval '1 day'),
    'expired_24h', (select count(*) from wash_bookings where status = 'expired' and status_at > now() - interval '1 day'),
    'pending_stale', (select count(*) from wash_bookings where status = 'pending' and created_at < now() - interval '1 hour' and starts_at > now()),
    'tick_last', tick,
    'tick_age_min', case when tick is null then null else round(extract(epoch from (now() - to_timestamp(tick, 'YYYYMMDDHH24MI'))) / 60) end
  );
end $$;
revoke all on function public.wash_admin_stats() from public, anon;
grant execute on function public.wash_admin_stats() to authenticated;

do $$
begin
  assert (select count(*) from pg_proc where proname = 'wash_dashboard') = 1, 'wash_dashboard غائبة';
  assert (select prosrc from pg_proc where proname = 'wash_admin_stats') like '%tick_age_min%', 'wash_admin_stats القديمة';
end $$;

commit;

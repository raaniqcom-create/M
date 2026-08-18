-- متى يريد الشخص أن يُزعَج، ومتى لا يريد أصلاً.
--
-- من شكوى مستخدم: «عبّأت بانزين. يجب أن يكون هناك أوقات لاستلام الإشعارات، أو
-- عندما أحتاج التطبيق — ليس يومياً يصل لي الإشعار.» ومن ٦٥٥ مشتركاً، وصل
-- الإشعار إلى ٥٠٦ خلال ٢٤ ساعة. السقف الحالي إشعار كل ٤٥ دقيقة لكل شخص، بلا
-- أي اعتبار للّيل ولا لكون الرجل ملأ خزانه للتوّ.
--
-- لماذا جدول مستقلّ لا عمودان في alerts:
--   للشخص الواحد صفٌّ لكل (مدينة، منتج) وصفٌّ لكل محطة يتابعها. فتفضيلٌ محفوظ
--   في الصفوف يجب أن يُنسخ على كلٍّ منها — وأول متابعة جديدة بعد الضبط تُدرَج
--   بلا نسخة، فيرنّ الهاتف في الوقت الذي منعه صاحبه. المفتاح هو العنوان،
--   فالتفضيل يُحفظ على العنوان مرة واحدة.
--
--   وكان البديل ختم last_sent_at في المستقبل لصنع «إيقاف مؤقّت» بلا مخطط. وهو
--   يعمل، لكنه يجعل عموداً واحداً يعني شيئين: «متى أُشعر» و«متى يُسمح له».
--   وأول من يقرؤه بعدنا لن يعرف أيّهما، وحساب المهلة يصير كذبةً صامتة.
begin;

create table if not exists alert_prefs (
  address       text primary key,
  -- دقائق من منتصف الليل بتوقيت بغداد. null = بلا تقييد (السلوك الحالي).
  -- «ساعات الاستقبال» لا «ساعات الهدوء»: المستخدم طلب أن يحدّد متى يُستقبل.
  hours_from    smallint check (hours_from between 0 and 1439),
  hours_to      smallint check (hours_to   between 0 and 1439),
  -- «عبّأت — أوقفني». تنتهي وحدها، فلا وظيفة تنظيف ولا نسيان.
  paused_until  timestamptz,
  updated_at    timestamptz not null default now()
);

alter table alert_prefs enable row level security;
-- لا سياسة SELECT ولا UPDATE للعموم: العنوان رمز دفع، وكشفه يكشف من يُشعَر.
-- الكتابة عبر دالة مُنطاقة بالعنوان وحده، كما alerts_clear_choice.
revoke all on alert_prefs from anon, authenticated;

create or replace function public.alerts_set_prefs(
  p_address text,
  p_from    smallint default null,
  p_to      smallint default null,
  p_paused  timestamptz default null
)
returns void
language sql
security definer
set search_path = public
as $fn$
  insert into alert_prefs (address, hours_from, hours_to, paused_until, updated_at)
  values (p_address, p_from, p_to, p_paused, now())
  on conflict (address) do update
    set hours_from = excluded.hours_from,
        hours_to = excluded.hours_to,
        paused_until = excluded.paused_until,
        updated_at = now();
$fn$;

revoke all on function public.alerts_set_prefs(text, smallint, smallint, timestamptz) from public;
grant execute on function public.alerts_set_prefs(text, smallint, smallint, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- alerts_for — نفس الجسم، مضافاً إليه شرط واحد
-- ---------------------------------------------------------------------------
-- التوقيع لم يتغيّر، فالدوال المنشورة تُحلّ كما هي بلا إعادة نشر ولا PGRST203.
drop function if exists public.alerts_for(text, fuel_product[], boolean, uuid);

create function public.alerts_for(
  p_city     text,
  p_products fuel_product[],
  p_stamp    boolean default true,
  p_station  uuid    default null
)
returns table(channel text, address text, keys jsonb)
language plpgsql
security definer
set search_path = public
as $function$
declare
  -- دقائق منتصف الليل بتوقيت بغداد، مرة واحدة للنداء كله
  nowmin int := extract(hour   from (now() at time zone 'Asia/Baghdad'))::int * 60
              + extract(minute from (now() at time zone 'Asia/Baghdad'))::int;
begin
  if p_stamp then
    return query
    with allowed as (
      -- من يُسمح بإزعاجه الآن. عنوانٌ بلا صفّ تفضيلات مسموح — وهو حال الجميع
      -- قبل هذه الهجرة، فالسلوك لا يتغيّر لأحد لم يضبط شيئاً.
      select a.address
        from (select distinct address from alerts) a
        left join alert_prefs p on p.address = a.address
       where (p.paused_until is null or p.paused_until <= now())
         and (
           p.hours_from is null or p.hours_to is null
           or case when p.hours_to > p.hours_from
                   then nowmin >= p.hours_from and nowmin < p.hours_to
                   -- نافذة تعبر منتصف الليل، بنفس شكل isOpenNow في lib/hours.ts
                   else nowmin >= p.hours_from or nowmin < p.hours_to
              end
         )
    ),
    matched as (
      select a.address, (a.station_id is not null) as is_station
        from alerts a
        join allowed w on w.address = a.address
       where (a.product is null or a.product = any(p_products))
         and case when a.station_id is not null
                  then a.station_id = p_station
                  else (a.city is null or a.city = p_city)
             end
    ),
    eligible as (
      select distinct m.address, m.is_station
        from matched m
       where not exists (
         select 1
           from alerts b
          where b.address = m.address
            and (b.station_id is not null) = m.is_station
            and b.last_sent_at >= now() - interval '45 minutes'
       )
    ),
    hit as (
      update alerts a
         set last_sent_at = now()
        from eligible e
       where a.address = e.address
         and (a.station_id is not null) = e.is_station
      returning a.channel, a.address, a.keys
    )
    select distinct on (h.address) h.channel, h.address, h.keys
      from hit h
     order by h.address;
  else
    return query
    select distinct on (a.address) a.channel, a.address, a.keys
      from alerts a
      left join alert_prefs p on p.address = a.address
     where (a.product is null or a.product = any(p_products))
       and case when a.station_id is not null
                then a.station_id = p_station
                else (a.city is null or a.city = p_city)
           end
       and (p.paused_until is null or p.paused_until <= now())
       and (
         p.hours_from is null or p.hours_to is null
         or case when p.hours_to > p.hours_from
                 then nowmin >= p.hours_from and nowmin < p.hours_to
                 else nowmin >= p.hours_from or nowmin < p.hours_to
            end
       )
     order by a.address;
  end if;
end
$function$;

revoke all on function public.alerts_for(text, fuel_product[], boolean, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- سجلّ الإشعارات
-- ---------------------------------------------------------------------------
-- حين قال المشتكي «يومياً»، لم يكن عندي ما أُثبت به أو أنفي: last_sent_at يحمل
-- آخر إرسال فقط. فلا سبيل لمعرفة كم إشعاراً يصل الشخص — وهذا ما جعل الشكوى
-- تصل بدل أن تُقاس. ولا بيانات جديدة هنا: العنوان مخزَّن أصلاً.
create table if not exists notification_log (
  id         bigserial primary key,
  address    text not null,
  kind       text not null,
  station_id uuid,
  sent_at    timestamptz not null default now()
);
create index if not exists notification_log_sent_idx on notification_log (sent_at desc);
create index if not exists notification_log_addr_idx on notification_log (address, sent_at desc);
alter table notification_log enable row level security;
revoke all on notification_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_stats — صفوف المتابعة ليست اشتراكات مدن
-- ---------------------------------------------------------------------------
-- byCity يرشّح بـ«city is not null» وحده، فلو حُشيت مدن صفوف المتابعة يوماً
-- لعُدّ متابعو المحطات مشتركي مدن، وتضخّم الرقم الذي يقرّر به المدير أين يُعلن.
-- نفس الحارس الذي أخذه announce_reach.
create or replace function public.admin_stats()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare caller_role text;
begin
  select p.role::text into caller_role from profiles p where p.id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return json_build_object(
    'devices', (
      select coalesce(json_object_agg(platform, n), '{}'::json)
        from (select platform, count(*) n from device_tokens group by platform) d
    ),
    'listeners', (
      select coalesce(json_object_agg(channel, n), '{}'::json)
        from (select channel, count(distinct address) n from alerts group by channel) a
    ),
    'alertRows', (select count(*) from alerts),
    'stationFollows', (select count(*) from alerts where station_id is not null),
    'paused', (select count(*) from alert_prefs where paused_until > now()),
    'quietSet', (select count(*) from alert_prefs where hours_from is not null),
    'byCity', (
      select coalesce(json_agg(row_to_json(t) order by t.people desc), '[]'::json)
        from (
          select city,
                 count(distinct address) people,
                 count(distinct address) filter (where channel = 'ios')     ios,
                 count(distinct address) filter (where channel = 'android') android,
                 count(distinct address) filter (where channel = 'web')     web
            from alerts
           where city is not null
             and station_id is null
           group by city
        ) t
    )
  );
end
$fn$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

commit;

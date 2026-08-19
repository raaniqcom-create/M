-- محطة مغلقة لا طابور فيها · وسجلٌّ يقول ما قاله الإشعار
--
-- من بلاغ مستخدم مع لقطة: بطاقة تقول «مغلقة» و«خفيف · من المحطة» معاً. وقِيس
-- على الحيّ: الساعة ٤:٣٨ فجراً، والمحطة تعمل ٦:٠٠–١٩:٠٠، والازدحام اليدوي
-- ضُبط «أخضر» قبل ٢٨ دقيقة — أي نحو ٤:١٠ فجراً. والمهلة ثلاثون دقيقة، فالقراءة
-- ما زالت «طازجة» وتُعرض على ساحةٍ لا أحد فيها.
--
-- الحارس الأساسي في المتصفح (activeTrafficLevel)، لأن الازدحام اليدوي على
-- جدول stations ويُحسب هناك. وهذا الملف للنصف الآخر: أصوات الناس، وهي تُجمَّع
-- في منظورين — فيُسكَتان بالقاعدة نفسها التي أسكتت المنتجات النافدة في
-- 20260817g: شرطٌ في where يُسقط الصفوف، فيصل null إلى العميل بلا تعديل مكوّن.
begin;

-- ---------------------------------------------------------------------------
-- ١. المنظوران: لا يُحتسب صوتٌ أُدلي به والمحطة مغلقة
-- ---------------------------------------------------------------------------
-- الشرط نفسه في الموضعين، ونفس منطق isOpenNow في lib/hours.ts: الإغلاق اليدوي
-- يتقدّم، ثم الأربع والعشرون ساعة، ثم النافذة الملتفّة حول منتصف الليل.
create or replace function public.station_open_now(st stations)
returns boolean
language sql
stable
as $$
  select case
    when st.temp_closed then false
    when st.is_24h then true
    else (
      with t as (
        select extract(hour   from (now() at time zone 'Asia/Baghdad'))::int * 60
             + extract(minute from (now() at time zone 'Asia/Baghdad'))::int as m,
               extract(hour from st.opens_at)::int  * 60 + extract(minute from st.opens_at)::int  as o,
               extract(hour from st.closes_at)::int * 60 + extract(minute from st.closes_at)::int as c
      )
      select case when c > o then m >= o and m < c else m >= o or m < c end from t
    )
  end;
$$;

create or replace view public.station_traffic_avg as
select
  v.station_id,
  count(*) filter (where v.level = 'green')  as green_votes,
  count(*) filter (where v.level = 'yellow') as yellow_votes,
  count(*) filter (where v.level = 'red')    as red_votes,
  count(*)                                   as total_votes,
  (case
     when count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'yellow')
      and count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'green')
       then 'red'
     when count(*) filter (where v.level = 'yellow') >= count(*) filter (where v.level = 'green')
       then 'yellow'
     else 'green'
   end)::traffic_level as majority_level,
  max(v.created_at) as last_vote_at
from traffic_votes v
where v.created_at > now() - interval '30 minutes'
  and exists (
    select 1 from stations st
     where st.id = v.station_id
       and station_open_now(st)
  )
  and (
    v.product is null
    or exists (
      select 1 from station_products sp
       where sp.station_id = v.station_id
         and sp.product    = v.product
         and sp.is_available
    )
  )
group by v.station_id;

create or replace view public.station_product_traffic as
select
  v.station_id,
  v.product,
  count(*)          as total_votes,
  max(v.created_at) as last_vote_at,
  (case
     when count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'yellow')
      and count(*) filter (where v.level = 'red') >= count(*) filter (where v.level = 'green')
       then 'red'
     when count(*) filter (where v.level = 'yellow') >= count(*) filter (where v.level = 'green')
       then 'yellow'
     else 'green'
   end)::traffic_level as majority_level
from traffic_votes v
where v.created_at > now() - interval '30 minutes'
  and v.product is not null
  and exists (
    select 1 from stations st
     where st.id = v.station_id
       and station_open_now(st)
  )
  and exists (
    select 1 from station_products sp
     where sp.station_id = v.station_id
       and sp.product    = v.product
       and sp.is_available
  )
group by v.station_id, v.product;

-- ---------------------------------------------------------------------------
-- ٢. الازدحام اليدوي يُمسح حين تُغلق المحطة بأوقاتها
-- ---------------------------------------------------------------------------
-- الإغلاق اليدوي يمسحه التطبيق (app/owner/page.tsx). أما انقضاء أوقات العمل
-- فلا زرّ فيه ولا لحظة يمكن للمتصفح أن يعلّق عليها، فيبقى الحقل محمّلاً إلى
-- الأبد بينما نصّ لوحة المالك يعده بأنه «يُمسح تلقائياً». هذه الدالة تجعل
-- الوعد صادقاً — تُنادى من كرون الدقيقتين القائم أصلاً.
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
  )
  select count(*)::int from cleared;
$$;

revoke all on function public.clear_stale_traffic() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ٣. سجلّ الإشعارات يحفظ ما قاله الإشعار
-- ---------------------------------------------------------------------------
-- «وصلت لي ٩ إشعارات ولم أعرف أين أجدها.» وبلا هذين العمودين لا يمكن إعادة
-- بناء الرسالة: kind لا يحمل أي منتج، والمنتج هو كل محتوى العنوان.
alter table notification_log
  add column if not exists title text,
  add column if not exists body  text;

-- قراءةٌ مُنطاقة بالعنوان، كبقية دوال هذا المشروع. حيازة العنوان هي الإذن —
-- وهو رمز دفع طويل لا يُخمَّن، ولا يملكه إلا صاحبه. والحدّ مذكور صراحةً فلا
-- يجرّ عنوانٌ مسرَّب مسحاً غير محدود.
create or replace function public.notifications_for(p_address text)
returns table(title text, body text, station_id uuid, kind text, sent_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select n.title, n.body, n.station_id, n.kind, n.sent_at
    from notification_log n
   where n.address = p_address
   order by n.sent_at desc
   limit 50;
$$;

revoke all on function public.notifications_for(text) from public;
grant execute on function public.notifications_for(text) to anon, authenticated;

commit;

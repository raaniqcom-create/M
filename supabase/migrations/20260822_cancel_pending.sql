-- إلغاء خبرٍ مجدول قبل أن يصل الناس.
--
-- الإدارة تجدول إعلاناً ثم يتغيّر الحال — نفد الوقود، أو أُخطئ في الاسم، أو
-- اتّصلت المحطة تعتذر. واليوم لا سبيل إلى إيقافه: يُكتب في الجدول وينتظر، ثم
-- تُرسله المِكنسة إلى ألف جهاز. وإشعارٌ أُرسل لا يُستردّ.
--
-- والسباق هنا حقيقي لا نظري: المِكنسة تعمل كل دقيقتين، وتحجز الخبر بضربة
-- واحدة تضع sent_at. فمن ألغى بعد الحجز ألغى شيئاً في طريقه أو وصل فعلاً.
-- ولذلك يشترط الإلغاء sent_at is null، ويردّ عدد الصفوف التي مسّها — فتعرف
-- الإدارة أنها أدركته أو فاتها، ولا تُترك تظنّ أنها أوقفت ما لم توقفه.
begin;

-- ما ينتظر الإرسال — للإدارة وحدها.
create or replace function public.pending_announcements()
returns table(
  id       uuid,
  title    text,
  body     text,
  cities   text[],
  product  text,
  send_at  timestamptz,
  station_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.title, a.body, a.cities, a.product, a.send_at, a.station_name
    from announcements a
   where a.active
     and a.sent_at is null
     and (select p.role::text from profiles p where p.id = auth.uid()) = 'admin'
   order by a.send_at;
$$;

revoke all on function public.pending_announcements() from public;
grant execute on function public.pending_announcements() to authenticated;

-- الإلغاء. يردّ true إن أُدرك الخبر قبل الحجز، وfalse إن فات.
--
-- ولا يُحذف الصفّ بل يُعطَّل: سجلُّ ما نُوي إرساله وأُلغي جزءٌ من تاريخ المنصّة،
-- وحذفُه يُخفي القرار كما يُخفي الخطأ الذي دعا إليه.
create or replace function public.cancel_announcement(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n int;
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update announcements
     set active = false
   where id = p_id
     and active
     -- الشرط هو كل شيء: بدونه يُقال للإدارة «أُلغي» عن خبرٍ في طريقه إلى
     -- الأجهزة، فتطمئنّ إلى ما لم يقع.
     and sent_at is null;

  get diagnostics n = row_count;
  return n > 0;
end
$fn$;

revoke all on function public.cancel_announcement(uuid) from public;
grant execute on function public.cancel_announcement(uuid) to authenticated;

commit;

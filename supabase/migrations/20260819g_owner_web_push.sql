-- صاحب محطة يعمل من المتصفح لا يصله شيء.
--
-- التل الأخضر ودار السلام حدّثتا ٧ مرات في ٧ أيام — أنشط محطتين على المنصة —
-- ولا جهاز مربوط بواحدة منهما، فلا يصلهما إشعار واحد. والسبب ليس فيهما:
--
--   app/owner/page.tsx يربط الجهاز بقراءة localStorage['device-token']، وهذا
--   المفتاح يكتبه تسجيلُ الدفع الأصلي في تطبيق Capacitor وحده. ومن يفتح لوحته
--   من المتصفح لا يملكه، فلا يُربط أبداً مهما نشر.
--
--   وdevice_tokens بلا عمود مفاتيح أصلاً، وowner-daily ترسل عبر APNs وFCM فقط.
--   فالمتصفح غير مخدوم من الطرفين: لا يُسجَّل، ولا يُرسَل إليه لو سُجّل.
--
-- والنتيجة أن نظام تذكير الملّاك كله يخدم من ثبّت التطبيق وفتح لوحته منه —
-- وهم أربعة من ستّة، وأنشط اثنين خارجهم.
begin;

-- دفع الويب يحتاج مفتاحين مع العنوان (p256dh وauth)، وAPNs/FCM لا يحتاجانهما.
-- عمود واحد يسع الاثنين، ويبقى null للأصلي كما هو في alerts.
alter table device_tokens
  add column if not exists keys jsonb;

-- والقيد يسمح بـandroid وios وحدهما، فإدراج اشتراك متصفح كان يُرفض من القاعدة
-- مهما صحّ ما قبله. القناة الثالثة تُضاف إلى القيد لا تُلغيه: عمودٌ بلا قيد
-- يقبل أي خطأ إملائي فيصير صفّاً لا يصله شيء ولا يشكو أحد.
alter table device_tokens drop constraint if exists device_tokens_platform_check;
alter table device_tokens add constraint device_tokens_platform_check
  check (platform in ('android', 'ios', 'web'));

-- الربط صار يقبل المنصة والمفاتيح، ويُدرج الصفّ إن لم يكن موجوداً: الأصلي
-- يُدرَج عند تسجيل الجهاز (NativePush)، أما اشتراك الويب فيولد هنا أول مرة.
create or replace function public.claim_owner_device(
  p_token      text,
  p_station_id uuid,
  p_platform   text default null,
  p_keys       jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from stations s
     where s.id = p_station_id
       and s.owner_id = auth.uid()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into device_tokens (token, platform, station_id, keys)
  values (p_token, coalesce(p_platform, 'web'), p_station_id, p_keys)
  on conflict (token) do update
     set station_id = excluded.station_id,
         platform   = coalesce(excluded.platform, device_tokens.platform),
         keys       = coalesce(excluded.keys, device_tokens.keys);
end
$fn$;

revoke all on function public.claim_owner_device(text, uuid, text, jsonb) from public;
grant execute on function public.claim_owner_device(text, uuid, text, jsonb) to authenticated;

commit;

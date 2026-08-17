-- ربط جهاز صاحب المحطة بمحطته، وسجلّ ما أُرسل إليه اليوم.
--
-- لوحة الإدارة تطالب بجهازها منذ زمن (is_admin)، ولوحة المحطة لا. فـ
-- device_tokens.station_id بقي فارغاً في كل الصفوف الـ١١٤، وowner-reminders
-- التي تعمل كل نصف ساعة منذ أسابيع لا تصل أحداً — تبحث عن اشتراكات ويب
-- بدور 'owner' وعددها صفر أيضاً، لأن صاحب المحطة يستعمل التطبيق لا المتصفح.

-- الجهاز يُطالَب بدالة لا بتحديث مباشر: سياسة UPDATE على device_tokens
-- مقصورة على الإدارة، وتوسيعها ليحدّث كلٌّ صفّاً «يملك رمزه» مستحيل — لا
-- تستطيع RLS التحقق من حيازة رمز. فالدالة تتحقق أن المتصل صاحب المحطة،
-- ثم تكتب. ولا تُرجع شيئاً، فلا تكشف صفاً.
create or replace function public.claim_owner_device(p_token text, p_station_id uuid)
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

  update device_tokens
     set station_id = p_station_id
   where token = p_token;
end
$fn$;

revoke all on function public.claim_owner_device(text, uuid) from public;
grant execute on function public.claim_owner_device(text, uuid) to authenticated;

-- ما أُرسل إلى محطة اليوم، حتى لا يتكرر التذكير في كل دورة.
-- kind: opening_first | opening_again | closing_thanks
create table if not exists public.owner_pings (
  station_id uuid not null references stations(id) on delete cascade,
  kind       text not null,
  day        date not null,
  sent_at    timestamptz not null default now(),
  primary key (station_id, kind, day)
);

alter table public.owner_pings enable row level security;
-- لا أحد يقرأها ولا يكتبها من المتصفح؛ دور الخدمة وحده يتجاوز RLS

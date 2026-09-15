-- موظّفو المحطة: اسمُ دخولٍ (أربعةُ أحرفٍ فأكثر) أو رقمُ هاتف — والإضافةُ من
-- الحساب الأساسيّ نفسِه.
--
-- «لا تسمّها وردية — سمّها إضافةَ موظّفين … وإمكانيّةُ وضع حساب اسمٍ من أربعة
-- حروف فأكثر أو رقم الهاتف للحساب الذي يُضاف من الحساب الأساسيّ» — صاحبُ
-- المنصّة، ١٦ أيلول.
--
-- الاسمُ بالحروف اللاتينيّة: عنوانُ الدخول بريدٌ اصطناعيّ <name>@muhta.app
-- (app/login/page.tsx يحوّل ما ليس رقماً إلى ذلك)، والبريدُ لا يقبل العربيّة.
-- ولا يبدأ بـ«p» متبوعةٍ بأرقام كي لا يلتبس بحسابات الهواتف p7XXXXXXXXX.
begin;

alter table public.station_managers alter column phone drop not null;
alter table public.station_managers add column if not exists username text;

alter table public.station_managers drop constraint if exists station_managers_phone_check;
alter table public.station_managers drop constraint if exists station_managers_login_check;
alter table public.station_managers add constraint station_managers_login_check check (
  (phone is null or phone ~ '^07\d{9}$')
  and (username is null or (username ~ '^[a-z][a-z0-9_.]{3,19}$' and username !~ '^p\d+$'))
  and (phone is not null or username is not null)
);
create unique index if not exists station_managers_username_uniq on public.station_managers(username) where username is not null;

comment on column public.station_managers.username is
  'اسمُ الدخول (لاتينيّ، ٤–٢٠) لموظّفٍ بلا رقم؛ عنوانُه <username>@muhta.app.';

-- الإيقافُ يفصل تيليغرامَ الرقم فقط حين يكون للموظّف رقم.
create or replace function public.station_manager_toggle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.active then
    update device_tokens set station_id = new.station_id
     where user_id = new.user_id and station_id is null;
    return null;
  end if;
  if tg_op = 'UPDATE' and old.active = new.active then
    return null;
  end if;
  update device_tokens set station_id = null where user_id = old.user_id;
  if old.phone is not null then
    delete from telegram_links where station_id = old.station_id and phone = substr(old.phone, 2);
  end if;
  return null;
end;
$$;

commit;

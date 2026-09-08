-- علامةٌ واحدةٌ للسطر الواحد — والرفعُ بالهدف لا بالمعرّف.
--
-- ── ما كشفه بناءُ شاشة الإدارة ─────────────────────────────────────────────
--
-- كتبتُ الشاشةَ تمسح ما يخصّ السطرَ ثمّ تكتب العلامةَ الجديدة، كما يفعل البوت.
-- والبوتُ يستطيع: يعمل بمفتاح الخدمة. أمّا المتصفّح فلا — و`board_overrides`
-- **لا منحَ كتابةٍ فيها لـ`authenticated`** أصلاً (20260909d)، وهو قرارٌ مقصود.
-- فكان المسحُ يفشل، ويسقط النداءُ قبل أن يكتب شيئاً: زرٌّ لا يفعل شيئاً أبداً.
--
-- فالمسحُ يدخل الدالّةَ نفسَها: نداءٌ واحدٌ يُبدّل ولا يُراكم، وهو أصحُّ على كلّ
-- حال — علامتان متناقضتان على سطرٍ واحد حالٌ لا معنى لها.
--
-- ولا تُمسّ علامةُ المنطقة: مسحٌ مشروطٌ باسم المحطة، فمن أخفى الفلوجةَ كلَّها
-- لا يرفعها بضغطةٍ على سطرٍ فيها.

begin;

create or replace function public.set_board_override(
  p_for_date     date,
  p_action       text,
  p_city         text default null,
  p_station_id   uuid default null,
  p_station_name text default null,
  p_product      fuel_product default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('hide', 'out') then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  if coalesce(p_city, '') = '' and p_station_id is null
     and coalesce(p_station_name, '') = '' and p_product is null then
    raise exception 'override must target something' using errcode = '22023';
  end if;

  -- ما يخصّ هذا الهدفَ بعينه يُرفع أوّلاً — ولا تُمسّ علاماتُ المنطقة الأوسع.
  if coalesce(p_station_name, '') <> '' then
    delete from board_overrides
     where for_date = p_for_date
       and station_name = p_station_name
       and product is not distinct from p_product;
  elsif p_station_id is not null then
    delete from board_overrides
     where for_date = p_for_date
       and station_id = p_station_id
       and product is not distinct from p_product;
  else
    delete from board_overrides
     where for_date = p_for_date
       and city = p_city
       and station_id is null
       and station_name is null;
  end if;

  insert into board_overrides (for_date, city, station_id, station_name, product, action, created_by)
  values (p_for_date, nullif(p_city, ''), p_station_id, nullif(p_station_name, ''), p_product, p_action, auth.uid())
  returning id into v_id;
  return v_id;
end
$fn$;

-- والرفعُ بالهدف: الشاشةُ تعرض سطرَ لوحةٍ لا صفَّ جدول، فلا معرّفَ عندها
-- تُرسله. وتردّ **ما إن أصابت سطراً** — «تمّ» عن لا شيءٍ كذبةٌ يبني عليها
-- المشغّلُ قراراً، وهو مبدأُ `cancel_announcement` نفسُه.
create or replace function public.clear_board_override_for(
  p_for_date     date,
  p_city         text default null,
  p_station_id   uuid default null,
  p_station_name text default null,
  p_product      fuel_product default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare n int;
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if coalesce(p_station_name, '') <> '' then
    delete from board_overrides
     where for_date = p_for_date
       and station_name = p_station_name
       and product is not distinct from p_product;
  elsif p_station_id is not null then
    delete from board_overrides
     where for_date = p_for_date
       and station_id = p_station_id
       and product is not distinct from p_product;
  else
    delete from board_overrides
     where for_date = p_for_date
       and city = p_city
       and station_id is null
       and station_name is null;
  end if;

  get diagnostics n = row_count;
  return n > 0;
end
$fn$;

revoke all on function public.clear_board_override_for(date, text, uuid, text, fuel_product) from public;
grant execute on function public.clear_board_override_for(date, text, uuid, text, fuel_product) to authenticated;

commit;

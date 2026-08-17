-- كم شخصاً يصله إشعار هذه المدن وهذا المنتج — عدداً فقط.
--
-- المدير يحتاج الرقم قبل أن يضغط «انشر»، ولا يحتاج رمز جهاز ولا عنوان دفع
-- واحداً. فالدالة تُرجع مجاميع، والجدول يبقى محجوباً كما هو.
--
-- distinct address: الشخص له صفّ لكل (مدينة، منتج)، فعدّ الصفوف يضخّم الرقم.
-- والشرط نفسه المستعمل في alerts_for — city null تعني «كل المدن» وproduct null
-- تعني «كل الأنواع»، فمن اختار العموم يُحسب هنا كما يُحسب هناك.
create or replace function public.announce_reach(p_cities text[], p_product text default null)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller_role text;
begin
  select p.role::text into caller_role from profiles p where p.id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select json_build_object(
      'ios',     count(distinct address) filter (where channel = 'ios'),
      'android', count(distinct address) filter (where channel = 'android'),
      'web',     count(distinct address) filter (where channel = 'web')
    )
    from alerts a
    where (a.city is null or a.city = any(p_cities))
      and (a.product is null or p_product is null or a.product::text = p_product)
  );
end
$fn$;

revoke all on function public.announce_reach(text[], text) from public;
grant execute on function public.announce_reach(text[], text) to authenticated;

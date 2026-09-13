-- اعتمادُ المحطة ورفضُها وإيقافُها بدالّةٍ للإدارة — لا بتحديثٍ يمرّ بسياساتٍ لا يراها المستودع.
--
-- «ضغطتُ اعتماد ولم ينفذ» (١٣ أيلول): التحديثُ المباشر من المتصفّح يخضع لسياسات
-- stations كما هي في القاعدة — وبعضُها كُتب من اللوحة لا من هنا — فيعود صفرَ
-- صفوفٍ بلا خطأ. فصار تغييرُ الحالة دالّةً على نمط restore_station: تتحقّق من
-- دور المدير بنفسها وتكتب بصلاحيّة مالكها، وتُخطئ بصوتٍ إن لم تجد المحطة.
begin;

create or replace function public.admin_set_station_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.stations.status%type;
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'suspended', 'pending') then
    raise exception 'bad status %', p_status using errcode = '22023';
  end if;
  v := p_status;
  update public.stations set status = v where id = p_id;
  if not found then
    raise exception 'no station %', p_id using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.admin_set_station_status(uuid, text) is
  'تغييرُ حالة محطة (approved/rejected/suspended/pending) — للإدارة وحدها.';

revoke all on function public.admin_set_station_status(uuid, text) from public, anon;
grant execute on function public.admin_set_station_status(uuid, text) to authenticated;

commit;

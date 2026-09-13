-- الاسترجاعُ يعيد المحطةَ إلى حساب رقمها — لا إلى معرّفِ مالكٍ محفوظ.
--
-- «عند استرجاع الحساب لا داعي أن يُربط باسمي ثمّ يُحوَّل إليه» — صاحبُ المنصّة،
-- ١٣ أيلول ٢٠٢٦. حالةُ الأوائل: المحطةُ عادت باسم المدير، وصاحبُها سجّل حساباً
-- جديداً برقمها، فبقيت الاثنتان متباعدتين لأنّ الاسترجاعَ يعرف المالكَ بمعرّفه
-- (20260906c) والمعرّفُ يزول مع الحساب.
--
-- الرقمُ هو اسمُ الدخول (p<الأرقام>@muhta.app) وهو رقمُ النشر — فهو الهويّةُ
-- الدائمة: من له حسابٌ برقم المحطة فهو صاحبُها؛ ثمّ المالكُ المؤرشف إن بقي؛
-- ثمّ المديرُ المسترجِع.
begin;

-- ── اسمُ الدخول من الرقم — كما تشتقّه station-phone وnormalizePhone ────────
create or replace function public.phone_login_email(p text)
returns text
language sql
immutable
as $$
  select 'p'
      || regexp_replace(
           regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^(00)?964', ''),
           '^0+', '')
      || '@muhta.app';
$$;
revoke all on function public.phone_login_email(text) from public, anon, authenticated;

-- الصيغةُ تُثبَت هنا، ويُثبَت أنّ منفّذَ الترحيل يقرأ auth.users — فيسقط الترحيلُ
-- مبكّراً لا زرُّ الاسترجاع لاحقاً.
do $$
begin
  assert public.phone_login_email('+964 781 405 1400') = 'p7814051400@muhta.app';
  assert public.phone_login_email('07814051400') = 'p7814051400@muhta.app';
  assert public.phone_login_email('009647814051400') = 'p7814051400@muhta.app';
  perform count(*) from auth.users;
end $$;

-- ── الاسترجاع ─────────────────────────────────────────────────────────────
create or replace function public.restore_station(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.station_archive;
  row_json jsonb;
  v_owner uuid;
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into a from public.station_archive where id = p_id;
  if a.id is null then
    raise exception 'no archived station %', p_id using errcode = 'P0002';
  end if;
  if exists (select 1 from stations s where s.id = p_id) then
    raise exception 'station % already exists', p_id using errcode = '23505';
  end if;

  -- المالكُ يُعرَف برقم المحطة لا بمعرّفٍ يزول مع الحساب.
  select u.id into v_owner
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.email = public.phone_login_email(a.station->>'phone')
   limit 1;
  if v_owner is null and exists (
    select 1 from public.profiles p where p.id = (a.station->>'owner_id')::uuid
  ) then
    v_owner := (a.station->>'owner_id')::uuid;
  end if;
  row_json := jsonb_set(a.station, '{owner_id}', to_jsonb(coalesce(v_owner, auth.uid())));

  insert into stations
  select * from jsonb_populate_record(null::stations, row_json);

  insert into station_products
  select * from jsonb_populate_recordset(null::station_products, a.products)
  on conflict do nothing;

  delete from public.station_archive where id = p_id;
  return p_id;
end;
$$;

comment on function public.restore_station(uuid) is
  'تُعيد محطةً محذوفة بمعرّفها الأصليّ ومنتجاتها إلى حساب رقمها؛ وإلّا إلى مالكها المؤرشف إن بقي؛ وإلّا باسم المدير المسترجِع. للإدارة وحدها.';

revoke all on function public.restore_station(uuid) from public, anon;
grant execute on function public.restore_station(uuid) to authenticated;

-- ── والرايةُ التي يقرؤها المدير قبل الضغط — بالتوقيع نفسِه ─────────────────
-- owner_gone = لا حسابَ للرقم ولا مالكَ مؤرشفاً؛ عندها وحدَها تعود باسم المدير.
create or replace function public.deleted_stations()
returns table (
  id uuid, name text, city text, phone text, status text,
  deleted_at timestamptz, lost jsonb, owner_gone boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select p.role from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select a.id,
           a.station->>'name',
           a.station->>'city',
           a.station->>'phone',
           a.station->>'status',
           a.deleted_at,
           a.lost,
           not exists (
             select 1 from auth.users u join public.profiles p on p.id = u.id
              where u.email = public.phone_login_email(a.station->>'phone')
           )
           and not exists (
             select 1 from public.profiles p where p.id = (a.station->>'owner_id')::uuid
           )
      from public.station_archive a
     order by a.deleted_at desc;
end;
$$;

revoke all on function public.deleted_stations() from public, anon;
grant execute on function public.deleted_stations() to authenticated;

commit;

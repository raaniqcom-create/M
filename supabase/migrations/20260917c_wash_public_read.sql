-- «غسيل»: قراءةُ الخدمات والعروض للزائر كانت تسقط.
--
-- سياسةُ القراءة العامّة على wash_services/wash_offers كانت تسأل car_washes
-- مباشرةً (exists … from car_washes)، والزائرُ anon بلا منحِ select على
-- car_washes عمداً (الهاتفُ فيه). فالسياسةُ نفسُها تُرفض: «permission denied
-- for table car_washes» — قِيس ١٦ أيلول على المغسلة التجريبيّة: 401 على
-- wash_services، فصفحةُ المغسلة بلا خدمات وزرُّ الحجز معطَّل.
--
-- الحلُّ كما manages_wash: مسندٌ security definer يُمنح لـanon، وتسأله السياسة.
begin;

create or replace function public.wash_is_published(p_wash uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from car_washes w where w.id = p_wash and wash_published(w));
$$;
revoke all on function public.wash_is_published(uuid) from public;
grant execute on function public.wash_is_published(uuid) to anon, authenticated, service_role;

drop policy if exists "wash_services: public read published" on public.wash_services;
create policy "wash_services: public read published" on public.wash_services for select
  using (wash_is_published(wash_id) or manages_wash(wash_id));

drop policy if exists "wash_offers: public read published" on public.wash_offers;
create policy "wash_offers: public read published" on public.wash_offers for select
  using (wash_is_published(wash_id) or manages_wash(wash_id));

do $$
begin
  assert (select count(*) from pg_proc where proname = 'wash_is_published') = 1, 'wash_is_published غائبة';
  assert (select count(*) from pg_policies where tablename in ('wash_services', 'wash_offers')
           and policyname like '%public read published') = 2, 'سياستا القراءة غائبتان';
end $$;

commit;

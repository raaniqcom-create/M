-- لا محطةَ بلا صفوفِ منتجات — والإدارةُ تكتبها لأيّ محطة.
--
-- «المحطةُ المسترجعة لا يمكنه تحديثُ حالة الوقود، وأنا حاولتُ من الإدارة» —
-- صاحبُ المنصّة، ١٣ أيلول ٢٠٢٦. المقيس: محطةُ الأوائل وحدَها بلا أيّ صفٍّ في
-- station_products، وكلُّ الواجهات تكتب بـupdate على (station_id, product) —
-- فبلا صفٍّ لا يتغيّر شيءٌ ولا خطأ يظهر. والسببُ الكامن الثاني: لا سياسةَ
-- للإدارة على station_products أصلاً؛ كانت تحرّك منتجاتِ الأوائل لأنّها
-- كانت مالكتَها.
begin;

-- ── ١ · الإدارةُ تكتب منتجاتِ أيّ محطة (نمطُ «stations: admin update any») ──
drop policy if exists "station_products: admin write any" on public.station_products;
create policy "station_products: admin write any" on public.station_products
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── ٢ · كلُّ محطةٍ تُولد بصفوفها السبعة — أيّاً كان بابُها ─────────────────
-- (التسجيل، لوحةُ الإدارة، البوت، الاسترجاع). enum_range لا قائمةٌ مكتوبة:
-- منتجٌ يُضاف إلى النوع يُضاف إلى الصفوف بلا تعديلٍ هنا.
create or replace function public.ensure_station_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.station_products (station_id, product, is_available)
  select new.id, p, false
    from unnest(enum_range(null::public.fuel_product)) as p
  on conflict (station_id, product) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_station_products on public.stations;
create trigger ensure_station_products
  after insert on public.stations
  for each row execute function public.ensure_station_products();

-- ── ٣ · تعويضُ ما نقص في القائم — مرّةً واحدة، وآمنٌ عند الإعادة ────────────
insert into public.station_products (station_id, product, is_available)
select s.id, p, false
  from public.stations s
  cross join unnest(enum_range(null::public.fuel_product)) as p
on conflict (station_id, product) do nothing;

commit;

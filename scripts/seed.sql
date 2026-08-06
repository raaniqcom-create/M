-- Demo data for Ramadi. Safe to re-run.
insert into stations (id, owner_id, name, address, phone, lat, lng, status) values
  ('b0000000-0000-0000-0000-000000000001', '8a1794d6-f33d-4871-bafe-eb816dd82696',
   'محطة الرمادي المركزية', 'الرمادي - شارع 20 - قرب الجسر الأول', '07901234567', 33.4258, 43.3012, 'approved'),
  ('b0000000-0000-0000-0000-000000000002', '8a1794d6-f33d-4871-bafe-eb816dd82696',
   'محطة الأنبار للوقود', 'الرمادي - حي الضباط - مقابل السوق', '07811112233', 33.4331, 43.2887, 'approved'),
  ('b0000000-0000-0000-0000-000000000003', '8a1794d6-f33d-4871-bafe-eb816dd82696',
   'محطة التأميم', 'الرمادي - حي التأميم - الشارع العام', '07709998877', 33.4102, 43.3204, 'approved'),
  ('b0000000-0000-0000-0000-000000000004', '8a1794d6-f33d-4871-bafe-eb816dd82696',
   'محطة الجزيرة', 'الرمادي - الجزيرة - قرب الدوار', '07733445566', 33.4450, 43.3100, 'pending')
on conflict (id) do nothing;

-- every station gets all six product rows so the owner dashboard has toggles
insert into station_products (station_id, product, is_available)
select s.id, p.product, false
from stations s
cross join (select unnest(enum_range(null::fuel_product)) as product) p
on conflict (station_id, product) do nothing;

update station_products set is_available = true
where station_id = 'b0000000-0000-0000-0000-000000000001'
  and product in ('gasoline_regular', 'gasoline_premium', 'gas');

update station_products set is_available = true
where station_id = 'b0000000-0000-0000-0000-000000000002'
  and product in ('gasoline_regular', 'kerosene', 'lpg', 'white_oil');

update station_products set is_available = true
where station_id = 'b0000000-0000-0000-0000-000000000003'
  and product in ('gasoline_premium');

delete from traffic_votes where station_id in (
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000003');

insert into traffic_votes (station_id, level) values
  ('b0000000-0000-0000-0000-000000000001', 'green'),
  ('b0000000-0000-0000-0000-000000000001', 'green'),
  ('b0000000-0000-0000-0000-000000000001', 'yellow'),
  ('b0000000-0000-0000-0000-000000000002', 'red'),
  ('b0000000-0000-0000-0000-000000000002', 'red'),
  ('b0000000-0000-0000-0000-000000000002', 'yellow');

insert into ads (image_url, link_url, start_date, end_date, active) values
  ('/ads/demo-banner.svg',
   'https://example.com', current_date - 1, current_date + 30, true)
on conflict do nothing;

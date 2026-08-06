-- Verifies station_traffic_avg picks the right majority level and breaks ties
-- toward congestion. Rolls back — leaves no data behind.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'traffic-test@example.com', 'x', now(), now());

insert into stations (id, owner_id, name, address, phone, lat, lng, status) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'S1', 'A', '0', 33.4, 43.3, 'approved'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'S2', 'A', '0', 33.4, 43.3, 'approved'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'S3', 'A', '0', 33.4, 43.3, 'approved'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'S4', 'A', '0', 33.4, 43.3, 'approved');

insert into traffic_votes (station_id, level) values
  -- S1: 3 green, 1 yellow, 1 red -> green
  ('a0000000-0000-0000-0000-000000000001', 'green'),
  ('a0000000-0000-0000-0000-000000000001', 'green'),
  ('a0000000-0000-0000-0000-000000000001', 'green'),
  ('a0000000-0000-0000-0000-000000000001', 'yellow'),
  ('a0000000-0000-0000-0000-000000000001', 'red'),
  -- S2: 1 green, 3 yellow -> yellow
  ('a0000000-0000-0000-0000-000000000002', 'green'),
  ('a0000000-0000-0000-0000-000000000002', 'yellow'),
  ('a0000000-0000-0000-0000-000000000002', 'yellow'),
  ('a0000000-0000-0000-0000-000000000002', 'yellow'),
  -- S3: 2 green, 2 red -> red (tie breaks toward congestion)
  ('a0000000-0000-0000-0000-000000000003', 'green'),
  ('a0000000-0000-0000-0000-000000000003', 'green'),
  ('a0000000-0000-0000-0000-000000000003', 'red'),
  ('a0000000-0000-0000-0000-000000000003', 'red');

-- S4: a vote older than the window must be excluded entirely
insert into traffic_votes (station_id, level, created_at)
values ('a0000000-0000-0000-0000-000000000004', 'red', now() - interval '45 minutes');

do $$
declare
  s1 text; s2 text; s3 text; s4_rows int;
begin
  select majority_level::text into s1 from station_traffic_avg where station_id = 'a0000000-0000-0000-0000-000000000001';
  select majority_level::text into s2 from station_traffic_avg where station_id = 'a0000000-0000-0000-0000-000000000002';
  select majority_level::text into s3 from station_traffic_avg where station_id = 'a0000000-0000-0000-0000-000000000003';
  select count(*) into s4_rows from station_traffic_avg where station_id = 'a0000000-0000-0000-0000-000000000004';

  assert s1 = 'green',  'plurality green failed, got ' || coalesce(s1, 'null');
  assert s2 = 'yellow', 'plurality yellow failed, got ' || coalesce(s2, 'null');
  assert s3 = 'red',    'tie must break to red, got ' || coalesce(s3, 'null');
  assert s4_rows = 0,   'votes older than 30 minutes must be excluded, got ' || s4_rows;

  raise notice 'all traffic view assertions passed';
end $$;

select 'PASS' as result;

rollback;

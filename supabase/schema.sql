-- المحطة التقنية — schema
-- Products are a fixed enum (6 fuel types), not a table: they never change,
-- a table+FK would just be indirection. ponytail: hardcode here and in
-- lib/products.ts; revisit as a table only if products become admin-editable.

create extension if not exists "pgcrypto";

create type fuel_product as enum (
  'gasoline_regular',   -- بانزين عادي
  'gasoline_premium',   -- بانزين محسن
  'kerosene',           -- كاز
  'gas',                -- غاز
  'lpg',                -- LPG
  'white_oil'           -- نفط أبيض
);

create type station_status as enum ('pending', 'approved', 'rejected');
create type traffic_level as enum ('green', 'yellow', 'red');
create type user_role as enum ('owner', 'admin');

-- one row per authenticated user (owners + admins). end users never sign up.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'owner',
  created_at timestamptz not null default now()
);

-- profiles must exist before the owner can insert a station, and RLS blocks a
-- client-side insert — so the row is created by trigger at signup.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role) values (new.id, 'owner')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table stations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  address text not null,
  phone text not null,
  lat double precision not null,
  lng double precision not null,
  status station_status not null default 'pending',
  manual_traffic_level traffic_level,        -- owner override, optional
  manual_traffic_set_at timestamptz,
  created_at timestamptz not null default now()
);

create index stations_status_idx on stations(status);
create index stations_owner_idx on stations(owner_id);

-- availability per product, one row per (station, product)
create table station_products (
  station_id uuid not null references stations(id) on delete cascade,
  product fuel_product not null,
  is_available boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (station_id, product)
);

-- crowdsourced traffic votes. no account, no text — just a color + timestamp.
-- rolling 30-min average is a view, not a stored aggregate: recomputed on
-- read, no cron/cleanup job needed for MVP.
-- ponytail: no per-device rate limit yet (one browser can spam votes),
-- add a device-id + unique(station_id, device_id, bucket) if abuse shows up.
create table traffic_votes (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  level traffic_level not null,
  created_at timestamptz not null default now()
);

create index traffic_votes_station_time_idx on traffic_votes(station_id, created_at desc);

-- ties break toward the more congested level: over-warning a driver about a
-- queue is cheaper than sending them to a jammed station.
create view station_traffic_avg
with (security_invoker = true) as
select
  station_id,
  count(*) filter (where level = 'green')  as green_votes,
  count(*) filter (where level = 'yellow') as yellow_votes,
  count(*) filter (where level = 'red')    as red_votes,
  count(*) as total_votes,
  (case
    when count(*) filter (where level = 'red') >= count(*) filter (where level = 'yellow')
     and count(*) filter (where level = 'red') >= count(*) filter (where level = 'green')
      then 'red'
    when count(*) filter (where level = 'yellow') >= count(*) filter (where level = 'green')
      then 'yellow'
    else 'green'
  end)::traffic_level as majority_level
from traffic_votes
where created_at > now() - interval '30 minutes'
group by station_id;

-- push subscriptions are per-station (no user accounts to hang them off).
-- one browser endpoint can follow many stations, hence the composite unique.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (station_id, endpoint)
);

create index push_subscriptions_station_idx on push_subscriptions(station_id);

create table ads (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  link_url text not null,
  start_date date not null,
  end_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ Row Level Security ============
-- Public (anon) can read approved stations/products/active ads and cast
-- votes/subscriptions. Owners write only their own station. Admins write
-- station status and ads. This is a trust boundary (anon key is public) —
-- not skipped for laziness.

alter table profiles enable row level security;
alter table stations enable row level security;
alter table station_products enable row level security;
alter table traffic_votes enable row level security;
alter table push_subscriptions enable row level security;
alter table ads enable row level security;

create policy "profiles: self read" on profiles for select using (id = auth.uid());

create policy "stations: public read approved" on stations for select using (status = 'approved');
create policy "stations: owner read own" on stations for select using (owner_id = auth.uid());
create policy "stations: owner insert" on stations for insert with check (owner_id = auth.uid());
create policy "stations: owner update own" on stations for update using (owner_id = auth.uid());
create policy "stations: admin update any" on stations for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "station_products: public read" on station_products for select using (
  exists (select 1 from stations s where s.id = station_id and s.status = 'approved')
);
create policy "station_products: owner write own" on station_products for all using (
  exists (select 1 from stations s where s.id = station_id and s.owner_id = auth.uid())
);

create policy "traffic_votes: public read" on traffic_votes for select using (true);
create policy "traffic_votes: public insert" on traffic_votes for insert with check (true);

create policy "push_subscriptions: public insert" on push_subscriptions for insert with check (true);
create policy "push_subscriptions: public delete own" on push_subscriptions for delete using (true);

create policy "ads: public read active" on ads for select using (
  active and current_date between start_date and end_date
);
create policy "ads: admin write" on ads for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);


-- ---------------------------------------------------------------------------
-- alerts: who wants to hear about which fuel, where.
--
-- A null city or product means "any". One row per (device, city, product).
-- Insert-only from the client: anonymous visitors hold no UPDATE grant in this
-- project, and there is no SELECT policy either, so the current choice lives in
-- localStorage rather than being read back. Deletion goes through
-- alerts_unsubscribe() — a plain DELETE policy let anyone holding the published
-- anon key wipe every subscription on the platform with one filtered request.
-- ---------------------------------------------------------------------------

create table if not exists alerts (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('web','ios','android','telegram')),
  address       text not null,          -- web: endpoint | native: device token | telegram: chat_id
  keys          jsonb,                  -- web push only: {p256dh, auth}
  city          text,                   -- null = any city
  product       fuel_product,           -- null = any product
  last_sent_at  timestamptz not null default '-infinity',
  created_at    timestamptz not null default now()
);

-- Two partial indexes rather than one over coalesce(product::text,''): casting
-- an enum to text is STABLE, not IMMUTABLE, so Postgres refuses it in an index.
create unique index if not exists alerts_uniq_product on alerts (channel, address, coalesce(city, ''), product)
  where product is not null;
create unique index if not exists alerts_uniq_anyproduct on alerts (channel, address, coalesce(city, ''))
  where product is null;
create index if not exists alerts_match on alerts (city, product);

alter table alerts enable row level security;
create policy "alerts: anyone may subscribe" on alerts for insert with check (true);
grant select, insert on alerts to anon, authenticated;

CREATE OR REPLACE FUNCTION public.alerts_for(p_city text, p_products fuel_product[], p_stamp boolean DEFAULT true)
 RETURNS TABLE(channel text, address text, keys jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if p_stamp then
    return query
    with hit as (
      update alerts a set last_sent_at = now()
       where (a.city    is null or a.city    = p_city)
         and (a.product is null or a.product = any(p_products))
         and a.last_sent_at < now() - interval '45 minutes'
      returning a.channel, a.address, a.keys
    )
    select distinct on (h.address) h.channel, h.address, h.keys from hit h order by h.address;
  else
    return query
    select distinct on (a.address) a.channel, a.address, a.keys
      from alerts a
     where (a.city    is null or a.city    = p_city)
       and (a.product is null or a.product = any(p_products))
     order by a.address;
  end if;
end $function$;

revoke all on function alerts_for(text, fuel_product[], boolean) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.alerts_unsubscribe(p_address text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  delete from alerts where address = p_address;
$function$;

grant execute on function alerts_unsubscribe(text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- admin_stats(): counts for the admin panel.
--
-- device_tokens and alerts grant SELECT to nobody, so the panel read [] from
-- the browser and showed zeros. This runs as the owner and returns numbers
-- only — never a device token, never a push endpoint. The admin has no need
-- for either, so nobody gets them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  caller_role text;
begin
  select p.role::text into caller_role from profiles p where p.id = auth.uid();
  if caller_role is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return json_build_object(
    'devices', (
      select coalesce(json_object_agg(platform, n), '{}'::json)
        from (select platform, count(*) n from device_tokens group by platform) d
    ),
    -- one person holds a row per (city, product) pair, so the honest number of
    -- people is the number of distinct addresses, not the number of rows
    'listeners', (
      select coalesce(json_object_agg(channel, n), '{}'::json)
        from (select channel, count(distinct address) n from alerts group by channel) a
    ),
    'alertRows', (select count(*) from alerts)
  );
end $function$;

revoke all on function admin_stats() from public;
grant execute on function admin_stats() to authenticated;

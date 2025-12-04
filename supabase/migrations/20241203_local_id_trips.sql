-- Trips table with local_id as unique identity and strict status enum
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null unique,
  employee_id text not null,
  vehicle_id text,
  status text not null check (status in ('created','in_progress','finalized')),
  initial_km numeric not null,
  final_km numeric,
  start_time timestamptz not null,
  end_time timestamptz,
  start_latitude double precision,
  start_longitude double precision,
  end_latitude double precision,
  end_longitude double precision,
  duration_seconds integer,
  origin text,
  destination text,
  reason text,
  notes text,
  employee_photo_url text,
  trip_photos_urls text[],
  is_rented_vehicle boolean default false,
  rented_plate text,
  rented_model text,
  rented_company text,
  device_id text,
  last_updated timestamptz not null default now()
);

-- Trip points with uniqueness per local_id + captured_at
create table if not exists public.trip_points (
  id uuid primary key default gen_random_uuid(),
  local_trip_id uuid not null,
  trip_id uuid references public.trips(id) on delete cascade,
  captured_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision,
  accuracy double precision,
  device_id text,
  needs_sync boolean default false,
  last_updated timestamptz not null default now(),
  unique (local_trip_id, captured_at)
);

-- Helpful index for sync
create index if not exists trip_points_local_time_idx on public.trip_points(local_trip_id, captured_at desc);

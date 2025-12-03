-- Add device_id to trips (tracks originating device)
alter table public.trips
add column if not exists device_id text;

-- Add device_id to trip_positions
alter table public.trip_positions
add column if not exists device_id text;

-- Rename columns in employees table
ALTER TABLE public.employees RENAME COLUMN matricula TO registration_id;
ALTER TABLE public.employees RENAME COLUMN nome_completo TO full_name;
ALTER TABLE public.employees RENAME COLUMN cargo TO position;

-- Rename columns in vehicles table
ALTER TABLE public.vehicles RENAME COLUMN placa TO license_plate;
ALTER TABLE public.vehicles RENAME COLUMN marca TO brand;
ALTER TABLE public.vehicles RENAME COLUMN modelo TO model;

-- Rename columns in trips table
ALTER TABLE public.trips RENAME COLUMN km_inicial TO initial_km;
ALTER TABLE public.trips RENAME COLUMN km_final TO final_km;
ALTER TABLE public.trips RENAME COLUMN origem TO origin;
ALTER TABLE public.trips RENAME COLUMN destino TO destination;
ALTER TABLE public.trips RENAME COLUMN motivo TO reason;
ALTER TABLE public.trips RENAME COLUMN observacao TO notes;
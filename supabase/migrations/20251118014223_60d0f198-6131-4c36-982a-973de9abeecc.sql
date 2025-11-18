-- Create employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula TEXT NOT NULL UNIQUE,
  nome_completo TEXT NOT NULL,
  cargo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create vehicles table
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa TEXT NOT NULL UNIQUE,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create trips table
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) NOT NULL,
  km_inicial NUMERIC NOT NULL,
  origem TEXT,
  destino TEXT,
  motivo TEXT,
  observacao TEXT,
  start_latitude NUMERIC,
  start_longitude NUMERIC,
  end_latitude NUMERIC,
  end_longitude NUMERIC,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizada')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Create policies for employees (publicly readable for now - can be restricted later)
CREATE POLICY "Anyone can view employees"
ON public.employees FOR SELECT
TO public
USING (true);

-- Create policies for vehicles (publicly readable for now - can be restricted later)
CREATE POLICY "Anyone can view vehicles"
ON public.vehicles FOR SELECT
TO public
USING (true);

-- Create policies for trips (publicly accessible for now - can be restricted later with auth)
CREATE POLICY "Anyone can view trips"
ON public.trips FOR SELECT
TO public
USING (true);

CREATE POLICY "Anyone can insert trips"
ON public.trips FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Anyone can update trips"
ON public.trips FOR UPDATE
TO public
USING (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trips_updated_at
BEFORE UPDATE ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Tabela para armazenar os pontos de rota durante a viagem
CREATE TABLE public.trip_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca por trip_id
CREATE INDEX idx_trip_positions_trip_id ON public.trip_positions(trip_id);

-- Índice para ordenação por timestamp
CREATE INDEX idx_trip_positions_captured_at ON public.trip_positions(captured_at);

-- Enable Row Level Security
ALTER TABLE public.trip_positions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view trip_positions" 
ON public.trip_positions 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert trip_positions" 
ON public.trip_positions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update trip_positions" 
ON public.trip_positions 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete trip_positions" 
ON public.trip_positions 
FOR DELETE 
USING (true);
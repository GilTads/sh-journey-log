-- Adicionar campos para veículos alugados/não cadastrados na tabela trips
ALTER TABLE public.trips 
ADD COLUMN is_rented_vehicle BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN rented_plate TEXT,
ADD COLUMN rented_model TEXT,
ADD COLUMN rented_company TEXT;

-- Criar constraint para garantir que quando is_rented_vehicle = true, vehicle_id seja nulo
-- e quando is_rented_vehicle = false, vehicle_id seja obrigatório
ALTER TABLE public.trips
ADD CONSTRAINT trips_vehicle_validation CHECK (
  (is_rented_vehicle = false AND vehicle_id IS NOT NULL AND rented_plate IS NULL AND rented_model IS NULL AND rented_company IS NULL)
  OR
  (is_rented_vehicle = true AND vehicle_id IS NULL AND (rented_plate IS NOT NULL OR rented_model IS NOT NULL))
);

-- Comentários para documentação
COMMENT ON COLUMN public.trips.is_rented_vehicle IS 'Indica se o veículo é alugado ou não cadastrado';
COMMENT ON COLUMN public.trips.rented_plate IS 'Placa do veículo alugado';
COMMENT ON COLUMN public.trips.rented_model IS 'Modelo/descrição do veículo alugado';
COMMENT ON COLUMN public.trips.rented_company IS 'Locadora ou proprietário do veículo alugado';
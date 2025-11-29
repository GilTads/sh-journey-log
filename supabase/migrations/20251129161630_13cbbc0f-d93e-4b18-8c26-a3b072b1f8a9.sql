-- Permitir vehicle_id como nulo quando is_rented_vehicle = true
ALTER TABLE public.trips 
ALTER COLUMN vehicle_id DROP NOT NULL;

-- Adicionar constraint para garantir que vehicle_id é obrigatório quando não for veículo alugado
-- Mas como CHECK constraints com condicionais podem ser problemáticas, usamos um trigger

CREATE OR REPLACE FUNCTION public.validate_trip_vehicle()
RETURNS TRIGGER AS $$
BEGIN
  -- Se não for veículo alugado, vehicle_id é obrigatório
  IF NEW.is_rented_vehicle = false AND NEW.vehicle_id IS NULL THEN
    RAISE EXCEPTION 'vehicle_id é obrigatório quando is_rented_vehicle é false';
  END IF;
  
  -- Se for veículo alugado, vehicle_id deve ser nulo
  IF NEW.is_rented_vehicle = true AND NEW.vehicle_id IS NOT NULL THEN
    RAISE EXCEPTION 'vehicle_id deve ser nulo quando is_rented_vehicle é true';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS validate_trip_vehicle_trigger ON public.trips;

-- Criar trigger para validação
CREATE TRIGGER validate_trip_vehicle_trigger
BEFORE INSERT OR UPDATE ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.validate_trip_vehicle();
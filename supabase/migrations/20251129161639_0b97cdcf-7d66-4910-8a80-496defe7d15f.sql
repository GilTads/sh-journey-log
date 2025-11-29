-- Corrigir search_path da função para segurança
CREATE OR REPLACE FUNCTION public.validate_trip_vehicle()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
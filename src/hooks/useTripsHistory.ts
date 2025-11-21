import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TripHistory {
  id: string;
  employee_id: string;
  vehicle_id: string;
  km_inicial: number;
  km_final: number | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  origem: string | null;
  destino: string | null;
  motivo: string | null;
  observacao: string | null;
  status: string | null;
  employee_photo_url: string | null;
  trip_photos_urls: string[] | null;
  employee?: {
    nome_completo: string;
    matricula: string;
  };
  vehicle?: {
    placa: string;
    marca: string;
    modelo: string;
  };
}

interface UseTripsHistoryParams {
  employeeId?: string;
  vehicleId?: string;
  startDate?: string;
  endDate?: string;
}

export const useTripsHistory = (params: UseTripsHistoryParams = {}) => {
  return useQuery({
    queryKey: ["trips-history", params],
    queryFn: async () => {
      let query = supabase
        .from("trips")
        .select(`
          *,
          employee:employees!trips_employee_id_fkey(nome_completo, matricula),
          vehicle:vehicles!trips_vehicle_id_fkey(placa, marca, modelo)
        `)
        .order("start_time", { ascending: false });

      if (params.employeeId) {
        query = query.eq("employee_id", params.employeeId);
      }

      if (params.vehicleId) {
        query = query.eq("vehicle_id", params.vehicleId);
      }

      if (params.startDate) {
        query = query.gte("start_time", params.startDate);
      }

      if (params.endDate) {
        query = query.lte("start_time", params.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as TripHistory[];
    },
  });
};

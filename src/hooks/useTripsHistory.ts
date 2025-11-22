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
  /** Permite habilitar/desabilitar a query (ex.: offline) */
  enabled?: boolean;
}

export const useTripsHistory = (params: UseTripsHistoryParams = {}) => {
  // separa o enabled do resto dos filtros
  const { enabled = true, ...filters } = params;

  return useQuery({
    queryKey: ["trips-history", filters],
    enabled, // <- agora o React Query respeita se deve ou não buscar
    queryFn: async () => {
      let query = supabase
        .from("trips")
        .select(`
          *,
          employee:employees!trips_employee_id_fkey(nome_completo, matricula),
          vehicle:vehicles!trips_vehicle_id_fkey(placa, marca, modelo)
        `)
        .order("start_time", { ascending: false });

      if (filters.employeeId) {
        query = query.eq("employee_id", filters.employeeId);
      }

      if (filters.vehicleId) {
        query = query.eq("vehicle_id", filters.vehicleId);
      }

      if (filters.startDate) {
        query = query.gte("start_time", filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte("start_time", filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as TripHistory[];
    },
  });
};

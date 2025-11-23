import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineData } from "@/contexts/OfflineContext";
import { OfflineTrip } from "@/hooks/useSQLite";

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
  enabled?: boolean;
}

// converte a trip do SQLite pro formato da tela
const mapOfflineTripToHistory = (trip: OfflineTrip): TripHistory => ({
  id: String(trip.id),
  employee_id: trip.employee_id,
  vehicle_id: trip.vehicle_id,
  km_inicial: trip.km_inicial,
  km_final: trip.km_final ?? null,
  start_time: trip.start_time,
  end_time: trip.end_time ?? null,
  duration_seconds: trip.duration_seconds ?? null,
  origem: trip.origem ?? null,
  destino: trip.destino ?? null,
  motivo: trip.motivo ?? null,
  observacao: trip.observacao ?? null,
  status: trip.status ?? null,
  employee_photo_url: null,
  trip_photos_urls: null,
  employee: undefined,
  vehicle: undefined,
});

export const useTripsHistory = (params: UseTripsHistoryParams = {}) => {
  const { enabled = true, ...filters } = params;

  const { isOnline, isReady, hasDb, getViagens } = useOfflineData();
  const isNative = Capacitor.isNativePlatform();

  return useQuery({
    queryKey: ["trips-history", filters, { isNative, isOnline }],
    enabled,
    queryFn: async () => {
      // caminho OFFLINE: app nativo, com SQLite pronto e sem internet
      if (isNative && !isOnline && isReady && hasDb) {
        console.log("[useTripsHistory] OFFLINE -> usando SQLite");

        let trips = await getViagens();

        if (filters.employeeId) {
          trips = trips.filter((t) => t.employee_id === filters.employeeId);
        }

        if (filters.vehicleId) {
          trips = trips.filter((t) => t.vehicle_id === filters.vehicleId);
        }

        if (filters.startDate) {
          const start = new Date(filters.startDate).getTime();
          trips = trips.filter(
            (t) => new Date(t.start_time).getTime() >= start
          );
        }

        if (filters.endDate) {
          const end = new Date(filters.endDate).getTime();
          trips = trips.filter(
            (t) => new Date(t.start_time).getTime() <= end
          );
        }

        trips.sort(
          (a, b) =>
            new Date(b.start_time).getTime() -
            new Date(a.start_time).getTime()
        );

        return trips.map(mapOfflineTripToHistory);
      }

      // caminho ONLINE (web ou app com internet): Supabase
      console.log("[useTripsHistory] ONLINE -> usando Supabase");

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

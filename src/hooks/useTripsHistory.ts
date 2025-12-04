import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineData } from "@/contexts/OfflineContext";
import { OfflineTrip, OfflineEmployee, OfflineVehicle } from "@/hooks/useSQLite";

export type SyncStatus = "synced" | "offline-only";
export type TripStatus =
  | "em_andamento"
  | "in_progress"
  | "finalizada"
  | "finalized"
  | "created"
  | "all";

export interface TripHistory {
  id: string; // server_id ou local_id como fallback
  local_id?: string;
  employee_id: string;
  vehicle_id: string | null;
  initial_km: number;
  final_km: number | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  origin: string | null;
  destination: string | null;
  reason: string | null;
  notes: string | null;
  status: string | null;
  employee_photo_url: string | null;
  trip_photos_urls: string[] | null;
  server_trip_id?: string | null;
  device_id?: string | null;

  // Rented vehicle fields
  is_rented_vehicle: boolean;
  rented_plate: string | null;
  rented_model: string | null;
  rented_company: string | null;

  // Sync status (only for offline trips)
  sync_status: SyncStatus;

  employee?: {
    full_name: string;
    registration_id: string;
  };
  vehicle?: {
    license_plate: string;
    brand: string;
    model: string;
  };
}

interface UseTripsHistoryParams {
  employeeId?: string;
  vehicleId?: string;
  startDate?: string;
  endDate?: string;
  statusFilter?: TripStatus;
  syncStatusFilter?: SyncStatus | "all";
  enabled?: boolean;
}

const normalizeStatus = (status?: string | null) => {
  const s = (status || "").toLowerCase();
  if (s === "em_andamento" || s === "in_progress") return "in_progress";
  if (s === "finalizada" || s === "finalized") return "finalized";
  if (s === "created") return "created";
  return s || "created";
};

const statusRank = (s: string) => {
  const st = normalizeStatus(s);
  if (st === "finalized") return 3;
  if (st === "in_progress") return 2;
  return 1; // created/default
};

const dedupeTrips = (trips: OfflineTrip[]): OfflineTrip[] => {
  const byKey = new Map<string, OfflineTrip>();

  for (const t of trips) {
    const key = t.local_id || t.server_trip_id || t.id || `${t.start_time}-${t.employee_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, t);
      continue;
    }
    // decide winner: higher status rank, then newer last_updated/start_time
    const rankNew = statusRank(t.status || "");
    const rankOld = statusRank(existing.status || "");
    const tsNew = new Date(t.last_updated ?? t.end_time ?? t.start_time).getTime();
    const tsOld = new Date(existing.last_updated ?? existing.end_time ?? existing.start_time).getTime();

    if (rankNew > rankOld || (rankNew === rankOld && tsNew >= tsOld)) {
      byKey.set(key, t);
    }
  }

  return Array.from(byKey.values());
};

// Convert SQLite trip to UI format (without join)
const mapOfflineTripBase = (trip: OfflineTrip): TripHistory => ({
  id: trip.server_trip_id || trip.local_id || "",
  local_id: trip.local_id,
  employee_id: trip.employee_id,
  vehicle_id: trip.vehicle_id ?? null,
  initial_km: trip.initial_km,
  final_km: trip.final_km ?? null,
  start_time: trip.start_time,
  end_time: trip.end_time ?? null,
  duration_seconds: trip.duration_seconds ?? null,
  origin: trip.origin ?? null,
  destination: trip.destination ?? null,
  reason: trip.reason ?? null,
  notes: trip.notes ?? null,
  status: normalizeStatus(trip.status),
  server_trip_id: trip.server_trip_id ?? null,
  // Offline trips store base64, not URL - set to null for UI display
  employee_photo_url: null,
  trip_photos_urls: null,
  device_id: trip.device_id ?? null,
  // Rented vehicle
  is_rented_vehicle: trip.is_rented_vehicle === 1,
  rented_plate: trip.rented_plate ?? null,
  rented_model: trip.rented_model ?? null,
  rented_company: trip.rented_company ?? null,
  // Sync status based on needs_sync flag
  sync_status: trip.needs_sync === 0 ? "synced" : "offline-only",
});

export const useTripsHistory = (params: UseTripsHistoryParams = {}) => {
  const { enabled = true, statusFilter, syncStatusFilter, ...filters } = params;

  const { isOnline, isReady, hasDb, getViagens, getMotoristas, getVeiculos } =
    useOfflineData();

  const isNative = Capacitor.isNativePlatform();
  const sqliteReady = isNative && isReady && hasDb;

  const queryEnabled = enabled && (sqliteReady || (!isNative && isOnline));

  console.log("[useTripsHistory] State:", {
    isNative,
    isOnline,
    isReady,
    hasDb,
    sqliteReady,
    queryEnabled,
  });

  const loadOfflineTrips = async (): Promise<TripHistory[]> => {
    if (!sqliteReady) return [];

    try {
      let trips = await getViagens();
      // remove deletados ou sem local_id
      trips = trips.filter((t) => !t.deleted && t.local_id);

      if (filters.employeeId) {
        trips = trips.filter((t) => t.employee_id === filters.employeeId);
      }
      if (filters.vehicleId) {
        trips = trips.filter((t) => t.vehicle_id === filters.vehicleId);
      }
      if (filters.startDate) {
        const start = new Date(`${filters.startDate}T00:00:00`).getTime();
        trips = trips.filter((t) => new Date(t.start_time).getTime() >= start);
      }
      if (filters.endDate) {
        const end = new Date(`${filters.endDate}T23:59:59.999`).getTime();
        trips = trips.filter((t) => new Date(t.start_time).getTime() <= end);
      }
      const normalizedFilter = statusFilter && statusFilter !== "all" ? normalizeStatus(statusFilter) : null;
      if (normalizedFilter) {
        trips = trips.filter((t) => normalizeStatus(t.status) === normalizedFilter);
      }
      if (syncStatusFilter && syncStatusFilter !== "all") {
        if (syncStatusFilter === "synced") {
          trips = trips.filter((t) => t.needs_sync === 0);
        } else if (syncStatusFilter === "offline-only") {
          trips = trips.filter((t) => t.needs_sync !== 0);
        }
      }

      trips = dedupeTrips(trips);

      trips.sort(
        (a, b) =>
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      );

      const employees: OfflineEmployee[] = await getMotoristas();
      const vehicles: OfflineVehicle[] = await getVeiculos();

      return trips.map((trip) => {
        const base = mapOfflineTripBase(trip);
        const emp = employees.find((e) => e.id === trip.employee_id);
        const veh = trip.vehicle_id
          ? vehicles.find((v) => v.id === trip.vehicle_id)
          : undefined;

        return {
          ...base,
          employee: emp
            ? {
                full_name: emp.full_name,
                registration_id: emp.registration_id,
              }
            : undefined,
          vehicle: veh
            ? {
                license_plate: veh.license_plate,
                brand: veh.brand,
                model: veh.model,
              }
            : undefined,
        };
      });
    } catch (err) {
      console.error("[useTripsHistory] Error loading from SQLite:", err);
      return [];
    }
  };

  return useQuery({
    queryKey: [
      "trips-history",
      filters,
      statusFilter,
      syncStatusFilter,
      { isNative, isOnline, isReady, hasDb },
    ],
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 5,
    // Permite rodar mesmo offline (React Query normalmente pausa)
    networkMode: "always",
    queryFn: async () => {
      // 1) Sempre tenta SQLite primeiro
      if (sqliteReady) {
        console.log("[useTripsHistory] ✅ Lendo histórico do SQLite (offline-first)");
        const offlineTrips = await loadOfflineTrips();

        // 2) Se achou algo no SQLite, retorna direto (online ou offline)
        if (offlineTrips.length > 0) {
          return offlineTrips;
        }

        // 3) SQLite pronto mas vazio
        if (!isOnline) {
          console.log("[useTripsHistory] ⚠️ SQLite vazio e offline -> lista vazia");
          return [];
        }
        console.log("[useTripsHistory] ⚠️ SQLite vazio, usando Supabase como fallback web");
      } else {
        // 4) SQLite não pronto
        if (!isOnline) {
          console.log("[useTripsHistory] ⚠️ SQLite indisponível e offline -> lista vazia");
          return [];
        }
        console.log("[useTripsHistory] ⚠️ SQLite indisponível, usando Supabase como fallback web");
      }

      // Fallback web (quando online) com os mesmos filtros
      let query = supabase
        .from("trips")
        .select(`
          *,
          employee:employees!trips_employee_id_fkey(full_name, registration_id),
          vehicle:vehicles!trips_vehicle_id_fkey(license_plate, brand, model)
        `)
        .order("start_time", { ascending: false });

      if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
      if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
      if (filters.startDate) query = query.gte("start_time", `${filters.startDate} 00:00:00`);
      if (filters.endDate) query = query.lte("start_time", `${filters.endDate} 23:59:59`);
      const normalizedFilter = statusFilter && statusFilter !== "all" ? normalizeStatus(statusFilter) : null;
      if (normalizedFilter) query = query.eq("status", normalizedFilter);

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((trip: any) => ({
        id: trip.id,
        server_trip_id: trip.id,
        employee_id: trip.employee_id,
        vehicle_id: trip.vehicle_id,
        initial_km: trip.initial_km,
        final_km: trip.final_km,
        start_time: trip.start_time,
        end_time: trip.end_time,
        duration_seconds: trip.duration_seconds,
        origin: trip.origin,
        destination: trip.destination,
        reason: trip.reason,
        notes: trip.notes,
        status: normalizeStatus(trip.status),
        employee_photo_url: trip.employee_photo_url,
        trip_photos_urls: trip.trip_photos_urls,
        is_rented_vehicle: trip.is_rented_vehicle ?? false,
        rented_plate: trip.rented_plate,
        rented_model: trip.rented_model,
        rented_company: trip.rented_company,
        device_id: trip.device_id ?? null,
        sync_status: "synced" as SyncStatus,
        employee: trip.employee,
        vehicle: trip.vehicle,
      }));
    },
  });
};

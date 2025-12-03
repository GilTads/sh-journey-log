import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineData } from "@/contexts/OfflineContext";
import { OfflineTrip, OfflineEmployee, OfflineVehicle } from "@/hooks/useSQLite";

export type SyncStatus = "synced" | "offline-only";
export type TripStatus = "em_andamento" | "finalizada" | "all";

export interface TripHistory {
  id: string;
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

// Convert SQLite trip to UI format (without join)
const mapOfflineTripBase = (trip: OfflineTrip): TripHistory => ({
  id: String(trip.id),
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
  status: trip.status ?? null,
  // Offline trips store base64, not URL - set to null for UI display
  employee_photo_url: null,
  trip_photos_urls: null,
  // Rented vehicle
  is_rented_vehicle: trip.is_rented_vehicle === 1,
  rented_plate: trip.rented_plate ?? null,
  rented_model: trip.rented_model ?? null,
  rented_company: trip.rented_company ?? null,
  // Sync status based on synced flag
  sync_status: trip.synced === 1 ? "synced" : "offline-only",
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
      if (statusFilter && statusFilter !== "all") {
        trips = trips.filter((t) => t.status === statusFilter);
      }
      if (syncStatusFilter && syncStatusFilter !== "all") {
        if (syncStatusFilter === "synced") {
          trips = trips.filter((t) => t.synced === 1);
        } else if (syncStatusFilter === "offline-only") {
          trips = trips.filter((t) => t.synced === 0);
        }
      }

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
      const useOfflineOnly = isNative && !isOnline && sqliteReady;
      const useOnlineWithPending = isOnline;

      console.log("[useTripsHistory] queryFn executing:", {
        useOfflineOnly,
        useOnlineWithPending,
        syncStatusFilter,
      });

      // PATH 1: OFFLINE ONLY (SQLite)
      if (useOfflineOnly) {
        console.log("[useTripsHistory] ✅ OFFLINE -> Fetching from SQLite");

        return await loadOfflineTrips();
      }

      // PATH 2: ONLINE (Supabase + SQLite pending)
      if (useOnlineWithPending) {
        console.log("[useTripsHistory] ✅ ONLINE -> Hybrid mode Supabase + SQLite");

        try {
          let supabaseTrips: TripHistory[] = [];
          let sqliteTrips: TripHistory[] = [];

          // Filter = "Pending" -> fetch ONLY from SQLite (synced=0)
          if (syncStatusFilter === "offline-only") {
            console.log("[useTripsHistory] Filter Pending -> fetching ONLY SQLite (synced=0)");
            
            if (sqliteReady) {
              let trips = await getViagens();
              trips = trips.filter((t) => t.synced === 0);

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
              if (statusFilter && statusFilter !== "all") {
                trips = trips.filter((t) => t.status === statusFilter);
              }

              trips.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

              const employees: OfflineEmployee[] = await getMotoristas();
              const vehicles: OfflineVehicle[] = await getVeiculos();

              sqliteTrips = trips.map((trip) => {
                const base = mapOfflineTripBase(trip);
                const emp = employees.find((e) => e.id === trip.employee_id);
                const veh = trip.vehicle_id ? vehicles.find((v) => v.id === trip.vehicle_id) : undefined;

                return {
                  ...base,
                  sync_status: "offline-only" as SyncStatus,
                  employee: emp ? { full_name: emp.full_name, registration_id: emp.registration_id } : undefined,
                  vehicle: veh ? { license_plate: veh.license_plate, brand: veh.brand, model: veh.model } : undefined,
                };
              });

              console.log("[useTripsHistory] ✅ Pending (synced=0):", sqliteTrips.length);
            }
          }
          // Filter = "Synced" -> fetch ONLY from Supabase
          else if (syncStatusFilter === "synced") {
            console.log("[useTripsHistory] Filter Synced -> fetching ONLY Supabase");
            
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
            if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);

            const { data, error } = await query;
            if (error) throw error;

            supabaseTrips = (data || []).map((trip: any) => ({
              id: trip.id,
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
              status: trip.status,
              employee_photo_url: trip.employee_photo_url,
              trip_photos_urls: trip.trip_photos_urls,
              is_rented_vehicle: trip.is_rented_vehicle ?? false,
              rented_plate: trip.rented_plate,
              rented_model: trip.rented_model,
              rented_company: trip.rented_company,
              sync_status: "synced" as SyncStatus,
              employee: trip.employee,
              vehicle: trip.vehicle,
            }));

            console.log("[useTripsHistory] ✅ Synced:", supabaseTrips.length);
          }
          // Filter = "All" or none -> fetch Supabase + SQLite pending
          else {
            console.log("[useTripsHistory] Filter All -> fetching Supabase + SQLite pending");

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
            if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);

            const { data, error } = await query;
            if (error) throw error;

            supabaseTrips = (data || []).map((trip: any) => ({
              id: trip.id,
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
              status: trip.status,
              employee_photo_url: trip.employee_photo_url,
              trip_photos_urls: trip.trip_photos_urls,
              is_rented_vehicle: trip.is_rented_vehicle ?? false,
              rented_plate: trip.rented_plate,
              rented_model: trip.rented_model,
              rented_company: trip.rented_company,
              sync_status: "synced" as SyncStatus,
              employee: trip.employee,
              vehicle: trip.vehicle,
            }));

            // Fetch pending from SQLite
            if (sqliteReady) {
              let trips = await getViagens();
              trips = trips.filter((t) => t.synced === 0);

              if (filters.employeeId) trips = trips.filter((t) => t.employee_id === filters.employeeId);
              if (filters.vehicleId) trips = trips.filter((t) => t.vehicle_id === filters.vehicleId);
              if (filters.startDate) {
                const start = new Date(`${filters.startDate}T00:00:00`).getTime();
                trips = trips.filter((t) => new Date(t.start_time).getTime() >= start);
              }
              if (filters.endDate) {
                const end = new Date(`${filters.endDate}T23:59:59.999`).getTime();
                trips = trips.filter((t) => new Date(t.start_time).getTime() <= end);
              }
              if (statusFilter && statusFilter !== "all") {
                trips = trips.filter((t) => t.status === statusFilter);
              }

              const employees: OfflineEmployee[] = await getMotoristas();
              const vehicles: OfflineVehicle[] = await getVeiculos();

              sqliteTrips = trips.map((trip) => {
                const base = mapOfflineTripBase(trip);
                const emp = employees.find((e) => e.id === trip.employee_id);
                const veh = trip.vehicle_id ? vehicles.find((v) => v.id === trip.vehicle_id) : undefined;

                return {
                  ...base,
                  employee: emp ? { full_name: emp.full_name, registration_id: emp.registration_id } : undefined,
                  vehicle: veh ? { license_plate: veh.license_plate, brand: veh.brand, model: veh.model } : undefined,
                };
              });
            }

            console.log("[useTripsHistory] ✅ Supabase:", supabaseTrips.length, "SQLite pending:", sqliteTrips.length);
          }

          // Merge and sort
          // Deduplica: se há uma trip local pendente com mesmo server_trip_id, prioriza a local (status mais recente)
          const mergedByServerId = new Map<string, TripHistory>();

          // Primeiro, coloca trips do Supabase
          for (const trip of supabaseTrips) {
            if (trip.id) mergedByServerId.set(trip.id, trip);
          }

          // Depois, pendentes locais: se tem server_trip_id, sobrescreve a versão do Supabase
          for (const trip of sqliteTrips) {
            if (trip.sync_status === "offline-only" && (trip as any).server_trip_id) {
              mergedByServerId.set((trip as any).server_trip_id, trip);
            } else {
              // Trips locais sem server_trip_id: usa id numérico como chave única
              mergedByServerId.set(`local-${trip.id}`, trip);
            }
          }

          const allTrips = Array.from(mergedByServerId.values());
          allTrips.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

          console.log("[useTripsHistory] ✅ Total combined:", allTrips.length);
          return allTrips;
        } catch (err) {
          console.error("[useTripsHistory] ❌ Error fetching online data:", err);
          // Fallback to SQLite to avoid UI error when offline or Supabase falha
          const offline = await loadOfflineTrips();
          return offline;
        }
      }

      return [];
    },
  });
};

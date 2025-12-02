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

  // Rented vehicle fields
  is_rented_vehicle: boolean;
  rented_plate: string | null;
  rented_model: string | null;
  rented_company: string | null;

  // Sync status (only for offline trips)
  sync_status: SyncStatus;

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
  statusFilter?: TripStatus;
  syncStatusFilter?: SyncStatus | "all";
  enabled?: boolean;
}

// Converte trip do SQLite para formato da UI (SEM join ainda)
const mapOfflineTripBase = (trip: OfflineTrip): TripHistory => ({
  id: String(trip.id),
  employee_id: trip.employee_id,
  vehicle_id: trip.vehicle_id ?? null,
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

  // ✅ LÓGICA SIMPLIFICADA E CLARA:
  // - Nativo + SQLite pronto → sempre pode executar (online ou offline)
  // - Web + online → pode executar
  // - Web + offline → não executa (retorna vazio)
  const queryEnabled = enabled && (sqliteReady || (!isNative && isOnline));

  console.log("[useTripsHistory] Estado:", {
    isNative,
    isOnline,
    isReady,
    hasDb,
    sqliteReady,
    queryEnabled,
  });

  return useQuery({
    queryKey: [
      "trips-history",
      filters,
      statusFilter,
      syncStatusFilter,
      // Incluir todos os estados que afetam a lógica
      { isNative, isOnline, isReady, hasDb },
    ],
    enabled: queryEnabled,
    // Evita refetch automático que pode causar problemas de timing
    staleTime: 1000 * 60 * 5, // 5 minutos
    queryFn: async () => {
      // ========================================
      // DECISÃO CLARA: OFFLINE ou ONLINE?
      // ========================================
      
      // ✅ Nativo + sem internet → usa SOMENTE SQLite
      const useOfflineOnly = isNative && !isOnline && sqliteReady;
      
      // ✅ Online → pode usar Supabase + SQLite pendentes
      const useOnlineWithPending = isOnline;

      console.log("[useTripsHistory] queryFn executando:", {
        useOfflineOnly,
        useOnlineWithPending,
        syncStatusFilter,
      });

      // ========================================
      // CAMINHO 1: OFFLINE PURO (SQLite apenas)
      // ========================================
      if (useOfflineOnly) {
        console.log("[useTripsHistory] ✅ OFFLINE -> Buscando do SQLite");

        try {
          // Busca todas as viagens do SQLite
          let trips = await getViagens();
          console.log("[useTripsHistory] SQLite retornou", trips.length, "viagens");

          // ======= FILTROS =======
          
          // Filtro por motorista
          if (filters.employeeId) {
            trips = trips.filter((t) => t.employee_id === filters.employeeId);
          }

          // Filtro por veículo
          if (filters.vehicleId) {
            trips = trips.filter((t) => t.vehicle_id === filters.vehicleId);
          }

          // Filtro por data inicial
          if (filters.startDate) {
            const start = new Date(`${filters.startDate}T00:00:00`).getTime();
            trips = trips.filter(
              (t) => new Date(t.start_time).getTime() >= start
            );
          }

          // Filtro por data final
          if (filters.endDate) {
            const end = new Date(`${filters.endDate}T23:59:59.999`).getTime();
            trips = trips.filter(
              (t) => new Date(t.start_time).getTime() <= end
            );
          }

          // Filtro por status da viagem
          if (statusFilter && statusFilter !== "all") {
            trips = trips.filter((t) => t.status === statusFilter);
          }

          // Filtro por status de sincronização
          if (syncStatusFilter && syncStatusFilter !== "all") {
            if (syncStatusFilter === "synced") {
              trips = trips.filter((t) => t.synced === 1);
            } else if (syncStatusFilter === "offline-only") {
              trips = trips.filter((t) => t.synced === 0);
            }
          }

          // Ordena por data decrescente
          trips.sort(
            (a, b) =>
              new Date(b.start_time).getTime() -
              new Date(a.start_time).getTime()
          );

          console.log("[useTripsHistory] Após filtros:", trips.length, "viagens");

          // ======= JOIN MANUAL COM EMPLOYEES E VEHICLES =======
          const employees: OfflineEmployee[] = await getMotoristas();
          const vehicles: OfflineVehicle[] = await getVeiculos();

          console.log("[useTripsHistory] JOIN manual com", employees.length, "employees e", vehicles.length, "vehicles");

          const enriched: TripHistory[] = trips.map((trip) => {
            const base = mapOfflineTripBase(trip);

            const emp = employees.find((e) => e.id === trip.employee_id);
            const veh = trip.vehicle_id
              ? vehicles.find((v) => v.id === trip.vehicle_id)
              : undefined;

            return {
              ...base,
              employee: emp
                ? {
                    nome_completo: emp.nome_completo,
                    matricula: emp.matricula,
                  }
                : undefined,
              vehicle: veh
                ? {
                    placa: veh.placa,
                    marca: veh.marca,
                    modelo: veh.modelo,
                  }
                : undefined,
            };
          });

          console.log("[useTripsHistory] ✅ Retornando", enriched.length, "viagens do SQLite");
          return enriched;

        } catch (err) {
          console.error("[useTripsHistory] ❌ Erro ao buscar do SQLite:", err);
          return [];
        }
      }

      // ========================================
      // CAMINHO 2: ONLINE (Supabase + SQLite pendentes)
      // ========================================
      if (useOnlineWithPending) {
        console.log("[useTripsHistory] ✅ ONLINE -> Modo híbrido Supabase + SQLite");

        try {
          let supabaseTrips: TripHistory[] = [];
          let sqliteTrips: TripHistory[] = [];

          // ========================================
          // DECISÃO BASEADA NO FILTRO DE SINCRONIZAÇÃO
          // ========================================
          
          // ✅ PROBLEMA 1: Filtro = "Pendentes" → buscar SOMENTE do SQLite (synced=0)
          if (syncStatusFilter === "offline-only") {
            console.log("[useTripsHistory] Filtro Pendentes → buscando SOMENTE SQLite (synced=0)");
            
            if (sqliteReady) {
              let trips = await getViagens();
              
              // ✅ Filtrar RIGOROSAMENTE apenas pendentes (synced = 0)
              trips = trips.filter((t) => t.synced === 0);

              // Aplicar filtros adicionais
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

              // JOIN manual
              const employees: OfflineEmployee[] = await getMotoristas();
              const vehicles: OfflineVehicle[] = await getVeiculos();

              sqliteTrips = trips.map((trip) => {
                const base = mapOfflineTripBase(trip);
                const emp = employees.find((e) => e.id === trip.employee_id);
                const veh = trip.vehicle_id ? vehicles.find((v) => v.id === trip.vehicle_id) : undefined;

                return {
                  ...base,
                  sync_status: "offline-only" as SyncStatus, // ✅ Garante que é pendente
                  employee: emp ? { nome_completo: emp.nome_completo, matricula: emp.matricula } : undefined,
                  vehicle: veh ? { placa: veh.placa, marca: veh.marca, modelo: veh.modelo } : undefined,
                };
              });

              console.log("[useTripsHistory] ✅ Pendentes (synced=0):", sqliteTrips.length);
            }
          }
          
          // CASO 2: Filtro = "Sincronizados" → buscar SOMENTE do Supabase
          else if (syncStatusFilter === "synced") {
            console.log("[useTripsHistory] Filtro Sincronizados → buscando SOMENTE Supabase");
            
            let query = supabase
              .from("trips")
              .select(`
                *,
                employee:employees!trips_employee_id_fkey(nome_completo, matricula),
                vehicle:vehicles!trips_vehicle_id_fkey(placa, marca, modelo)
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
              km_inicial: trip.km_inicial,
              km_final: trip.km_final,
              start_time: trip.start_time,
              end_time: trip.end_time,
              duration_seconds: trip.duration_seconds,
              origem: trip.origem,
              destino: trip.destino,
              motivo: trip.motivo,
              observacao: trip.observacao,
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

            console.log("[useTripsHistory] ✅ Sincronizados:", supabaseTrips.length);
          }
          
          // CASO 3: Filtro = "Todos" ou nenhum → buscar Supabase + SQLite pendentes
          else {
            console.log("[useTripsHistory] Filtro Todos → buscando Supabase + SQLite pendentes");

            // Buscar do Supabase
            let query = supabase
              .from("trips")
              .select(`
                *,
                employee:employees!trips_employee_id_fkey(nome_completo, matricula),
                vehicle:vehicles!trips_vehicle_id_fkey(placa, marca, modelo)
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
              km_inicial: trip.km_inicial,
              km_final: trip.km_final,
              start_time: trip.start_time,
              end_time: trip.end_time,
              duration_seconds: trip.duration_seconds,
              origem: trip.origem,
              destino: trip.destino,
              motivo: trip.motivo,
              observacao: trip.observacao,
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

            // Buscar pendentes do SQLite
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
                  employee: emp ? { nome_completo: emp.nome_completo, matricula: emp.matricula } : undefined,
                  vehicle: veh ? { placa: veh.placa, marca: veh.marca, modelo: veh.modelo } : undefined,
                };
              });
            }

            console.log("[useTripsHistory] ✅ Supabase:", supabaseTrips.length, "SQLite pendentes:", sqliteTrips.length);
          }

          // ========================================
          // MERGE E ORDENAÇÃO FINAL
          // ========================================
          const allTrips = [...supabaseTrips, ...sqliteTrips];
          allTrips.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

          console.log("[useTripsHistory] ✅ Total combinado:", allTrips.length);
          return allTrips;

        } catch (err) {
          console.error("[useTripsHistory] ❌ Erro ao buscar dados online:", err);
          throw err;
        }
      }

      // ========================================
      // FALLBACK: Web offline ou condições não atendidas
      // ========================================
      console.warn("[useTripsHistory] ⚠️ Nenhuma fonte disponível (web offline ou erro de estado)");
      return [];
    },
  });
};

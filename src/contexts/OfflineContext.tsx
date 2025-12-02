// src/contexts/OfflineContext.tsx
import React,
{
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import {
  useSQLite,
  OfflineEmployee,
  OfflineVehicle,
  OfflineTrip,
  OfflineTripPosition,
} from "@/hooks/useSQLite";
import { supabase } from "@/integrations/supabase/client";
import { useTrips } from "@/hooks/useTrips";
import { toast } from "sonner";

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;

  getMotoristas: (filtro?: string) => Promise<OfflineEmployee[]>;
  getVeiculos: (filtro?: string) => Promise<OfflineVehicle[]>;
  getViagens: () => Promise<OfflineTrip[]>;
  getOngoingTrip: () => Promise<OfflineTrip | null>;

  syncNow: () => Promise<void>;

  // Trip positions
  saveTripPosition: (position: OfflineTripPosition) => Promise<boolean>;
  syncTripPositionsToServer: (serverTripId: string, positions: OfflineTripPosition[]) => Promise<void>;

  isReady: boolean;
  hasDb: boolean;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [hasInitialSyncRun, setHasInitialSyncRun] = useState(false);

  const {
    isReady,
    hasDb,
    saveEmployees,
    getEmployees,
    saveVehicles,
    getVehicles,
    getUnsyncedTrips,
    getAllTrips,
    getOngoingTrip: getOngoingTripSQLite,
    markTripAsSynced,
    replaceSyncedTripsFromServer,
    saveTripPosition: saveTripPositionSQLite,
    getUnsyncedTripPositions,
    markTripPositionAsSynced,
    updateTripPositionsServerTripId,
    getTripPositionsByLocalTripId,
  } = useSQLite();

  const { uploadPhoto, createTrip } = useTrips();

  // ========= utils =========
  const base64ToFile = (base64: string, filename: string): File => {
    const arr = base64.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  // ========= sincronização master data (Supabase -> SQLite) =========
  const syncMasterData = useCallback(async () => {
    if (!isOnline || !isReady) {
      console.log(
        "[OfflineContext] syncMasterData abortado -> isOnline:",
        isOnline,
        "isReady:",
        isReady
      );
      return;
    }

    try {
      console.log("[OfflineContext] Sincronizando employees/vehicles/trips...");

      // EMPLOYEES
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("*")
        .order("nome_completo");

      if (empError) {
        console.error("[OfflineContext] Erro ao buscar employees:", empError);
      } else if (employees) {
        await saveEmployees(employees as OfflineEmployee[]);
        console.log(
          `[OfflineContext] ${employees.length} employees salvos no SQLite`
        );
      }

      // VEHICLES
      const { data: vehicles, error: vehError } = await supabase
        .from("vehicles")
        .select("*")
        .order("placa");

      if (vehError) {
        console.error("[OfflineContext] Erro ao buscar vehicles:", vehError);
      } else if (vehicles) {
        await saveVehicles(vehicles as OfflineVehicle[]);
        console.log(
          `[OfflineContext] ${vehicles.length} vehicles salvos no SQLite`
        );
      }

      // TRIPS – histórico completo vindo do Supabase
      const { data: trips, error: tripsError } = await supabase
        .from("trips")
        .select("*")
        .order("start_time", { ascending: false });

      if (tripsError) {
        console.error("[OfflineContext] Erro ao buscar trips:", tripsError);
      } else if (trips) {
        await replaceSyncedTripsFromServer(trips);
        console.log(
          `[OfflineContext] ${trips.length} trips do servidor salvas no SQLite`
        );
      }
    } catch (err) {
      console.error("[OfflineContext] Erro em syncMasterData:", err);
      throw err;
    }
  }, [isOnline, isReady, saveEmployees, saveVehicles, replaceSyncedTripsFromServer]);

  // ========= sincronização trips pendentes (SQLite -> Supabase) =========
  const syncTripsToServer = useCallback(async () => {
    if (!isOnline || !isReady) {
      console.log(
        "[OfflineContext] syncTripsToServer abortado -> isOnline:",
        isOnline,
        "isReady:",
        isReady
      );
      return;
    }

    try {
      const unsynced = await getUnsyncedTrips();
      if (!unsynced.length) {
        console.log("[OfflineContext] Nenhuma trip pendente para sync");
        return;
      }

      console.log(
        `[OfflineContext] Enviando ${unsynced.length} trips pendentes para o servidor...`
      );

      for (const trip of unsynced) {
        try {
          let employeePhotoUrl: string | null = null;
          if (trip.employee_photo_base64) {
            const photoFile = base64ToFile(
              trip.employee_photo_base64,
              `employee_${trip.employee_id}.jpg`
            );
            const photoPath = `employees/${trip.employee_id}/${Date.now()}.jpg`;
            employeePhotoUrl = await uploadPhoto(photoFile, photoPath);
          }

          const tripPhotosUrls: string[] = [];
          if (trip.trip_photos_base64) {
            const photosArray = JSON.parse(
              trip.trip_photos_base64
            ) as string[];
            for (let i = 0; i < photosArray.length; i++) {
              const photoFile = base64ToFile(
                photosArray[i],
                `trip_${trip.id}_${i}.jpg`
              );
              const photoPath = `trips/${Date.now()}_${i}.jpg`;
              const url = await uploadPhoto(photoFile, photoPath);
              if (url) tripPhotosUrls.push(url);
            }
          }

          // ✅ GARANTIR que status finalizada seja sempre enviado corretamente
          const record = {
            employee_id: trip.employee_id,
            vehicle_id: trip.vehicle_id ?? null,
            km_inicial: trip.km_inicial,
            km_final: trip.km_final ?? null,
            start_time: trip.start_time,
            end_time: trip.end_time ?? null,
            start_latitude: trip.start_latitude,
            start_longitude: trip.start_longitude,
            end_latitude: trip.end_latitude,
            end_longitude: trip.end_longitude,
            duration_seconds: trip.duration_seconds,
            origem: trip.origem ?? null,
            destino: trip.destino ?? null,
            motivo: trip.motivo ?? null,
            observacao: trip.observacao ?? null,
            status: trip.status || "finalizada", // ✅ Garante que sempre tem status
            employee_photo_url: employeePhotoUrl || undefined,
            trip_photos_urls:
              tripPhotosUrls.length > 0 ? tripPhotosUrls : undefined,
            is_rented_vehicle: trip.is_rented_vehicle === 1,
            rented_plate: trip.rented_plate ?? null,
            rented_model: trip.rented_model ?? null,
            rented_company: trip.rented_company ?? null,
          };

          console.log(`[OfflineContext] Sincronizando trip ${trip.id} com status: ${record.status}`);

          const { data, error } = await createTrip(record);
          
          if (!error && data?.id) {
            // Marca a trip como sincronizada
            await markTripAsSynced(trip.id!);
            console.log(
              `[OfflineContext] ✅ Trip ${trip.id} sincronizada com sucesso, server ID: ${data.id}, status: ${data.status}`
            );

            // Atualiza as posições dessa viagem com o server_trip_id
            const localTripId = trip.id!;
            const serverTripId = data.id;
            
            await updateTripPositionsServerTripId(localTripId, serverTripId);
            console.log(
              `[OfflineContext] Posições da trip ${localTripId} atualizadas com server_trip_id: ${serverTripId}`
            );
          } else if (error) {
            console.error(
              "[OfflineContext] Erro ao sincronizar trip no Supabase:",
              error
            );
          }
        } catch (err) {
          console.error(
            "[OfflineContext] Erro ao sincronizar trip individual:",
            err
          );
        }
      }
    } catch (err) {
      console.error("[OfflineContext] Erro em syncTripsToServer:", err);
      throw err;
    }
  }, [isOnline, isReady, getUnsyncedTrips, uploadPhoto, createTrip, markTripAsSynced, updateTripPositionsServerTripId]);

  // ========= sincronização trip positions pendentes (SQLite -> Supabase) =========
  const syncTripPositionsToServerInternal = useCallback(async () => {
    if (!isOnline || !isReady) {
      console.log(
        "[OfflineContext] syncTripPositions abortado -> isOnline:",
        isOnline,
        "isReady:",
        isReady
      );
      return;
    }

    try {
      const unsynced = await getUnsyncedTripPositions();
      if (!unsynced.length) {
        console.log("[OfflineContext] Nenhuma trip position pendente para sync");
        return;
      }

      console.log(
        `[OfflineContext] Enviando ${unsynced.length} trip positions pendentes para o servidor...`
      );

      for (const pos of unsynced) {
        // Só sincroniza se tiver server_trip_id (viagem já foi sincronizada)
        if (!pos.server_trip_id) {
          console.log(`[OfflineContext] Position ${pos.id} aguardando server_trip_id`);
          continue;
        }

        try {
          const { error } = await supabase.from("trip_positions").insert({
            trip_id: pos.server_trip_id,
            captured_at: pos.captured_at,
            latitude: pos.latitude,
            longitude: pos.longitude,
          });

          if (!error) {
            await markTripPositionAsSynced(pos.id!);
            console.log(`[OfflineContext] TripPosition ${pos.id} sincronizada`);
          } else {
            console.error("[OfflineContext] Erro ao sincronizar trip position:", error);
          }
        } catch (err) {
          console.error("[OfflineContext] Erro ao sincronizar trip position individual:", err);
        }
      }
    } catch (err) {
      console.error("[OfflineContext] Erro em syncTripPositions:", err);
    }
  }, [isOnline, isReady, getUnsyncedTripPositions, markTripPositionAsSynced]);

  // ========= salvar trip position (usado pelo TripForm) =========
  const saveTripPosition = useCallback(async (position: OfflineTripPosition): Promise<boolean> => {
    // Se online e tem server_trip_id, salva direto no Supabase
    if (isOnline && position.server_trip_id) {
      try {
        const { error } = await supabase.from("trip_positions").insert({
          trip_id: position.server_trip_id,
          captured_at: position.captured_at,
          latitude: position.latitude,
          longitude: position.longitude,
        });

        if (error) {
          console.error("[OfflineContext] Erro ao salvar position no Supabase:", error);
          // Fallback: salva no SQLite
          return await saveTripPositionSQLite({ ...position, synced: 0 });
        }

        console.log("[OfflineContext] TripPosition salva diretamente no Supabase");
        return true;
      } catch (err) {
        console.error("[OfflineContext] Erro ao salvar position:", err);
        return await saveTripPositionSQLite({ ...position, synced: 0 });
      }
    }

    // Offline ou sem server_trip_id: salva no SQLite
    return await saveTripPositionSQLite(position);
  }, [isOnline, saveTripPositionSQLite]);

  // ========= sincronizar positions de uma viagem específica =========
  const syncTripPositionsToServer = useCallback(async (
    serverTripId: string,
    positions: OfflineTripPosition[]
  ): Promise<void> => {
    if (!isOnline) return;

    try {
      for (const pos of positions) {
        const { error } = await supabase.from("trip_positions").insert({
          trip_id: serverTripId,
          captured_at: pos.captured_at,
          latitude: pos.latitude,
          longitude: pos.longitude,
        });

        if (error) {
          console.error("[OfflineContext] Erro ao sincronizar position:", error);
        }
      }
      console.log(`[OfflineContext] ${positions.length} positions sincronizadas para trip ${serverTripId}`);
    } catch (err) {
      console.error("[OfflineContext] Erro em syncTripPositionsToServer:", err);
    }
  }, [isOnline]);

  // ========= função principal de sync =========
  const syncNow = useCallback(async () => {
    console.log(
      "[OfflineContext] syncNow -> isOnline:",
      isOnline,
      "isReady:",
      isReady,
      "hasDb:",
      hasDb,
      "isSyncing:",
      isSyncing
    );

    if (!isOnline) {
      toast.error("Sem conexão com a internet");
      return;
    }

    if (!isReady || !hasDb) {
      toast.error("SQLite ainda está inicializando, tente novamente");
      return;
    }

    if (isSyncing) return;

    setIsSyncing(true);
    try {
      toast.info("Sincronizando dados...");
      await syncMasterData();
      await syncTripsToServer();
      await syncTripPositionsToServerInternal();
      setLastSyncAt(new Date());
      toast.success("Sincronização concluída!");
    } catch (err) {
      console.error("[OfflineContext] Erro geral de sync:", err);
      toast.error("Erro ao sincronizar dados");
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isReady, hasDb, isSyncing, syncMasterData, syncTripsToServer, syncTripPositionsToServerInternal]);

  // ========= monitor de rede =========
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setIsOnline(navigator.onLine);

      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    let canceled = false;
    let listener: any | null = null;

    const setup = async () => {
      const status = await Network.getStatus();
      if (!canceled) setIsOnline(status.connected);

      listener = await Network.addListener(
        "networkStatusChange",
        async (status) => {
          if (canceled) return;
          setIsOnline(status.connected);

          if (status.connected) {
            console.log(
              "[OfflineContext] Rede restaurada, disparando syncNow()"
            );
            // await syncNow();
          }
        }
      );
    };

    setup();

    return () => {
      canceled = true;
      if (listener) listener.remove();
    };
  }, /*[syncNow]*/);

  // ========= sync inicial (apenas app nativo) =========
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!isOnline || !isReady || !hasDb) return;
    if (hasInitialSyncRun) return;

    setHasInitialSyncRun(true);
    // syncNow();
  }, [isOnline, isReady, hasDb, hasInitialSyncRun /*, syncNow*/]);

  // ========= Motoristas =========
  const getMotoristas = useCallback(
    async (filtro?: string): Promise<OfflineEmployee[]> => {
      if (!isReady && !isOnline) return [];

      let all: OfflineEmployee[] = [];

      if (Capacitor.isNativePlatform()) {
        if (isReady && hasDb) {
          try {
            all = await getEmployees();
            console.log("[getMotoristas] from SQLite:", all.length);
          } catch (err) {
            console.error("[getMotoristas] erro ao ler SQLite:", err);
          }
        }

        // fallback: se não achou nada no SQLite e está online, busca do Supabase
        if (!all.length && isOnline) {
          const { data, error } = await supabase
            .from("employees")
            .select("*")
            .order("nome_completo");

          if (error) {
            console.error("[getMotoristas] erro Supabase:", error);
            return [];
          }

          all = (data || []) as OfflineEmployee[];
          console.log("[getMotoristas] from Supabase:", all.length);

          try {
            if (hasDb) {
              await saveEmployees(all);
            }
          } catch (err) {
            console.error("[getMotoristas] erro ao salvar no SQLite:", err);
          }
        }
      } else {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .order("nome_completo");

        if (error) {
          console.error("[getMotoristas][web] erro Supabase:", error);
          return [];
        }
        all = (data || []) as OfflineEmployee[];
      }

      if (!filtro) return all;

      const f = filtro.toLowerCase();
      return all.filter(
        (emp) =>
          emp.nome_completo.toLowerCase().includes(f) ||
          emp.matricula.toLowerCase().includes(f) ||
          emp.cargo.toLowerCase().includes(f)
      );
    },
    [isReady, hasDb, isOnline, getEmployees, saveEmployees]
  );

  // ========= Veículos =========
  const getVeiculos = useCallback(
    async (filtro?: string): Promise<OfflineVehicle[]> => {
      if (!isReady && !isOnline) return [];

      let all: OfflineVehicle[] = [];

      if (Capacitor.isNativePlatform()) {
        if (isReady && hasDb) {
          try {
            all = await getVehicles();
            console.log("[getVeiculos] from SQLite:", all.length);
          } catch (err) {
            console.error("[getVeiculos] erro ao ler SQLite:", err);
          }
        }

        if (!all.length && isOnline) {
          const { data, error } = await supabase
            .from("vehicles")
            .select("*")
            .order("placa");

          if (error) {
            console.error("[getVeiculos] erro Supabase:", error);
            return [];
          }

          all = (data || []) as OfflineVehicle[];
          console.log("[getVeiculos] from Supabase:", all.length);

          try {
            if (hasDb) {
              await saveVehicles(all);
            }
          } catch (err) {
            console.error("[getVeiculos] erro ao salvar no SQLite:", err);
          }
        }
      } else {
        const { data, error } = await supabase
          .from("vehicles")
          .select("*")
          .order("placa");

        if (error) {
          console.error("[getVeiculos][web] erro Supabase:", error);
          return [];
        }
        all = (data || []) as OfflineVehicle[];
      }

      if (!filtro) return all;

      const f = filtro.toLowerCase();
      return all.filter((v) =>
        `${v.placa} ${v.marca} ${v.modelo}`.toLowerCase().includes(f)
      );
    },
    [isReady, hasDb, isOnline, getVehicles, saveVehicles]
  );

  // ========= Viagens (sempre do SQLite; já vem do syncMasterData) =========
  const getViagens = useCallback(async (): Promise<OfflineTrip[]> => {
    if (!isReady || !hasDb) return [];
    try {
      const trips = await getAllTrips();
      console.log("[getViagens] Trips from SQLite:", trips.length);
      return trips;
    } catch (err) {
      console.error("[getViagens] erro ao ler trips do SQLite:", err);
      return [];
    }
  }, [isReady, hasDb, getAllTrips]);

  // ========= Viagem em andamento (para restaurar estado do TripForm) =========
  const getOngoingTrip = useCallback(async (): Promise<OfflineTrip | null> => {
    if (!isReady || !hasDb) return null;
    try {
      const trip = await getOngoingTripSQLite();
      console.log("[getOngoingTrip] Trip em andamento:", trip ? trip.id : "nenhuma");
      return trip;
    } catch (err) {
      console.error("[getOngoingTrip] erro ao buscar viagem em andamento:", err);
      return null;
    }
  }, [isReady, hasDb, getOngoingTripSQLite]);

  const value: OfflineContextType = {
    isOnline,
    isSyncing,
    lastSyncAt,
    getMotoristas,
    getVeiculos,
    getViagens,
    getOngoingTrip,
    syncNow,
    saveTripPosition,
    syncTripPositionsToServer,
    isReady,
    hasDb,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOfflineData = () => {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOfflineData must be used within OfflineProvider");
  }
  return ctx;
};

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
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

  syncNow: () => Promise<void>;

  isReady: boolean;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [hasInitialSyncRun, setHasInitialSyncRun] = useState(false);

  const {
    isReady,
    saveEmployees,
    getEmployees,
    saveVehicles,
    getVehicles,
    getUnsyncedTrips,
    markTripAsSynced,
  } = useSQLite();

  const { uploadPhoto, createTrip } = useTrips();

  // =============================================
  // BASE64 -> FILE
  // =============================================
  const base64ToFile = (base64: string, filename: string): File => {
    const arr = base64.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  };

  // =============================================
  // SYNC MASTER DATA (EMPLOYEES + VEHICLES)
  // =============================================
  const syncMasterData = async () => {
    if (!isOnline || !isReady) return;

    try {
      console.log("[OfflineContext] Syncing master data...");

      // EMPLOYEES
      const { data: employees, error: empErr } = await supabase
        .from("employees")
        .select("*")
        .order("nome_completo");

      if (!empErr && employees) {
        // BLINDAGEM — NÃO apagar se vier vazio
        if (employees.length > 0) {
          await saveEmployees(employees as OfflineEmployee[]);
          console.log(`[OfflineContext] Saved ${employees.length} employees`);
        } else {
          console.warn("[OfflineContext] Employees list empty — ignored!");
        }
      }

      // VEHICLES
      const { data: vehicles, error: vehErr } = await supabase
        .from("vehicles")
        .select("*")
        .order("placa");

      if (!vehErr && vehicles) {
        if (vehicles.length > 0) {
          await saveVehicles(vehicles as OfflineVehicle[]);
          console.log(`[OfflineContext] Saved ${vehicles.length} vehicles`);
        } else {
          console.warn("[OfflineContext] Vehicles list empty — ignored!");
        }
      }
    } catch (err) {
      console.error("[OfflineContext] Error syncing master data:", err);
    }
  };

  // =============================================
  // SYNC TRIPS FROM SQLITE -> SUPABASE
  // =============================================
  const syncTripsToServer = async () => {
    if (!isOnline || !isReady) return;

    try {
      const unsyncedTrips = await getUnsyncedTrips();
      if (!unsyncedTrips.length) return;

      console.log(
        `[OfflineContext] Syncing ${unsyncedTrips.length} trips to server...`
      );

      for (const trip of unsyncedTrips) {
        try {
          let employeePhotoUrl: string | null = null;

          if (trip.employee_photo_base64) {
            const file = base64ToFile(
              trip.employee_photo_base64,
              `employee_${trip.employee_id}.jpg`
            );
            employeePhotoUrl = await uploadPhoto(
              file,
              `employees/${trip.employee_id}/${Date.now()}.jpg`
            );
          }

          const tripPhotosUrls: string[] = [];
          if (trip.trip_photos_base64) {
            const arr = JSON.parse(trip.trip_photos_base64) as string[];
            for (let i = 0; i < arr.length; i++) {
              const file = base64ToFile(arr[i], `trip_${trip.id}_${i}.jpg`);
              const url = await uploadPhoto(
                file,
                `trips/${Date.now()}_${i}.jpg`
              );
              if (url) tripPhotosUrls.push(url);
            }
          }

          const record = {
            employee_id: trip.employee_id,
            vehicle_id: trip.vehicle_id,
            km_inicial: trip.km_inicial,
            km_final: trip.km_final,
            start_time: trip.start_time,
            end_time: trip.end_time,
            start_latitude: trip.start_latitude,
            start_longitude: trip.start_longitude,
            end_latitude: trip.end_latitude,
            end_longitude: trip.end_longitude,
            duration_seconds: trip.duration_seconds,
            origem: trip.origem,
            destino: trip.destino,
            motivo: trip.motivo,
            observacao: trip.observacao,
            status: "finalizada",
            employee_photo_url: employeePhotoUrl || undefined,
            trip_photos_urls:
              tripPhotosUrls.length > 0 ? tripPhotosUrls : undefined,
          };

          const { error } = await createTrip(record);

          if (!error) {
            await markTripAsSynced(trip.id!);
          } else {
            console.error("[OfflineContext] Error syncing trip:", error);
          }
        } catch (err) {
          console.error(
            "[OfflineContext] Error syncing individual trip:",
            err
          );
        }
      }
    } catch (err) {
      console.error("[OfflineContext] Error in syncTripsToServer:", err);
    }
  };

  // =============================================
  // SYNC NOW (triggered manually or when online)
  // =============================================
  const syncNow = useCallback(async () => {
    if (!isOnline || !isReady) {
      if (!isOnline) toast.error("Sem conexão com a internet");
      return;
    }

    if (isSyncing) return;

    setIsSyncing(true);
    try {
      toast.info("Sincronizando...");
      await syncMasterData();
      await syncTripsToServer();
      setLastSyncAt(new Date());
      toast.success("Sincronização concluída!");
    } catch (err) {
      console.error("[OfflineContext] Sync error:", err);
      toast.error("Erro ao sincronizar dados");
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isReady, isSyncing]);

  // =============================================
  // NETWORK LISTENER (Android/iOS + Web)
  // =============================================
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setIsOnline(navigator.onLine);

      const online = () => setIsOnline(true);
      const offline = () => setIsOnline(false);

      window.addEventListener("online", online);
      window.addEventListener("offline", offline);

      return () => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
      };
    }

    let listener: any;

    const init = async () => {
      const status = await Network.getStatus();
      setIsOnline(status.connected);

      listener = await Network.addListener(
        "networkStatusChange",
        async (st) => {
          setIsOnline(st.connected);

          if (st.connected) {
            console.log("[OfflineContext] Network restored → Sync now");
            await syncNow();
          }
        }
      );
    };

    init();

    return () => {
      listener?.remove?.();
    };
  }, [syncNow]);

  // =============================================
  // INITIAL SYNC ONCE (ONLY IF ONLINE)
  // =============================================
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!isOnline || !isReady) return;
    if (hasInitialSyncRun) return;

    setHasInitialSyncRun(true);
    syncNow();
  }, [isOnline, isReady, hasInitialSyncRun, syncNow]);

  // =============================================
  // GET MOTORISTAS (OFFLINE FIRST)
  // =============================================
  const getMotoristas = useCallback(
    async (filtro?: string): Promise<OfflineEmployee[]> => {
      let all: OfflineEmployee[] = [];

      try {
        // 1) SEMPRE tenta SQLite primeiro
        all = await getEmployees();
        console.log("[getMotoristas] SQLite →", all.length);
      } catch (e) {
        console.error("[getMotoristas] SQLite error:", e);
      }

      // 2) Se estiver vazio e houver internet, baixa e salva
      if (all.length === 0 && isOnline) {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .order("nome_completo");

        if (!error && data) {
          if (data.length > 0) {
            await saveEmployees(data as OfflineEmployee[]);
            all = data as OfflineEmployee[];
            console.log("[getMotoristas] Supabase →", all.length);
          } else {
            console.warn("[getMotoristas] Supabase returned empty list");
          }
        }
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
    [isOnline, getEmployees, saveEmployees]
  );

  // =============================================
  // GET VEÍCULOS (OFFLINE FIRST)
  // =============================================
  const getVeiculos = useCallback(
    async (filtro?: string): Promise<OfflineVehicle[]> => {
      let all: OfflineVehicle[] = [];

      try {
        all = await getVehicles();
        console.log("[getVeiculos] SQLite →", all.length);
      } catch (e) {
        console.error("[getVeiculos] SQLite error:", e);
      }

      if (all.length === 0 && isOnline) {
        const { data, error } = await supabase
          .from("vehicles")
          .select("*")
          .order("placa");

        if (!error && data) {
          if (data.length > 0) {
            await saveVehicles(data as OfflineVehicle[]);
            all = data as OfflineVehicle[];
            console.log("[getVeiculos] Supabase →", all.length);
          } else {
            console.warn("[getVeiculos] Supabase returned empty list");
          }
        }
      }

      if (!filtro) return all;

      const f = filtro.toLowerCase();
      return all.filter((veh) =>
        `${veh.placa} ${veh.marca} ${veh.modelo}`.toLowerCase().includes(f)
      );
    },
    [isOnline, getVehicles, saveVehicles]
  );

  // =============================================
  // GET UNSYNCED TRIPS
  // =============================================
  const getViagens = useCallback(async () => {
    return await getUnsyncedTrips();
  }, [getUnsyncedTrips]);

  const value: OfflineContextType = {
    isOnline,
    isSyncing,
    lastSyncAt,
    getMotoristas,
    getVeiculos,
    getViagens,
    syncNow,
    isReady,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOfflineData = () => {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOfflineData must be used within OfflineProvider");
  return ctx;
};

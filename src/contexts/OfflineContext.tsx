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
  // Estado de rede/sync
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;

  // Dados
  getMotoristas: (filtro?: string) => Promise<OfflineEmployee[]>;
  getVeiculos: (filtro?: string) => Promise<OfflineVehicle[]>;
  getViagens: (filtro?: any) => Promise<OfflineTrip[]>;

  // Ações
  syncNow: () => Promise<void>;

  // Estado do SQLite
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
    getUnsyncedTrips,
    markTripAsSynced,
    saveEmployees,
    getEmployees,
    saveVehicles,
    getVehicles,
  } = useSQLite();

  const { uploadPhoto, createTrip } = useTrips();

  // Utilitário: base64 -> File
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

  // 🔁 Master data: employees + vehicles (Supabase -> SQLite)
  const syncMasterData = async () => {
    if (!isOnline || !isReady) return;

    try {
      console.log("[OfflineContext] Syncing master data...");

      // Employees
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("*")
        .order("nome_completo");

      if (empError) {
        console.error("[OfflineContext] Error fetching employees:", empError);
      } else if (employees) {
        await saveEmployees(employees as OfflineEmployee[]);
        console.log(
          `[OfflineContext] ${employees.length} employees saved to SQLite`
        );
      }

      // Vehicles
      const { data: vehicles, error: vehError } = await supabase
        .from("vehicles")
        .select("*")
        .order("placa");

      if (vehError) {
        console.error("[OfflineContext] Error fetching vehicles:", vehError);
      } else if (vehicles) {
        await saveVehicles(vehicles as OfflineVehicle[]);
        console.log(
          `[OfflineContext] ${vehicles.length} vehicles saved to SQLite`
        );
      }
    } catch (err) {
      console.error("[OfflineContext] Error in syncMasterData:", err);
      throw err;
    }
  };

  // 🔁 Trips pendentes: SQLite -> Supabase
  const syncTripsToServer = async () => {
    if (!isOnline || !isReady) return;

    try {
      const unsyncedTrips = await getUnsyncedTrips();
      if (!unsyncedTrips.length) {
        console.log("[OfflineContext] No trips to sync");
        return;
      }

      console.log(
        `[OfflineContext] Syncing ${unsyncedTrips.length} trips to server...`
      );

      for (const trip of unsyncedTrips) {
        try {
          // Foto do motorista
          let employeePhotoUrl: string | null = null;
          if (trip.employee_photo_base64) {
            const photoFile = base64ToFile(
              trip.employee_photo_base64,
              `employee_${trip.employee_id}.jpg`
            );
            const photoPath = `employees/${trip.employee_id}/${Date.now()}.jpg`;
            employeePhotoUrl = await uploadPhoto(photoFile, photoPath);
          }

          // Fotos da viagem
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

          const tripRecord = {
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
            origem: trip.origem || null,
            destino: trip.destino || null,
            motivo: trip.motivo || null,
            observacao: trip.observacao || null,
            status: trip.status,
            employee_photo_url: employeePhotoUrl || undefined,
            trip_photos_urls:
              tripPhotosUrls.length > 0 ? tripPhotosUrls : undefined,
          };

          const { error } = await createTrip(tripRecord);

          if (!error) {
            await markTripAsSynced(trip.id!);
            console.log(
              `[OfflineContext] Trip ${trip.id} synced successfully`
            );
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
      throw err;
    }
  };

  // 🔄 Função principal de sincronização (botão + automático)
  const syncNow = useCallback(async () => {
    if (!isOnline || !isReady) {
      if (!isOnline) {
        toast.error("Sem conexão com a internet");
      }
      return;
    }

    if (isSyncing) return;

    setIsSyncing(true);
    try {
      toast.info("Sincronizando dados...");
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

  // 🌐 Monitor de rede (web + nativo)
  useEffect(() => {
    // Web
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

    // Nativo
    let canceled = false;

    const setupNetworkListener = async () => {
      const status = await Network.getStatus();
      if (!canceled) setIsOnline(status.connected);

      const listener = await Network.addListener(
        "networkStatusChange",
        async (status) => {
          if (canceled) return;
          setIsOnline(status.connected);

          if (status.connected) {
            console.log("[OfflineContext] Network restored, syncing...");
            await syncNow();
          }
        }
      );

      return () => {
        listener.remove();
      };
    };

    let cleanup: (() => void) | undefined;

    setupNetworkListener().then((fn) => {
      cleanup = fn;
    });

    return () => {
      canceled = true;
      if (cleanup) cleanup();
      Network.removeAllListeners();
    };
  }, [syncNow]);

  // ▶️ Sync inicial no app nativo (apenas 1 vez, quando online e SQLite pronto)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!isOnline || !isReady) return;
    if (hasInitialSyncRun) return;

    setHasInitialSyncRun(true);
    syncNow();
  }, [isOnline, isReady, hasInitialSyncRun, syncNow]);

  // 🔍 Motoristas (SQLite nativo, Supabase web)
  const getMotoristas = useCallback(
    async (filtro?: string): Promise<OfflineEmployee[]> => {
      let allEmployees: OfflineEmployee[] = [];

      if (Capacitor.isNativePlatform()) {
        if (!isReady) return [];

        // 1) Tenta SQLite
        try {
          allEmployees = await getEmployees();
          console.log(
            "[OfflineContext] getMotoristas -> SQLite:",
            allEmployees.length
          );
        } catch (err) {
          console.error(
            "[OfflineContext] Error reading employees from SQLite:",
            err
          );
        }

        // 2) Se vier vazio e estiver online, busca Supabase + cache
        if (allEmployees.length === 0 && isOnline) {
          try {
            const { data, error } = await supabase
              .from("employees")
              .select("*")
              .order("nome_completo");

            if (error) {
              console.error(
                "[OfflineContext] Error fetching employees from Supabase:",
                error
              );
              return [];
            }

            allEmployees = (data || []) as OfflineEmployee[];
            console.log(
              "[OfflineContext] getMotoristas -> Supabase:",
              allEmployees.length
            );

            try {
              await saveEmployees(allEmployees);
            } catch (err) {
              console.error(
                "[OfflineContext] Error saving employees to SQLite:",
                err
              );
            }
          } catch (err) {
            console.error(
              "[OfflineContext] Unexpected error fetching employees:",
              err
            );
            return [];
          }
        }
      } else {
        // Web: sempre Supabase
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .order("nome_completo");

        if (error) {
          console.error(
            "[OfflineContext][web] Error fetching employees:",
            error
          );
          return [];
        }

        allEmployees = (data || []) as OfflineEmployee[];
        console.log(
          "[OfflineContext][web] getMotoristas -> Supabase:",
          allEmployees.length
        );
      }

      if (!filtro) return allEmployees;

      const lower = filtro.toLowerCase();
      return allEmployees.filter(
        (emp) =>
          emp.nome_completo.toLowerCase().includes(lower) ||
          emp.matricula.toLowerCase().includes(lower) ||
          emp.cargo.toLowerCase().includes(lower)
      );
    },
    [isReady, isOnline, getEmployees, saveEmployees]
  );

  // 🚗 Veículos (SQLite nativo, Supabase web)
  const getVeiculos = useCallback(
    async (filtro?: string): Promise<OfflineVehicle[]> => {
      let allVehicles: OfflineVehicle[] = [];

      if (Capacitor.isNativePlatform()) {
        if (!isReady) return [];

        try {
          allVehicles = await getVehicles();
          console.log(
            "[OfflineContext] getVeiculos -> SQLite:",
            allVehicles.length
          );
        } catch (err) {
          console.error(
            "[OfflineContext] Error reading vehicles from SQLite:",
            err
          );
        }

        if (allVehicles.length === 0 && isOnline) {
          try {
            const { data, error } = await supabase
              .from("vehicles")
              .select("*")
              .order("placa");

            if (error) {
              console.error(
                "[OfflineContext] Error fetching vehicles from Supabase:",
                error
              );
              return [];
            }

            allVehicles = (data || []) as OfflineVehicle[];
            console.log(
              "[OfflineContext] getVeiculos -> Supabase:",
              allVehicles.length
            );

            try {
              await saveVehicles(allVehicles);
            } catch (err) {
              console.error(
                "[OfflineContext] Error saving vehicles to SQLite:",
                err
              );
            }
          } catch (err) {
            console.error(
              "[OfflineContext] Unexpected error fetching vehicles:",
              err
            );
            return [];
          }
        }
      } else {
        const { data, error } = await supabase
          .from("vehicles")
          .select("*")
          .order("placa");

        if (error) {
          console.error(
            "[OfflineContext][web] Error fetching vehicles:",
            error
          );
          return [];
        }

        allVehicles = (data || []) as OfflineVehicle[];
        console.log(
          "[OfflineContext][web] getVeiculos -> Supabase:",
          allVehicles.length
        );
      }

      if (!filtro) return allVehicles;

      const lower = filtro.toLowerCase();
      return allVehicles.filter((veh) => {
        const text = `${veh.placa} ${veh.marca} ${veh.modelo}`.toLowerCase();
        return text.includes(lower);
      });
    },
    [isReady, isOnline, getVehicles, saveVehicles]
  );

  // 🧾 Viagens locais (não sincronizadas)
  const getViagens = useCallback(
    async (_filtro?: any): Promise<OfflineTrip[]> => {
      if (!isReady) return [];
      const unsynced = await getUnsyncedTrips();
      return unsynced;
    },
    [isReady, getUnsyncedTrips]
  );

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
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOfflineData must be used within OfflineProvider");
  }
  return context;
};

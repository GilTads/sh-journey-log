// src/contexts/OfflineContext.tsx
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
  // Estado de rede / sync
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
  hasDb: boolean;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState(true);
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
    markTripAsSynced,
  } = useSQLite();

  const { uploadPhoto, createTrip } = useTrips();

  // Utilitário base64 -> File
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

  // 🔁 Funcionários + veículos (Supabase -> SQLite)
  const syncMasterData = useCallback(async () => {
    // ⬇️ não bloqueia mais pelo hasDb; se o DB não estiver pronto,
    // os métodos de save vão simplesmente logar erro e retornar false.
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
      console.log(
        "[OfflineContext] Syncing master data... (hasDb:",
        hasDb,
        ")"
      );

      // Employees
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("*")
        .order("nome_completo");

      if (employeesError) {
        console.error(
          "[OfflineContext] Error fetching employees:",
          employeesError
        );
      } else if (employees) {
        await saveEmployees(employees as OfflineEmployee[]);
        console.log(
          `[OfflineContext] ${employees.length} employees saved to SQLite`
        );
      }

      // Vehicles
      const { data: vehicles, error: vehiclesError } = await supabase
        .from("vehicles")
        .select("*")
        .order("placa");

      if (vehiclesError) {
        console.error(
          "[OfflineContext] Error fetching vehicles:",
          vehiclesError
        );
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
  }, [isOnline, isReady, hasDb, saveEmployees, saveVehicles]);

  // 🔁 Viagens pendentes (SQLite -> Supabase)
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
      const unsyncedTrips = await getUnsyncedTrips();
      if (!unsyncedTrips.length) {
        console.log("[OfflineContext] No trips to sync");
        return;
      }

      console.log(
        `[OfflineContext] Syncing ${unsyncedTrips.length} trips to server... (hasDb: ${hasDb})`
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
  }, [
    isOnline,
    isReady,
    hasDb,
    getUnsyncedTrips,
    uploadPhoto,
    createTrip,
    markTripAsSynced,
  ]);

  // 🔄 Função principal de sincronização (botão + automática)
  const syncNow = useCallback(async () => {
    console.log(
      "[OfflineContext] syncNow called -> isOnline:",
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

    if (!isReady) {
      toast.error("SQLite ainda está inicializando, tente novamente");
      return;
    }

    // ⬇️ não bloqueia mais pela flag hasDb.
    // Se por algum motivo o DB não estiver conectado, as funções de save vão logar/retornar erro,
    // mas o fluxo de sync em si não fica travado aqui.

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
  }, [isOnline, isReady, hasDb, isSyncing, syncMasterData, syncTripsToServer]);

  // 🔌 Monitor de rede (web + nativo)
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

    const setupNetworkListener = async () => {
      const status = await Network.getStatus();
      if (!canceled) setIsOnline(status.connected);

      listener = await Network.addListener(
        "networkStatusChange",
        async (status) => {
          if (canceled) return;
          setIsOnline(status.connected);

          if (status.connected) {
            console.log("[OfflineContext] Network restored - triggering sync");
            await syncNow();
          }
        }
      );
    };

    setupNetworkListener();

    return () => {
      canceled = true;
      if (listener) listener.remove();
    };
  }, [syncNow]);

  // ▶️ Sync inicial no app nativo (apenas 1 vez)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!isOnline || !isReady) return;
    if (hasInitialSyncRun) return;

    setHasInitialSyncRun(true);
    syncNow();
  }, [isOnline, isReady, hasInitialSyncRun, syncNow]);

  // 🔍 Motoristas (SQLite no app / Supabase no web)
  const getMotoristas = useCallback(
    async (filtro?: string): Promise<OfflineEmployee[]> => {
      if (!isReady && !isOnline) return [];

      let allEmployees: OfflineEmployee[] = [];

      if (Capacitor.isNativePlatform()) {
        if (isReady && hasDb) {
          try {
            allEmployees = await getEmployees();
            console.log(
              "[getMotoristas] Employees from SQLite:",
              allEmployees.length
            );
          } catch (err) {
            console.error(
              "[getMotoristas] Error reading employees from SQLite:",
              err
            );
          }
        }

        if (allEmployees.length === 0 && isOnline) {
          try {
            const { data, error } = await supabase
              .from("employees")
              .select("*")
              .order("nome_completo");

            if (error) {
              console.error(
                "[getMotoristas] Error fetching from Supabase:",
                error
              );
              return [];
            }

            allEmployees = (data || []) as OfflineEmployee[];
            console.log(
              "[getMotoristas] Employees from Supabase:",
              allEmployees.length
            );

            try {
              if (hasDb) {
                await saveEmployees(allEmployees);
              } else {
                console.warn(
                  "[getMotoristas] DB not ready, skipping saveEmployees"
                );
              }
            } catch (err) {
              console.error(
                "[getMotoristas] Error saving employees to SQLite:",
                err
              );
            }
          } catch (err) {
            console.error("[getMotoristas] Unexpected error:", err);
            return [];
          }
        }
      } else {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .order("nome_completo");

        if (error) {
          console.error(
            "[getMotoristas][web] Error fetching from Supabase:",
            error
          );
          return [];
        }

        allEmployees = (data || []) as OfflineEmployee[];
      }

      if (!filtro) return allEmployees;

      const lowerFilter = filtro.toLowerCase();
      return allEmployees.filter(
        (emp) =>
          emp.nome_completo.toLowerCase().includes(lowerFilter) ||
          emp.matricula.toLowerCase().includes(lowerFilter) ||
          emp.cargo.toLowerCase().includes(lowerFilter)
      );
    },
    [isReady, hasDb, isOnline, getEmployees, saveEmployees]
  );

  // 🚗 Veículos (SQLite no app / Supabase no web)
  const getVeiculos = useCallback(
    async (filtro?: string): Promise<OfflineVehicle[]> => {
      if (!isReady && !isOnline) return [];

      let allVehicles: OfflineVehicle[] = [];

      if (Capacitor.isNativePlatform()) {
        if (isReady && hasDb) {
          try {
            allVehicles = await getVehicles();
            console.log(
              "[getVeiculos] Vehicles from SQLite:",
              allVehicles.length
            );
          } catch (err) {
            console.error(
              "[getVeiculos] Error reading vehicles from SQLite:",
              err
            );
          }
        }

        if (allVehicles.length === 0 && isOnline) {
          try {
            const { data, error } = await supabase
              .from("vehicles")
              .select("*")
              .order("placa");

            if (error) {
              console.error(
                "[getVeiculos] Error fetching from Supabase:",
                error
              );
              return [];
            }

            allVehicles = (data || []) as OfflineVehicle[];
            console.log(
              "[getVeiculos] Vehicles from Supabase:",
              allVehicles.length
            );

            try {
              if (hasDb) {
                await saveVehicles(allVehicles);
              } else {
                console.warn(
                  "[getVeiculos] DB not ready, skipping saveVehicles"
                );
              }
            } catch (err) {
              console.error(
                "[getVeiculos] Error saving vehicles to SQLite:",
                err
              );
            }
          } catch (err) {
            console.error("[getVeiculos] Unexpected error:", err);
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
            "[getVeiculos][web] Error fetching from Supabase:",
            error
          );
          return [];
        }

        allVehicles = (data || []) as OfflineVehicle[];
      }

      if (!filtro) return allVehicles;

      const lowerFilter = filtro.toLowerCase();
      return allVehicles.filter((veh) => {
        const text = `${veh.placa} ${veh.marca} ${veh.modelo}`.toLowerCase();
        return text.includes(lowerFilter);
      });
    },
    [isReady, hasDb, isOnline, getVehicles, saveVehicles]
  );

  // 🧾 Viagens pendentes no SQLite (para histórico offline se quiser)
  const getViagens = useCallback(
    async (_filtro?: any): Promise<OfflineTrip[]> => {
      if (!isReady || !hasDb) return [];
      const unsynced = await getUnsyncedTrips();
      return unsynced;
    },
    [isReady, hasDb, getUnsyncedTrips]
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
  if (!ctx) throw new Error("useOfflineData must be used within OfflineProvider");
  return ctx;
};

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { useSQLite, OfflineEmployee, OfflineVehicle, OfflineTrip } from "@/hooks/useSQLite";
import { supabase } from "@/integrations/supabase/client";
import { useTrips } from "@/hooks/useTrips";
import { toast } from "sonner";

interface OfflineContextType {
  // Estado
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  
  // Métodos de dados
  getMotoristas: (filtro?: string) => Promise<OfflineEmployee[]>;
  getVeiculos: (filtro?: string) => Promise<OfflineVehicle[]>;
  getViagens: (filtro?: any) => Promise<OfflineTrip[]>;
  
  // Sincronização
  syncNow: () => Promise<void>;
  
  // Estado de carregamento
  isReady: boolean;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  
  const { 
    isReady, 
    saveEmployees, 
    getEmployees, 
    saveVehicles, 
    getVehicles,
    getUnsyncedTrips,
    markTripAsSynced,
    deleteTrip,
    saveTrip
  } = useSQLite();
  
  const { uploadPhoto, createTrip } = useTrips();

  // Monitor network status
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

    const setupNetworkListener = async () => {
      const status = await Network.getStatus();
      setIsOnline(status.connected);

      Network.addListener("networkStatusChange", async (status) => {
        const wasOffline = !isOnline;
        setIsOnline(status.connected);
        
        if (status.connected && wasOffline) {
          console.log("Network restored - triggering sync");
          await syncNow();
        }
      });
    };

    setupNetworkListener();

    return () => {
      Network.removeAllListeners();
    };
  }, [isOnline]);

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

  const syncMasterData = async () => {
    if (!isOnline || !isReady) return;

    try {
      console.log("Syncing master data from server...");
      
      // Fetch employees
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("*")
        .order("nome_completo");

      if (!employeesError && employees) {
        await saveEmployees(employees);
        console.log(`Synced ${employees.length} employees to SQLite`);
      }

      // Fetch vehicles
      const { data: vehicles, error: vehiclesError } = await supabase
        .from("vehicles")
        .select("*")
        .order("placa");

      if (!vehiclesError && vehicles) {
        await saveVehicles(vehicles);
        console.log(`Synced ${vehicles.length} vehicles to SQLite`);
      }
    } catch (error) {
      console.error("Error syncing master data:", error);
      throw error;
    }
  };

  const syncTripsToServer = async () => {
    if (!isOnline || !isReady) return;

    try {
      const unsyncedTrips = await getUnsyncedTrips();
      
      if (unsyncedTrips.length === 0) {
        console.log("No trips to sync");
        return;
      }

      console.log(`Syncing ${unsyncedTrips.length} trips to server...`);

      for (const trip of unsyncedTrips) {
        try {
          // Upload employee photo
          let employeePhotoUrl: string | null = null;
          if (trip.employee_photo_base64) {
            const photoFile = base64ToFile(
              trip.employee_photo_base64,
              `employee_${trip.employee_id}.jpg`
            );
            const photoPath = `employees/${trip.employee_id}/${Date.now()}.jpg`;
            employeePhotoUrl = await uploadPhoto(photoFile, photoPath);
          }

          // Upload trip photos
          const tripPhotosUrls: string[] = [];
          if (trip.trip_photos_base64) {
            const photosArray = JSON.parse(trip.trip_photos_base64) as string[];
            for (let i = 0; i < photosArray.length; i++) {
              const photoFile = base64ToFile(photosArray[i], `trip_${i}.jpg`);
              const photoPath = `trips/${Date.now()}_${i}.jpg`;
              const url = await uploadPhoto(photoFile, photoPath);
              if (url) tripPhotosUrls.push(url);
            }
          }

          // Create trip record
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
            trip_photos_urls: tripPhotosUrls.length > 0 ? tripPhotosUrls : undefined,
          };

          const { error } = await createTrip(tripRecord);

          if (!error) {
            await markTripAsSynced(trip.id!);
            console.log(`Trip ${trip.id} synced successfully`);
          } else {
            console.error("Error syncing trip:", error);
          }
        } catch (error) {
          console.error("Error syncing individual trip:", error);
        }
      }

      console.log("All trips synced successfully");
    } catch (error) {
      console.error("Error syncing trips:", error);
      throw error;
    }
  };

  const syncNow = useCallback(async () => {
    if (!isOnline || isSyncing || !isReady) {
      if (!isOnline) {
        toast.error("Sem conexão com a internet");
      }
      return;
    }

    setIsSyncing(true);
    
    try {
      toast.info("Sincronizando dados...");
      
      // Sync master data first (employees, vehicles)
      await syncMasterData();
      
      // Then sync pending trips
      await syncTripsToServer();
      
      setLastSyncAt(new Date());
      toast.success("Sincronização concluída!");
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("Erro ao sincronizar dados");
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, isReady]);

  const getMotoristas = useCallback(async (filtro?: string): Promise<OfflineEmployee[]> => {
    if (!isReady) return [];
    
    const allEmployees = await getEmployees();
    
    if (!filtro) return allEmployees;
    
    const lowerFilter = filtro.toLowerCase();
    return allEmployees.filter(emp => 
      emp.nome_completo.toLowerCase().includes(lowerFilter) ||
      emp.matricula.toLowerCase().includes(lowerFilter) ||
      emp.cargo.toLowerCase().includes(lowerFilter)
    );
  }, [isReady, getEmployees]);

  const getVeiculos = useCallback(async (filtro?: string): Promise<OfflineVehicle[]> => {
    if (!isReady) return [];
    
    const allVehicles = await getVehicles();
    
    if (!filtro) return allVehicles;
    
    const lowerFilter = filtro.toLowerCase();
    return allVehicles.filter(veh => 
      veh.placa.toLowerCase().includes(lowerFilter) ||
      veh.marca.toLowerCase().includes(lowerFilter) ||
      veh.modelo.toLowerCase().includes(lowerFilter)
    );
  }, [isReady, getVehicles]);

  const getViagens = useCallback(async (filtro?: any): Promise<OfflineTrip[]> => {
    if (!isReady) return [];
    
    const unsyncedTrips = await getUnsyncedTrips();
    return unsyncedTrips;
  }, [isReady, getUnsyncedTrips]);

  // Initial sync when going online
  useEffect(() => {
    if (isOnline && isReady && Capacitor.isNativePlatform()) {
      syncNow();
    }
  }, [isOnline, isReady]);

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
  if (context === undefined) {
    throw new Error("useOfflineData must be used within OfflineProvider");
  }
  return context;
};

import { useEffect, useState } from "react";
import { Network } from "@capacitor/network";
import { Capacitor } from "@capacitor/core";
import { useSQLite, OfflineTrip } from "./useSQLite";
import { useTrips } from "./useTrips";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useNetworkSync = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const { getUnsyncedTrips, markTripAsSynced, deleteTrip, saveEmployees, saveVehicles } = useSQLite();
  const { uploadPhoto, createTrip } = useTrips();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      // On web, use navigator.onLine
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

    // On native platforms, use Capacitor Network plugin
    const setupNetworkListener = async () => {
      const status = await Network.getStatus();
      setIsOnline(status.connected);

      Network.addListener("networkStatusChange", (status) => {
        setIsOnline(status.connected);
        
        if (status.connected) {
          // Automatically sync when coming back online
          syncMasterData();
          syncPendingTrips();
        }
      });
    };

    setupNetworkListener();

    return () => {
      Network.removeAllListeners();
    };
  }, []);

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
    if (!isOnline) return;

    try {
      // Fetch and save employees
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("*")
        .order("nome_completo");

      if (!employeesError && employees) {
        await saveEmployees(employees);
        console.log("Employees synced to SQLite");
      }

      // Fetch and save vehicles
      const { data: vehicles, error: vehiclesError } = await supabase
        .from("vehicles")
        .select("*")
        .order("placa");

      if (!vehiclesError && vehicles) {
        await saveVehicles(vehicles);
        console.log("Vehicles synced to SQLite");
      }
    } catch (error) {
      console.error("Error syncing master data:", error);
    }
  };

  const syncPendingTrips = async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    
    try {
      const unsyncedTrips = await getUnsyncedTrips();
      
      if (unsyncedTrips.length === 0) {
        console.log("No trips to sync");
        setIsSyncing(false);
        return;
      }

      toast.info(`Sincronizando ${unsyncedTrips.length} viagem(ns)...`);

      for (const trip of unsyncedTrips) {
        try {
          // Upload employee photo if exists
          let employeePhotoUrl: string | null = null;
          if (trip.employee_photo_base64) {
            const photoFile = base64ToFile(
              trip.employee_photo_base64,
              `employee_${trip.employee_id}.jpg`
            );
            const photoPath = `employees/${trip.employee_id}/${Date.now()}.jpg`;
            employeePhotoUrl = await uploadPhoto(photoFile, photoPath);
          }

          // Upload trip photos if exist
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
            // Mark as synced and optionally delete
            await markTripAsSynced(trip.id!);
            // Optionally delete after successful sync:
            // await deleteTrip(trip.id!);
          } else {
            console.error("Error syncing trip:", error);
          }
        } catch (error) {
          console.error("Error syncing individual trip:", error);
        }
      }

      toast.success("Viagens sincronizadas com sucesso!");
    } catch (error) {
      console.error("Error syncing trips:", error);
      toast.error("Erro ao sincronizar viagens");
    } finally {
      setIsSyncing(false);
    }
  };

  // Initial sync of master data when component mounts and is online
  useEffect(() => {
    if (isOnline && Capacitor.isNativePlatform()) {
      syncMasterData();
    }
  }, [isOnline]);

  return {
    isOnline,
    isSyncing,
    syncPendingTrips,
    syncMasterData,
  };
};

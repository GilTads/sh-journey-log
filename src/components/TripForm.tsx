import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useOfflineData } from "@/contexts/OfflineContext";
import { useTrips } from "@/hooks/useTrips";
import { useSQLite } from "@/hooks/useSQLite";
import { useTripLock } from "@/contexts/TripLockContext";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHintALLOption,
} from "@capacitor/barcode-scanner";
import { Geolocation } from "@capacitor/geolocation";
import {
  startBackgroundWatcher,
  stopBackgroundWatcher,
} from "@/lib/backgroundLocation";
import {
  User,
  Car,
  CarFront,
  MapPin,
  FileText,
  Camera,
  Navigation,
  Clock,
  QrCode,
  Play,
  Flag,
} from "lucide-react";
import { CapacitorSQLite } from "@capacitor-community/sqlite";

interface TripData {
  employeeId: string;
  employeePhoto: File | null;
  employeePhotoUrl?: string; // URL ou base64 da foto recuperada
  vehicleId: string;
  initialKm: string;
  finalKm: string;
  origin: string;
  destination: string;
  reason: string;
  observation: string;
  startLocation?: { lat: number; lng: number };
  endLocation?: { lat: number; lng: number };
  startTime?: Date;
  endTime?: Date;
  images: File[];
  isRentedVehicle: boolean;
  rentedPlate: string;
  rentedModel: string;
  rentedCompany: string;
}

export const TripForm = () => {
  const location = useLocation();
  const viewTripData = location.state?.viewTrip;
  const isTripInProgress = (status?: string | null) => {
    const normalized = status?.toLowerCase();
    return normalized === "in_progress" || normalized === "em_andamento";
  };
  const isViewingOngoingTrip =
    !!viewTripData && isTripInProgress(viewTripData.status) && !viewTripData.end_time;
  const isViewMode = !!viewTripData && !isViewingOngoingTrip;

  const {
    isOnline,
    isSyncing,
    getMotoristas,
    getVeiculos,
    getOngoingTrip,
    isReady,
    lastSyncAt,
    syncNow,
    saveTripPosition,
    hasDb,
    deviceId,
  } = useOfflineData();

  const { uploadPhoto, createTrip, updateTrip, getOngoingTripFromServer } = useTrips();
  const {
    isReady: isSQLiteReady,
    hasDb: hasSQLiteDb,
    saveTrip: saveTripOffline,
    updateTripOnEnd,
    updateTripPhotos,
    getEmployees: getEmployeesRaw,
    getVehicles: getVehiclesRaw,
    dumpOfflineTrips,
  } = useSQLite();

  const [employees, setEmployees] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isLoadingOngoingTrip, setIsLoadingOngoingTrip] = useState(true);
  const [plateError, setPlateError] = useState<string>("");
  const { setTripLocked } = useTripLock();

  const [tripData, setTripData] = useState<TripData>({
    employeeId: "",
    employeePhoto: null,
    employeePhotoUrl: undefined,
    vehicleId: "",
    initialKm: "",
    finalKm: "",
    origin: "",
    destination: "",
    reason: "",
    observation: "",
    images: [],
    isRentedVehicle: false,
    rentedPlate: "",
    rentedModel: "",
    rentedCompany: "",
  });

  const [isActive, setIsActive] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [showEndTripDialog, setShowEndTripDialog] = useState(false);
  const [tempFinalKm, setTempFinalKm] = useState("");
  const [imageBase64List, setImageBase64List] = useState<string[]>([]);
  const employeePhotoBase64Ref = useRef<string | null>(null); // cache da foto do motorista em base64 para uso offline
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const locationTrackingRef = useRef<NodeJS.Timeout | null>(null);
  const locationWatchIdRef = useRef<string | null>(null);
  const bgWatcherRef = useRef<{ id: string } | null>(null);
  const lastCaptureRef = useRef<number | null>(null);
  const lastPositionRef = useRef<GeolocationPosition | null>(null); // cache da última posição válida para fallback rápido
  const fileInputRef = useRef<HTMLInputElement>(null);
  const employeePhotoInputRef = useRef<HTMLInputElement>(null);

  // IDs para rastreamento de posições
  const [currentLocalTripId, setCurrentLocalTripId] = useState<string | null>(null);
  const [currentServerTripId, setCurrentServerTripId] = useState<string | null>(null);

  // Ref para evitar execução múltipla do carregamento de viagem em andamento
  const hasLoadedOngoingTripRef = useRef(false);

  // 🔍 STATUS DO TESTE DO SQLITE (DEBUG)
  const [sqliteStatus, setSqliteStatus] = useState<string>(
    "Aguardando teste..."
  );

  // ========= CARREGA VIAGEM EM ANDAMENTO NO MOUNT =========
  useEffect(() => {
    if (viewTripData) {
      if (isViewingOngoingTrip) {
        console.log("[TripForm] Carregando viagem em andamento vinda do histórico:", viewTripData);
        resumeTripFromHistory(viewTripData);
      } else {
        console.log("[TripForm] Carregando viagem em modo visualização:", viewTripData);
        loadViewModeTrip(viewTripData);
      }
      setIsLoadingOngoingTrip(false);
      return;
    }

    // Evita execução múltipla
    if (hasLoadedOngoingTripRef.current) {
      return;
    }

    const isNative = Capacitor.isNativePlatform();

    // Verifica se podemos executar (web pode executar direto, nativo precisa SQLite pronto)
    const canExecute = !isNative || isReady;
    if (!canExecute) {
      return;
    }
    if (isNative && !deviceId) {
      // Aguarda deviceId para garantir filtro correto da viagem em andamento
      return;
    }

    // Marca como já executado ANTES de rodar para evitar race conditions
    hasLoadedOngoingTripRef.current = true;
    
    const loadOngoingTripOnMount = async () => {
      console.log("[TripForm] Verificando viagem em andamento...", {
        isNative,
        isOnline,
        isReady,
        hasDb,
      });

      try {
        // OFFLINE (nativo + sqlite disponível)
    if (isNative && !isOnline && isReady && hasDb) {
          console.log("[TripForm] Buscando viagem em andamento no SQLite...");
          const ongoingTrip = await getOngoingTrip();

          if (ongoingTrip) {
            console.log("[TripForm] Viagem em andamento encontrada (offline):", ongoingTrip.local_id);
            restoreTripState(ongoingTrip, ongoingTrip.local_id!, ongoingTrip.server_trip_id ?? null);
            return;
          }
        }

        // ONLINE: busca no Supabase
        if (isOnline) {
          console.log("[TripForm] Buscando viagem em andamento no Supabase...");
          const serverTrip = await getOngoingTripFromServer(deviceId);

          if (serverTrip) {
            console.log("[TripForm] Viagem em andamento encontrada (online):", serverTrip.id);
            restoreTripStateFromServer(serverTrip);
            return;
          }
        }

        // NATIVO ONLINE: também verificar SQLite (pode ter viagem local não sincronizada)
        if (isNative && isOnline && isReady && hasDb) {
          console.log("[TripForm] Verificando SQLite por viagem local em andamento...");
          const localOngoingTrip = await getOngoingTrip();

          if (localOngoingTrip) {
            console.log("[TripForm] Viagem local em andamento encontrada:", localOngoingTrip.local_id);
            restoreTripState(localOngoingTrip, localOngoingTrip.local_id!, localOngoingTrip.server_trip_id ?? null);
            return;
          }
        }

        console.log("[TripForm] Nenhuma viagem em andamento encontrada");
      } catch (error) {
        console.error("[TripForm] Erro ao carregar viagem em andamento:", error);
      } finally {
        setIsLoadingOngoingTrip(false);
      }
    };

    loadOngoingTripOnMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, isReady, hasDb, isOnline, viewTripData, isViewingOngoingTrip]);

  // Função para carregar viagem em modo visualização (somente leitura)
  const loadViewModeTrip = (trip: any) => {
    const startTime = trip.start_time ? new Date(trip.start_time) : new Date();
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    setTripData({
      employeeId: trip.employee_id || "",
      employeePhoto: null,
      employeePhotoUrl: trip.employee_photo_url || undefined,
      vehicleId: trip.vehicle_id || "",
      initialKm: String(trip.initial_km || ""),
      finalKm: trip.final_km ? String(trip.final_km) : "",
      origin: trip.origin || "",
      destination: trip.destination || "",
      reason: trip.reason || "",
      observation: trip.notes || "",
      startLocation: trip.start_latitude && trip.start_longitude
        ? { lat: trip.start_latitude, lng: trip.start_longitude }
        : undefined,
      endLocation: trip.end_latitude && trip.end_longitude
        ? { lat: trip.end_latitude, lng: trip.end_longitude }
        : undefined,
      startTime,
      endTime: trip.end_time ? new Date(trip.end_time) : undefined,
      images: [],
      isRentedVehicle: trip.is_rented_vehicle === 1 || trip.is_rented_vehicle === true,
      rentedPlate: trip.rented_plate || "",
      rentedModel: trip.rented_model || "",
      rentedCompany: trip.rented_company || "",
    });

    setCurrentLocalTripId(trip.local_id || trip.id || null);
    setCurrentServerTripId(trip.server_trip_id || null);
    setElapsedTime(elapsed > 0 ? elapsed : 0);
    setIsActive(true);

    toast.info("Visualizando viagem em andamento", {
      description: "Todos os campos estão em modo somente leitura",
    });
  };

  // Função para retomar uma viagem em andamento vinda do histórico
  const resumeTripFromHistory = (trip: any) => {
    const startTime = trip.start_time ? new Date(trip.start_time) : new Date();
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const maybeLocalId = trip.local_id || trip.id;

    setTripData({
      employeeId: trip.employee_id || "",
      employeePhoto: null,
      employeePhotoUrl: trip.employee_photo_url || undefined,
      vehicleId: trip.vehicle_id || "",
      initialKm: String(trip.initial_km || ""),
      finalKm: trip.final_km ? String(trip.final_km) : "",
      origin: trip.origin || "",
      destination: trip.destination || "",
      reason: trip.reason || "",
      observation: trip.notes || "",
      startLocation: trip.start_latitude && trip.start_longitude
        ? { lat: trip.start_latitude, lng: trip.start_longitude }
        : undefined,
      endLocation: trip.end_latitude && trip.end_longitude
        ? { lat: trip.end_latitude, lng: trip.end_longitude }
        : undefined,
      startTime,
      endTime: trip.end_time ? new Date(trip.end_time) : undefined,
      images: [],
      isRentedVehicle: trip.is_rented_vehicle === 1 || trip.is_rented_vehicle === true,
      rentedPlate: trip.rented_plate || "",
      rentedModel: trip.rented_model || "",
      rentedCompany: trip.rented_company || "",
    });

    if (trip.employee_photo_base64) {
      employeePhotoBase64Ref.current = trip.employee_photo_base64;
    }

    if (trip.trip_photos_base64) {
      try {
        const parsed = JSON.parse(trip.trip_photos_base64);
        if (Array.isArray(parsed)) {
          setImageBase64List(parsed);
        }
      } catch (err) {
        console.warn("[TripForm] Não foi possível reprocessar trip_photos_base64 (histórico):", err);
      }
    }

    setCurrentLocalTripId(maybeLocalId || null);
    setCurrentServerTripId(trip.server_trip_id || null);
    setElapsedTime(elapsed > 0 ? elapsed : 0);
    setIsActive(true);

    toast.success("Viagem em andamento carregada", {
      description: "Finalize a viagem quando estiver concluída.",
    });
  };

  // Função auxiliar para restaurar estado do form a partir de viagem offline
  const restoreTripState = (
    trip: any,
    localTripId: string | null,
    serverTripId: string | null
  ) => {
    const startTime = new Date(trip.start_time);
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    // Recupera foto do motorista (base64 do SQLite)
    const employeePhotoUrl = trip.employee_photo_base64 || trip.employee_photo_url || undefined;
    if (trip.employee_photo_base64) {
      employeePhotoBase64Ref.current = trip.employee_photo_base64;
    }

    setTripData((prev) => ({
      ...prev,
      employeeId: trip.employee_id || "",
      employeePhotoUrl, // URL ou base64 da foto recuperada
      vehicleId: trip.vehicle_id || "",
      initialKm: String(trip.initial_km || ""),
      origin: trip.origin || "",
      destination: trip.destination || "",
      reason: trip.reason || "",
      observation: trip.notes || "",
      isRentedVehicle: trip.is_rented_vehicle === 1 || trip.is_rented_vehicle === true,
      rentedPlate: trip.rented_plate || "",
      rentedModel: trip.rented_model || "",
      rentedCompany: trip.rented_company || "",
      startLocation: trip.start_latitude && trip.start_longitude
        ? { lat: trip.start_latitude, lng: trip.start_longitude }
        : undefined,
      startTime,
    }));

    // Recarrega fotos de observação armazenadas como base64 (quando existir).
    if (trip.trip_photos_base64) {
      try {
        const parsed = JSON.parse(trip.trip_photos_base64);
        if (Array.isArray(parsed)) {
          setImageBase64List(parsed);
        }
      } catch (err) {
        console.warn("[TripForm] Não foi possível reprocessar trip_photos_base64 do SQLite:", err);
      }
    }

    setCurrentLocalTripId(localTripId);
    setCurrentServerTripId(serverTripId);
    setElapsedTime(elapsed > 0 ? elapsed : 0);
    setIsActive(true);

    toast.info("Viagem em andamento restaurada", {
      description: `Iniciada às ${startTime.toLocaleTimeString("pt-BR")}`,
    });
  };

  // Função auxiliar para restaurar estado do form a partir de viagem do servidor
  const restoreTripStateFromServer = (trip: any) => {
    const startTime = new Date(trip.start_time);
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    setTripData((prev) => ({
      ...prev,
      employeeId: trip.employee_id || "",
      employeePhotoUrl: trip.employee_photo_url || undefined, // URL da foto do servidor
      vehicleId: trip.vehicle_id || "",
      initialKm: String(trip.initial_km || ""),
      origin: trip.origin || "",
      destination: trip.destination || "",
      reason: trip.reason || "",
      observation: trip.notes || "",
      isRentedVehicle: trip.is_rented_vehicle === true,
      rentedPlate: trip.rented_plate || "",
      rentedModel: trip.rented_model || "",
      rentedCompany: trip.rented_company || "",
      startLocation: trip.start_latitude && trip.start_longitude
        ? { lat: trip.start_latitude, lng: trip.start_longitude }
        : undefined,
      startTime,
    }));

    setCurrentLocalTripId(null);
    setCurrentServerTripId(trip.id);
    setElapsedTime(elapsed > 0 ? elapsed : 0);
    setIsActive(true);

    toast.info("Viagem em andamento restaurada", {
      description: `Iniciada às ${startTime.toLocaleTimeString("pt-BR")}`,
    });
  };

  // Carrega employees/vehicles assim que o SQLite estiver pronto
  useEffect(() => {
    if (!isReady) return;

    const loadData = async () => {
      const emps = await getMotoristas();
      const vehs = await getVeiculos();
      setEmployees(emps);
      setVehicles(vehs);
    };

    loadData();
  }, [isReady, getMotoristas, getVeiculos, lastSyncAt]);


  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isActive]);

  // Recalcula o cronômetro quando o app volta ao foreground ou a aba é reativada (evita tempo “congelado”).
  useEffect(() => {
    const recalcElapsed = () => {
      if (isActive && tripData.startTime) {
        const diff = Math.floor(
          (Date.now() - tripData.startTime.getTime()) / 1000
        );
        setElapsedTime(diff > 0 ? diff : 0);
      }
    };

    const appSubPromise = App.addListener("appStateChange", ({ isActive: appActive }) => {
      if (appActive) recalcElapsed();
    });

    const visibilityHandler = () => {
      if (!document.hidden) recalcElapsed();
    };

    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      appSubPromise.then((sub) => sub.remove());
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [isActive, tripData.startTime]);

  const ensureLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      const permission = await Geolocation.checkPermissions();
      if (permission.location === "granted") return true;

      const requested = await Geolocation.requestPermissions();
      const granted = requested.location === "granted";

      if (!granted) {
        toast.error("Permita a localização em segundo plano para rastrear a viagem.");
      }

      return granted;
    } catch (error) {
      console.error("[TripForm] Erro ao checar permissões de localização:", error);
      return false;
    }
  }, []);

  const persistPosition = async (position: GeolocationPosition, source: string) => {
    // Se não há viagem ativa, ignore captura para não poluir o banco.
    if (!currentLocalTripId && !currentServerTripId) {
      console.warn("[TripForm] Ignorando posição pois não há viagem ativa");
      return;
    }

    // Throttle para não registrar mais de 1 ponto < ~10s (watch + bg)
    const now = Date.now();
    if (lastCaptureRef.current && now - lastCaptureRef.current < 10000) {
      return;
    }

    const positionData = {
      local_trip_id: currentLocalTripId ?? undefined,
      server_trip_id: currentServerTripId ?? undefined,
      captured_at: new Date().toISOString(),
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      speed: position.coords.speed ?? null,
      accuracy: position.coords.accuracy ?? null,
      device_id: deviceId ?? undefined,
      needs_sync: 1,
      deleted: 0,
    };

    const saved = await saveTripPosition(positionData);
    if (saved) {
      lastCaptureRef.current = now;
      lastPositionRef.current = position;
      console.log(
        `[TripForm] (${source}) Posição capturada: ${position.coords.latitude.toFixed(
          6
        )}, ${position.coords.longitude.toFixed(6)}`
      );
    } else {
      console.error("[TripForm] Erro ao salvar posição");
    }
  };

  const captureAndSavePosition = useCallback(
    async (reason: string): Promise<boolean> => {
      const hasPermission = await ensureLocationPermission();
      if (!hasPermission) return false;

      try {
        // Tentativa rápida (menor precisão) para evitar timeout com tela apagada
        try {
          const fast = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 12000,
            maximumAge: 60000,
          });
          if (fast?.coords) {
            await persistPosition(fast, `${reason}_fast`);
            return true;
          }
        } catch (errFast) {
          console.warn("[TripForm] Fast location falhou, tentando alta precisão:", errFast);
        }

        // Tentativa com alta precisão e timeout maior (30s) para segundo plano
        const precise = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 60000,
        });

        await persistPosition(precise, reason);
        return true;
      } catch (error) {
        console.error(`[TripForm] Erro ao capturar posição (${reason}):`, error);
        // Fallback: usa última posição conhecida para não perder amostra
        if (lastPositionRef.current?.coords) {
          console.warn("[TripForm] Usando última posição conhecida (fallback after error)");
          await persistPosition(lastPositionRef.current, `${reason}_fallback_last`);
          return true;
        }
        return false;
      }
    },
    [currentLocalTripId, currentServerTripId, deviceId, ensureLocationPermission, saveTripPosition]
  );

  const stopLocationTracking = useCallback(() => {
    if (locationTrackingRef.current) {
      clearInterval(locationTrackingRef.current);
      locationTrackingRef.current = null;
    }

    if (locationWatchIdRef.current) {
      Geolocation.clearWatch({ id: locationWatchIdRef.current });
      locationWatchIdRef.current = null;
    }

    if (bgWatcherRef.current) {
      stopBackgroundWatcher(bgWatcherRef.current);
      bgWatcherRef.current = null;
    }
  }, []);

  const startLocationTracking = useCallback(async () => {
    stopLocationTracking();

    // Não inicia tracking se não houver viagem ativa (local_id)
    if (!currentLocalTripId) {
      console.warn("[TripForm] Tracking não iniciado: sem local_id de viagem ativa");
      return;
    }

    const hasPermission = await ensureLocationPermission();
    if (!hasPermission) return;

    await captureAndSavePosition("start");

    locationWatchIdRef.current = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 20000, // mais tolerante quando tela está apagada
        maximumAge: 15000,
        // allowBackground não está tipado em @capacitor/geolocation, mas alguns plugins honram essa flag.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(Capacitor.isNativePlatform() ? ({ allowBackground: true } as any) : {}),
      },
      async (position, error) => {
        if (error) {
          console.error("[TripForm] Erro no watchPosition:", error);
          return;
        }
        if (!position) return;
        await persistPosition(position, "watch");
      }
    );

    // Fallback: força captura se nenhuma posição chegar em ~15s
    locationTrackingRef.current = setInterval(async () => {
      const now = Date.now();
      const elapsedSinceLast = lastCaptureRef.current
        ? now - lastCaptureRef.current
        : Number.MAX_SAFE_INTEGER;

      if (elapsedSinceLast >= 14000) {
        const ok = await captureAndSavePosition("interval_fallback");
        if (!ok) {
          setTimeout(() => {
            captureAndSavePosition("interval_retry").catch((err) =>
              console.error("[TripForm] Erro em retry de posição:", err)
            );
          }, 5000);
        }
      }
    }, 15000);

    // Watcher em segundo plano (foreground service do plugin)
    bgWatcherRef.current = await startBackgroundWatcher(async (loc) => {
      const fakePosition: GeolocationPosition = {
        coords: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy ?? 0,
          altitude: loc.altitude ?? null,
          altitudeAccuracy: loc.altitudeAccuracy ?? null,
          heading: loc.bearing ?? null,
          speed: loc.speed ?? null,
        },
        timestamp: loc.time ?? Date.now(),
      };
      await persistPosition(fakePosition, "bg_watcher");
    });

    console.log("[TripForm] Rastreamento de localização iniciado (watch + bg watcher + fallback 15s)");
  }, [captureAndSavePosition, ensureLocationPermission, stopLocationTracking]);

  // ========= RASTREAMENTO DE LOCALIZAÇÃO A CADA 30 SEGUNDOS =========
  useEffect(() => {
    if (!isActive) {
      stopLocationTracking();
      return;
    }
    startLocationTracking();

    return () => {
      stopLocationTracking();
    };
  }, [isActive, startLocationTracking, stopLocationTracking]);

  // Trava navegação: seta lock global e bloqueia backButton nativo enquanto viagem ativa
  useEffect(() => {
    setTripLocked(isActive);

    if (!Capacitor.isNativePlatform()) return;
    if (!isActive) return;

    const subPromise = App.addListener("backButton", (ev) => {
      ev.preventDefault?.();
    });

    return () => {
      subPromise.then((sub) => sub.remove());
    };
  }, [isActive, setTripLocked]);

  // Background watcher já mantém o serviço; apenas para quando sair da viagem
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!isActive) {
      stopBackgroundWatcher(bgWatcherRef.current);
      bgWatcherRef.current = null;
    }
    return () => {
      stopBackgroundWatcher(bgWatcherRef.current);
      bgWatcherRef.current = null;
    };
  }, [isActive]);

  useEffect(() => {
    const subPromise = App.addListener("appStateChange", ({ isActive: appActive }) => {
      if (appActive && isActive) {
        console.log("[TripForm] App retomado; reiniciando rastreamento de localização");
        lastCaptureRef.current = null;
        startLocationTracking().catch((err) =>
          console.error("[TripForm] Erro ao recapturar na retomada:", err)
        );
      }
    });

    return () => {
      subPromise.then((sub) => sub.remove());
    };
  }, [isActive, startLocationTracking]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getCurrentLocation = async (): Promise<{ lat: number; lng: number }> => {
    try {
      const permission = await Geolocation.checkPermissions();

      if (permission.location !== "granted") {
        const requestPermission = await Geolocation.requestPermissions();
        if (requestPermission.location !== "granted") {
          throw new Error("Permissão de localização negada");
        }
      }

      // Tentativa rápida com menor precisão para não travar início da viagem.
      try {
        const fast = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 7000,
          maximumAge: 30000,
        });
        if (fast?.coords) {
          lastPositionRef.current = fast;
          return { lat: fast.coords.latitude, lng: fast.coords.longitude };
        }
      } catch (fastErr) {
        console.warn("[TripForm] Falha na posição rápida, tentando alta precisão:", fastErr);
      }

      // Tentativa padrão com alta precisão.
      const precise = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });
      if (precise?.coords) {
        lastPositionRef.current = precise;
        return { lat: precise.coords.latitude, lng: precise.coords.longitude };
      }

      // Fallback: usa última posição conhecida para não travar início.
      if (lastPositionRef.current?.coords) {
        console.warn("[TripForm] Usando última posição conhecida (fallback).");
        return {
          lat: lastPositionRef.current.coords.latitude,
          lng: lastPositionRef.current.coords.longitude,
        };
      }

      throw new Error("Não foi possível obter localização");
    } catch (error) {
      throw new Error("Erro ao obter localização");
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  // Converte base64 em File para reenviar fotos quando só temos o cache offline.
  const base64ToFile = (base64: string, filename: string, mime = "image/jpeg"): File => {
    const arr = base64.split(",");
    const bstr = atob(arr.length > 1 ? arr[1] : arr[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  const handleStartTrip = async () => {
    // Garante deviceId antes de iniciar, para evitar duplicatas offline
    if (Capacitor.isNativePlatform() && !deviceId) {
      toast.error("Carregando identificador do dispositivo. Tente novamente em segundos.");
      return;
    }

    if (!tripData.employeeId || !tripData.employeePhoto) {
      toast.error(
        "Preencha os campos obrigatórios: Motorista e Foto do Motorista"
      );
      return;
    }

    if (!tripData.isRentedVehicle) {
      if (!tripData.vehicleId) {
        toast.error("Selecione um veículo cadastrado");
        return;
      }
    } else {
      if (!tripData.rentedPlate || !tripData.rentedModel) {
        toast.error("Preencha placa e modelo do veículo alugado");
        return;
      }
      
      // Valida formato da placa
      if (!validateLicensePlate(tripData.rentedPlate)) {
        toast.error("Placa inválida", {
          description: "Use o formato ABC-1234 ou ABC1D23"
        });
        return;
      }
    }

    if (!tripData.initialKm) {
      toast.error("Preencha o Km Inicial");
      return;
    }
    const initialKmNumber = parseFloat(tripData.initialKm);
    if (Number.isNaN(initialKmNumber)) {
      toast.error("Km Inicial inválido");
      return;
    }

    setIsCapturingLocation(true);
    try {
      const isNative = Capacitor.isNativePlatform();
      const sqliteAvailable =
        isNative &&
        ((isReady && hasDb) || (isSQLiteReady && hasSQLiteDb));
      const offlineMode = isNative && !isOnline;

      if (offlineMode && !sqliteAvailable) {
        toast.error("SQLite ainda não está pronto para salvar offline. Tente novamente em alguns segundos.");
        setIsCapturingLocation(false);
        return;
      }

      const location = await getCurrentLocation();
      const startTime = new Date();
      const localId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      // Se já existe viagem em andamento local, reaproveita para não duplicar
      if (sqliteAvailable) {
        const localOngoing = await getOngoingTrip(deviceId ?? undefined);
        if (localOngoing) {
          console.warn("[TripForm] Já existe viagem em andamento no SQLite, reutilizando:", localOngoing.local_id);
          setCurrentLocalTripId(localOngoing.local_id);
          setCurrentServerTripId(localOngoing.server_trip_id ?? null);
          setIsActive(true);
          setIsCapturingLocation(false);
          startLocationTracking();
          return;
        }
      }

      // Converte foto do motorista para base64 se for necessário salvar no SQLite
      let employeePhotoBase64: string | undefined;
      if (sqliteAvailable && tripData.employeePhoto) {
        employeePhotoBase64 = await fileToBase64(tripData.employeePhoto);
        employeePhotoBase64Ref.current = employeePhotoBase64;
      }

      const saveDraftOffline = async (options?: { needsSync?: number; serverTripId?: string | null; customLocalId?: string }) => {
        // Se já existe viagem em andamento no SQLite, não cria outra
        if (sqliteAvailable) {
          const localOngoing = await getOngoingTrip(deviceId ?? undefined);
          if (localOngoing) {
            console.warn("[TripForm] Viagem em andamento já existente, reaproveitando:", localOngoing.local_id);
            setCurrentLocalTripId(localOngoing.local_id);
            setCurrentServerTripId(localOngoing.server_trip_id ?? null);
            setIsActive(true);
            return true;
          }
        }
        const localTripId = await saveTripOffline({
          local_id: options?.customLocalId ?? localId,
          server_trip_id: options?.serverTripId ?? null,
          employee_id: tripData.employeeId,
          vehicle_id: tripData.isRentedVehicle ? null : tripData.vehicleId,
          status: "in_progress",
          initial_km: initialKmNumber,
          final_km: null,
          start_time: startTime.toISOString(),
          end_time: null,
          start_latitude: location.lat,
          start_longitude: location.lng,
          end_latitude: null,
          end_longitude: null,
          duration_seconds: null,
          origin: tripData.origin || null,
          destination: tripData.destination || null,
          reason: tripData.reason || null,
          notes: tripData.observation || null,
          employee_photo_base64: employeePhotoBase64,
          trip_photos_base64: null,
          is_rented_vehicle: tripData.isRentedVehicle ? 1 : 0,
          rented_plate: tripData.isRentedVehicle ? tripData.rentedPlate || null : null,
          rented_model: tripData.isRentedVehicle ? tripData.rentedModel || null : null,
          rented_company: tripData.isRentedVehicle ? tripData.rentedCompany || null : null,
          device_id: deviceId ?? null,
          needs_sync: options?.needsSync ?? 1,
          deleted: 0,
          last_updated: new Date().toISOString(),
        });

        if (localTripId) {
          setCurrentLocalTripId(localTripId);
          setCurrentServerTripId(options?.serverTripId ?? null);
          if (options?.serverTripId) {
            console.log("[TripForm] Espelho local criado com ID:", localTripId, "para server ID:", options.serverTripId);
          } else {
            console.log("[TripForm] Viagem draft criada offline com ID local:", localTripId);
          }
          return true;
        }

        console.error("[TripForm] Erro ao criar viagem draft no SQLite");
        toast.error("Não foi possível salvar a viagem offline", {
          description: sqliteAvailable
            ? "SQLite ainda não respondeu. Tente novamente ou reabra o app."
            : "SQLite indisponível no momento",
        });
        return false;
      };

      // Se offline, cria viagem "in_progress" no SQLite para vincular posições (mas evita duplicar)
      if (offlineMode && sqliteAvailable) {
        const saved = await saveDraftOffline({ needsSync: 1 });
        if (!saved) {
          setIsCapturingLocation(false);
          return;
        }
      } else if (isOnline) {
        // ONLINE: cria viagem "in_progress" no Supabase para vincular posições
        let employeePhotoUrl: string | null = null;
        if (tripData.employeePhoto) {
          const photoPath = `employees/${tripData.employeeId}/${Date.now()}.jpg`;
          employeePhotoUrl = await uploadPhoto(tripData.employeePhoto, photoPath);
        }

        const draftTripRecord = {
          local_id: localId,
          employee_id: tripData.employeeId,
          vehicle_id: tripData.isRentedVehicle ? null : tripData.vehicleId,
          initial_km: initialKmNumber,
          final_km: null,
          start_time: startTime.toISOString(),
          end_time: null,
          start_latitude: location.lat,
          start_longitude: location.lng,
          duration_seconds: null,
          status: "in_progress",
          origin: tripData.origin || null,
          destination: tripData.destination || null,
          reason: tripData.reason || null,
          notes: tripData.observation || null,
          employee_photo_url: employeePhotoUrl || undefined,
          is_rented_vehicle: tripData.isRentedVehicle,
          rented_plate: tripData.isRentedVehicle ? tripData.rentedPlate || null : null,
          rented_model: tripData.isRentedVehicle ? tripData.rentedModel || null : null,
          rented_company: tripData.isRentedVehicle ? tripData.rentedCompany || null : null,
          device_id: deviceId ?? null,
        };

        const { data, error } = await createTrip(draftTripRecord);
        if (error) {
          console.error("[TripForm] Erro ao criar viagem draft no Supabase:", error);
          if (sqliteAvailable) {
            console.warn("[TripForm] Falha no Supabase, salvando draft offline como fallback.");
            const saved = await saveDraftOffline({ needsSync: 1 });
            if (!saved) {
              setIsCapturingLocation(false);
              return;
            }
          } else {
            toast.error("Erro ao iniciar viagem no servidor");
            setIsCapturingLocation(false);
            return;
          }
        }

        if (data?.id) {
          setCurrentServerTripId(data.id);
          console.log("[TripForm] Viagem draft criada no Supabase com ID:", data.id);
          
          // ✅ CORREÇÃO: Criar espelho no SQLite quando em plataforma nativa
          // Usa isReady && hasDb do OfflineContext (fonte confiável do estado do SQLite)
          if (sqliteAvailable) {
            await saveDraftOffline({ needsSync: 0, serverTripId: data.id });
          } else if (isNative) {
            console.warn("[TripForm] SQLite não pronto para criar espelho local. isReady:", isReady, "hasDb:", hasDb);
          }
        } else if (sqliteAvailable) {
          console.warn("[TripForm] Supabase não retornou ID. Salvando draft offline.");
          const saved = await saveDraftOffline({ needsSync: 1 });
          if (!saved) {
            setIsCapturingLocation(false);
            return;
          }
        }
      } else if (sqliteAvailable) {
        // Sem internet detectada mas com rede marcada como online -> salva offline como fallback
        const saved = await saveDraftOffline({ needsSync: 1 });
        if (!saved) {
          setIsCapturingLocation(false);
          return;
        }
      } else {
        toast.error("Não foi possível iniciar a viagem. Verifique a conexão ou o SQLite.");
        setIsCapturingLocation(false);
        return;
      }

      setTripData((prev) => ({
        ...prev,
        startLocation: location,
        startTime,
      }));

      setIsActive(true);
      setElapsedTime(0);

      toast.success("Viagem iniciada!", {
        description: `Localização capturada: ${location.lat.toFixed(
          6
        )}, ${location.lng.toFixed(6)}`,
      });
    } catch (error) {
      toast.error("Erro ao capturar localização", {
        description: "Permita o acesso à localização para iniciar a viagem",
      });
    } finally {
      setIsCapturingLocation(false);
    }
  };

  const handleEndTrip = () => {
    setShowEndTripDialog(true);
  };

  const confirmEndTrip = async () => {
    if (!tempFinalKm || tempFinalKm.trim() === "") {
      toast.error("Preencha o Km Final para finalizar a viagem");
      return;
    }
    const isNative = Capacitor.isNativePlatform();
    // Usa ambos os flags (Provider + hook) para não bloquear por um único estado desatualizado.
    const sqliteAvailable =
      isNative && ((isReady && hasDb) || (isSQLiteReady && hasSQLiteDb));

    setShowEndTripDialog(false);
    setIsCapturingLocation(true);

    try {
      const location = await getCurrentLocation();
      const endTime = new Date();

      setTripData(prev => ({
        ...prev,
        endLocation: location,
      }));

      // Converte fotos para base64 para garantir persistência offline.
      const tripPhotosBase64 =
        imageBase64List.length > 0
          ? imageBase64List
          : await Promise.all(tripData.images.map((img) => fileToBase64(img)));

      const employeePhotoBase64 =
        (tripData.employeePhotoUrl?.startsWith("data:")
          ? tripData.employeePhotoUrl
          : undefined) ||
        employeePhotoBase64Ref.current ||
        (tripData.employeePhoto
          ? await fileToBase64(tripData.employeePhoto)
          : undefined);

      let localFinalized = false;

      const finalizeLocalTrip = async (needsSyncFlag: number, serverId?: string | null) => {
        if (!sqliteAvailable) return;

        // Se por algum motivo perdemos o local_id, tenta recuperar a viagem em andamento
        let targetLocalId = currentLocalTripId;
        if (!targetLocalId) {
          const localOngoing = await getOngoingTrip(deviceId ?? undefined);
          if (localOngoing?.local_id) {
            targetLocalId = localOngoing.local_id;
            setCurrentLocalTripId(localOngoing.local_id);
            setCurrentServerTripId(localOngoing.server_trip_id ?? null);
          }
        }
        if (!targetLocalId) {
          throw new Error("Não foi possível localizar a viagem offline para finalizar");
        }

        const updates = {
          final_km: parseFloat(tempFinalKm),
          end_time: endTime.toISOString(),
          end_latitude: location.lat,
          end_longitude: location.lng,
          duration_seconds: elapsedTime,
          origin: tripData.origin || null,
          destination: tripData.destination || null,
          reason: tripData.reason || null,
          notes: tripData.observation || null,
          trip_photos_base64:
            tripPhotosBase64.length > 0 ? JSON.stringify(tripPhotosBase64) : null,
          employee_photo_base64: employeePhotoBase64 ?? null,
          device_id: deviceId ?? null,
          needs_sync: needsSyncFlag,
          status: "finalized",
          server_trip_id: serverId ?? null,
        };
        const updated = await updateTripOnEnd(targetLocalId, updates);
        if (!updated) {
          throw new Error("Erro ao atualizar viagem offline");
        }
        await dumpOfflineTrips("after_finalize_local");
        // Atualiza cache em memória para evitar novo fallback duplicado.
        setCurrentServerTripId(serverId ?? currentServerTripId);
        console.log("[TripForm] ✅ Viagem finalizada localmente (needs_sync=%s) ID:", needsSyncFlag, targetLocalId);
        localFinalized = true;
      };

      // Finaliza local imediatamente para garantir persistência offline-first
      if (sqliteAvailable && !localFinalized) {
        await finalizeLocalTrip(isOnline ? 1 : 1, currentServerTripId ?? null);
      }

      const shouldSaveOffline =
        isNative && !isOnline && sqliteAvailable;

      if (shouldSaveOffline) {
        if (!localFinalized) {
          await finalizeLocalTrip(1, currentServerTripId ?? null);
        }
        setIsActive(false);
        setTripLocked(false);
        toast.success("Viagem salva offline!", {
          description: "Será sincronizada quando houver internet",
        });
      } else {
        // ONLINE: atualiza ou cria viagem no Supabase e mantém o espelho local consistente.
        const tripPhotosUrls: string[] = [];
        // Usa imagens em memória ou fallback base64 armazenado.
        if (tripData.images.length > 0) {
          for (let i = 0; i < tripData.images.length; i++) {
            const photoPath = `trips/${Date.now()}_${i}.jpg`;
            const url = await uploadPhoto(tripData.images[i], photoPath);
            if (url) tripPhotosUrls.push(url);
          }
        } else if (imageBase64List.length > 0) {
          for (let i = 0; i < imageBase64List.length; i++) {
            const file = base64ToFile(imageBase64List[i], `trip_cached_${i}.jpg`);
            const photoPath = `trips/${Date.now()}_${i}.jpg`;
            const url = await uploadPhoto(file, photoPath);
            if (url) tripPhotosUrls.push(url);
          }
        }

        if (currentServerTripId) {
          const tripUpdates = {
            final_km: parseFloat(tempFinalKm),
            end_time: endTime.toISOString(),
            end_latitude: location.lat,
            end_longitude: location.lng,
            duration_seconds: elapsedTime,
            destination: tripData.destination || null,
            notes: tripData.observation || null,
            status: "finalized",
            local_id: currentLocalTripId ?? undefined,
            trip_photos_urls:
              tripPhotosUrls.length > 0 ? tripPhotosUrls : undefined,
          };

          console.log("[TripForm] Finalizando viagem no Supabase - ID:", currentServerTripId);
          const { error } = await updateTrip(currentServerTripId, tripUpdates);

          if (error) {
            console.error("[TripForm] ❌ Erro ao finalizar viagem:", error);
            throw new Error("Erro ao atualizar viagem no banco de dados");
          }

          console.log("[TripForm] ✅ Viagem finalizada (online) no Supabase:", currentServerTripId);

          if (sqliteAvailable) {
            await finalizeLocalTrip(0, currentServerTripId);
          }
        } else {
          // Sem server ID (ex: viagem iniciou offline): cria no Supabase e vincula ao espelho local.
          let employeePhotoUrl: string | null = null;
          if (tripData.employeePhoto) {
            const photoPath = `employees/${tripData.employeeId}/${Date.now()}.jpg`;
            employeePhotoUrl = await uploadPhoto(tripData.employeePhoto, photoPath);
          }

          let targetLocalId = currentLocalTripId;
          if (!targetLocalId && sqliteAvailable) {
            const localOngoing = await getOngoingTrip(deviceId ?? undefined);
            if (localOngoing?.local_id) targetLocalId = localOngoing.local_id;
          }

          if (!targetLocalId) {
            throw new Error("Não foi possível identificar o local_id da viagem para sincronizar");
          }

          setCurrentLocalTripId(targetLocalId);

          const tripRecord = {
            local_id: targetLocalId,
            employee_id: tripData.employeeId,
            vehicle_id: tripData.isRentedVehicle ? null : tripData.vehicleId,
            initial_km: parseFloat(tripData.initialKm),
            final_km: parseFloat(tempFinalKm),
            start_time: tripData.startTime!.toISOString(),
            end_time: endTime.toISOString(),
            start_latitude: tripData.startLocation?.lat,
            start_longitude: tripData.startLocation?.lng,
            end_latitude: location.lat,
            end_longitude: location.lng,
            duration_seconds: elapsedTime,
            origin: tripData.origin || null,
            destination: tripData.destination || null,
            reason: tripData.reason || null,
            notes: tripData.observation || null,
            status: "finalized",
            employee_photo_url: employeePhotoUrl || undefined,
            trip_photos_urls:
              tripPhotosUrls.length > 0 ? tripPhotosUrls : undefined,
            is_rented_vehicle: tripData.isRentedVehicle,
            rented_plate: tripData.isRentedVehicle ? tripData.rentedPlate || null : null,
            rented_model: tripData.isRentedVehicle ? tripData.rentedModel || null : null,
            rented_company: tripData.isRentedVehicle ? tripData.rentedCompany || null : null,
            device_id: deviceId ?? null,
          };

          const { data, error } = await createTrip(tripRecord);

          if (error) {
            // Se falhou no Supabase, mantém finalização local pendente de sync
            console.error("[TripForm] Supabase falhou ao criar viagem, mantendo offline pendente");
            if (sqliteAvailable && !localFinalized) {
              await finalizeLocalTrip(1, currentServerTripId ?? null);
            }
            throw new Error("Erro ao salvar viagem no banco de dados");
          }

          if (data?.id) {
            setCurrentServerTripId(data.id);
            console.log("[TripForm] Viagem criada/atualizada no Supabase com ID:", data.id, "local_id:", targetLocalId);
            if (sqliteAvailable) {
              await finalizeLocalTrip(0, data.id);
            }
          }
        }

        setIsActive(false);
        setTripLocked(false);

        toast.success("Viagem finalizada e salva!", {
          description: `Duração: ${formatTime(elapsedTime)}`,
        });
      }

      // ✅ Limpa todos os estados após finalização bem-sucedida
      setTripData({
        employeeId: "",
        employeePhoto: null,
        employeePhotoUrl: undefined,
        vehicleId: "",
        initialKm: "",
        finalKm: "",
        origin: "",
        destination: "",
        reason: "",
        observation: "",
        images: [],
        isRentedVehicle: false,
        rentedPlate: "",
        rentedModel: "",
        rentedCompany: "",
      });
    setTempFinalKm("");
    setElapsedTime(0);
    setImageBase64List([]);
    employeePhotoBase64Ref.current = null;
    // ✅ Limpa IDs de rastreamento de posição
    setCurrentLocalTripId(null);
    setCurrentServerTripId(null);
    
    console.log("[TripForm] ✅ Estados limpos - pronto para nova viagem");
    } catch (error) {
      console.error("Error ending trip:", error);
      toast.error("Erro ao finalizar viagem", {
        description:
          error instanceof Error ? error.message : "Tente novamente",
      });
    } finally {
      setIsCapturingLocation(false);
    }
  };

  const handleEmployeePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      setTripData((prev) => ({
        ...prev,
        employeePhoto: file,
      }));
      try {
        // Guarda base64 para uso offline e evita perda se a conexão cair.
        const base64 = await fileToBase64(file);
        employeePhotoBase64Ref.current = base64;
      } catch (err) {
        console.error("[TripForm] Falha ao converter foto do motorista para base64:", err);
      }
      toast.success("Foto do motorista capturada");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files);
      setTripData((prev) => ({
        ...prev,
        images: [...prev.images, ...newImages],
      }));

      // Converte para base64 para persistir mesmo offline/background.
      try {
        const newBase64 = await Promise.all(newImages.map((img) => fileToBase64(img)));
        const combined = [...imageBase64List, ...newBase64];
        setImageBase64List(combined);

        const sqliteAvailable =
          Capacitor.isNativePlatform() && ((isReady && hasDb) || (isSQLiteReady && hasSQLiteDb));
        if (sqliteAvailable && currentLocalTripId) {
          await updateTripPhotos(currentLocalTripId, JSON.stringify(combined));
        }
      } catch (err) {
        console.error("[TripForm] Falha ao converter imagens para base64:", err);
      }

      toast.success(`${newImages.length} imagem(ns) adicionada(s)`);
    }
  };

  const handleBarcodeScanner = async () => {
    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHintALLOption.ALL,
        scanInstructions: "Aponte a câmera para o código de barras do crachá",
        scanButton: true,
        scanText: "Ler crachá",
      });

      const scanned = result?.ScanResult?.trim();

      if (!scanned) {
        toast.error("Nenhum código foi lido");
        return;
      }

      const employee = employees.find((emp) => emp.registration_id === scanned);

      if (employee) {
        setTripData((prev) => ({
          ...prev,
          employeeId: employee.id,
        }));
        toast.success("Motorista identificado", {
          description: employee.nome_completo,
        });
      } else {
        toast.error("Motorista não encontrado", {
          description: `Matrícula ${scanned} não cadastrada`,
        });
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao escanear código de barras");
    }
  };

  /**
   * Formata a placa do veículo automaticamente
   * - Converte para UPPERCASE
   * - Detecta formato antigo (ABC-1234) ou Mercosul (ABC1D23)
   * - Remove caracteres inválidos
   * - Adiciona hífen automaticamente no formato antigo
   */
  const formatLicensePlate = (value: string): string => {
    // Remove tudo que não é letra ou número
    let cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Limita a 7 caracteres
    cleaned = cleaned.slice(0, 7);
    
    if (cleaned.length === 0) return '';
    
    // Detecta o formato baseado no conteúdo
    // Formato antigo: 3 letras + 4 números (ABC1234 → ABC-1234)
    // Formato Mercosul: 3 letras + 1 número + 1 letra + 2 números (ABC1D23)
    
    if (cleaned.length <= 3) {
      // Apenas letras iniciais
      return cleaned.replace(/[^A-Z]/g, '').slice(0, 3);
    }
    
    const firstThree = cleaned.slice(0, 3).replace(/[^A-Z]/g, '');
    const rest = cleaned.slice(3);
    
    // Se o 4º caractere for número e temos mais de 4 caracteres
    if (rest.length > 0) {
      const fourthChar = rest[0];
      
      // Tenta detectar formato Mercosul: ABC1X23
      // Se após o primeiro número há uma letra, é Mercosul
      if (rest.length >= 2 && /[0-9]/.test(fourthChar) && /[A-Z]/.test(rest[1])) {
        // Formato Mercosul: ABC1D23
        const num1 = rest[0].replace(/[^0-9]/g, '');
        const letter = rest[1].replace(/[^A-Z]/g, '');
        const num2 = rest.slice(2).replace(/[^0-9]/g, '').slice(0, 2);
        return `${firstThree}${num1}${letter}${num2}`;
      }
      
      // Formato antigo: ABC-1234 (apenas números após as letras)
      const numbers = rest.replace(/[^0-9]/g, '').slice(0, 4);
      if (numbers.length > 0) {
        return `${firstThree}-${numbers}`;
      }
    }
    
    return firstThree;
  };

  /**
   * Valida se a placa está em um formato válido
   * - Formato antigo: ABC-1234 (3 letras + hífen + 4 números)
   * - Formato Mercosul: ABC1D23 (3 letras + 1 número + 1 letra + 2 números)
   */
  const validateLicensePlate = (value: string): boolean => {
    if (!value || value.trim() === '') return false;
    
    const plate = value.trim().toUpperCase();
    
    // Formato antigo: ABC-1234
    const oldFormat = /^[A-Z]{3}-[0-9]{4}$/;
    
    // Formato Mercosul: ABC1D23
    const mercosulFormat = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
    
    return oldFormat.test(plate) || mercosulFormat.test(plate);
  };

  /**
   * Handler para mudança no campo de placa
   * Formata automaticamente e valida
   */
  const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicensePlate(e.target.value);
    
    setTripData((prev) => ({ 
      ...prev, 
      rentedPlate: formatted 
    }));
    
    // Valida e atualiza mensagem de erro
    if (formatted.length > 0 && formatted.length >= 7) {
      if (!validateLicensePlate(formatted)) {
        setPlateError("Formato inválido. Use ABC-1234 ou ABC1D23");
      } else {
        setPlateError("");
      }
    } else {
      setPlateError("");
    }
  };

  // 🔥 TESTE VISÍVEL DO SQLITE (OPÇÃO 2)
  const handleTestSQLite = async () => {
    try {
      const result = await CapacitorSQLite.echo({ value: "test" });

      const msg = `SQLite OK: ${JSON.stringify(result)}`;
      setSqliteStatus(msg);

      toast.success("SQLite Funcionou", {
        description: msg,
      });
    } catch (error: any) {
      const msg = `ERRO SQLite: ${
        (error && (error as any).message) || String(error)
      }`;
      setSqliteStatus(msg);

      toast.error("Erro no SQLite", {
        description: msg,
      });
    }
  };

  // 🔽 AQUI entra apenas o PullToRefresh envolvendo o conteúdo
  return (
    <PullToRefresh
      onRefresh={syncNow}
      isRefreshing={isSyncing}
      className="max-w-2xl mx-auto p-4 space-y-4"
    >
      {Capacitor.isNativePlatform() && !isOnline && (
        <Card className="bg-yellow-500/10 border-yellow-500/50">
          <CardContent className="py-3">
            <p className="text-center text-sm font-medium">
              📡 Modo Offline - Viagens serão sincronizadas quando houver
              internet
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading ongoing trip indicator */}
      {isLoadingOngoingTrip && (
        <Card className="bg-muted/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-3">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">
                Verificando viagem em andamento...
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {isActive && (
        <Card className="bg-gradient-to-r from-trip-active to-secondary">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-3 text-white">
              <Clock className="h-6 w-6" />
              <span className="text-2xl font-bold tabular-nums">
                {formatTime(elapsedTime)}
              </span>
            </div>
            <p className="text-center text-white/90 text-sm mt-1">
              Viagem em andamento
            </p>
          </CardContent>
        </Card>
      )}

      {/* Driver Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Motorista *
            </Label>
            <Button variant="ghost" size="sm" onClick={handleBarcodeScanner}>
              <QrCode className="h-4 w-4" />
            </Button>
          </div>
          <SearchableCombobox
            options={employees.map((emp) => ({
              value: emp.id,
              label: `${emp.full_name} (${emp.registration_id})`,
              searchText: `${emp.full_name} ${emp.registration_id} ${emp.position}`,
            }))}
            value={tripData.employeeId}
            onChange={(value) =>
              setTripData((prev) => ({ ...prev, employeeId: value }))
            }
            placeholder="Digite nome ou matrícula..."
            emptyText="Nenhum motorista encontrado."
            disabled={isActive || isViewMode}
            minCharsToSearch={2}
          />
        </CardContent>
      </Card>

      {/* Driver Photo Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label
            htmlFor="employeePhoto"
            className="text-base font-semibold flex items-center gap-2"
          >
            <Camera className="h-4 w-4 text-primary" />
            Foto do Motorista *
          </Label>
          <div className="space-y-3">
            {/* Botão só aparece se não estiver em viagem ativa ou em modo visualização */}
            {!isActive && !isViewMode && (
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 flex items-center justify-center gap-2 border-2 border-dashed hover:border-primary"
                onClick={() => employeePhotoInputRef.current?.click()}
              >
                <Camera className="h-5 w-5" />
                <span>Tirar Foto do Motorista</span>
              </Button>
            )}
            <Input
              id="employeePhoto"
              ref={employeePhotoInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleEmployeePhotoUpload}
              disabled={isActive || isViewMode}
              className="hidden"
            />
            {/* Mostra foto capturada (File) */}
            {tripData.employeePhoto && !isActive && !isViewMode && (
              <div className="relative w-full max-w-xs mx-auto">
                <img
                  src={URL.createObjectURL(tripData.employeePhoto)}
                  alt="Foto do motorista"
                  className="w-full h-48 object-cover rounded-lg border-2 border-primary"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() =>
                    setTripData((prev) => ({ ...prev, employeePhoto: null }))
                  }
                >
                  Remover
                </Button>
              </div>
            )}
            {/* Mostra foto recuperada (URL/base64) quando viagem em andamento ou em modo visualização */}
            {(isActive || isViewMode) && tripData.employeePhotoUrl && (
              <div className="relative w-full max-w-xs mx-auto">
                <img
                  src={tripData.employeePhotoUrl}
                  alt="Foto do motorista"
                  className="w-full h-48 object-cover rounded-lg border-2 border-primary opacity-90"
                />
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  Foto registrada
                </div>
              </div>
            )}
            {/* Mostra foto capturada (File) quando viagem em andamento ou modo visualização - sem botão de remover */}
            {(isActive || isViewMode) && tripData.employeePhoto && !tripData.employeePhotoUrl && (
              <div className="relative w-full max-w-xs mx-auto">
                <img
                  src={URL.createObjectURL(tripData.employeePhoto)}
                  alt="Foto do motorista"
                  className="w-full h-48 object-cover rounded-lg border-2 border-primary opacity-90"
                />
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  Foto registrada
                </div>
              </div>
            )}
            {/* Mensagem quando viagem ativa mas sem foto */}
            {isActive && !tripData.employeePhotoUrl && !tripData.employeePhoto && (
              <div className="w-full h-48 flex items-center justify-center bg-muted rounded-lg border-2 border-dashed">
                <span className="text-muted-foreground text-sm">Foto não disponível</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vehicle Section - Reorganized UI */}
      <Card>
        <CardContent className="pt-6 pb-6">
          {/* Section Header */}
          <div className="mb-5">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Car className="h-5 w-5 text-primary" />
              Veículo
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione um veículo da frota ou marque a opção de veículo alugado
            </p>
          </div>

          {/* Toggle for Rented Vehicle */}
          <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50 mb-5">
            <Checkbox
              id="isRented"
              checked={tripData.isRentedVehicle}
              onCheckedChange={(checked) => {
                setTripData((prev) => ({
                  ...prev,
                  isRentedVehicle: checked === true,
                  vehicleId: "",
                  rentedPlate: "",
                  rentedModel: "",
                  rentedCompany: "",
                }));
              }}
              disabled={isActive || isViewMode}
              className="h-5 w-5"
            />
            <Label 
              htmlFor="isRented" 
              className="text-sm font-medium cursor-pointer flex items-center gap-2"
            >
              <CarFront className="h-4 w-4 text-muted-foreground" />
              Veículo alugado / não cadastrado
            </Label>
          </div>

          {/* Mode 1: Fleet Vehicle */}
          {!tripData.isRentedVehicle && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                Veículo da Frota *
              </Label>
              <SearchableCombobox
                options={vehicles.map((veh) => ({
                  value: veh.id,
                  label: `${veh.license_plate} - ${veh.brand} ${veh.model}`,
                  searchText: `${veh.license_plate} ${veh.brand} ${veh.model}`,
                }))}
                value={tripData.vehicleId}
                onChange={(value) =>
                  setTripData((prev) => ({ ...prev, vehicleId: value }))
                }
                placeholder="Digite placa ou modelo..."
                emptyText="Nenhum veículo encontrado."
                disabled={isActive || isViewMode}
                minCharsToSearch={2}
              />
              <p className="text-xs text-muted-foreground">
                Escolha um veículo cadastrado na frota
              </p>
            </div>
          )}

          {/* Mode 2: Rented Vehicle */}
          {tripData.isRentedVehicle && (
            <div className="space-y-4 p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CarFront className="h-4 w-4" />
                Dados do Veículo Alugado
              </div>

              {/* Rented Plate Field */}
              <div className="space-y-2">
                <Label htmlFor="rentedPlate" className="text-sm font-medium">
                  Placa do veículo *
                </Label>
                <Input
                  id="rentedPlate"
                  type="text"
                  placeholder="ABC-1234 ou ABC1D23"
                  value={tripData.rentedPlate}
                  onChange={handlePlateChange}
                  disabled={isActive || isViewMode}
                  className={`h-12 ${plateError ? 'border-destructive focus-visible:ring-destructive' : ''} ${isActive || isViewMode ? "bg-muted cursor-not-allowed" : ""}`}
                  maxLength={8}
                />
                {plateError && (
                  <p className="text-xs text-destructive font-medium">
                    {plateError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Formato antigo (ABC-1234) ou Mercosul (ABC1D23)
                </p>
              </div>

              {/* Rented Model Field */}
              <div className="space-y-2">
                <Label htmlFor="rentedModel" className="text-sm font-medium">
                  Modelo / descrição *
                </Label>
                <Input
                  id="rentedModel"
                  type="text"
                  placeholder="Ex: Fiat Uno 2020"
                  value={tripData.rentedModel}
                  onChange={(e) =>
                    setTripData((prev) => ({ ...prev, rentedModel: e.target.value }))
                  }
                  disabled={isActive || isViewMode}
                  className={`h-12 ${isActive || isViewMode ? "bg-muted cursor-not-allowed" : ""}`}
                />
              </div>

              {/* Rented Company Field */}
              <div className="space-y-2">
                <Label htmlFor="rentedCompany" className="text-sm font-medium text-muted-foreground">
                  Locadora / proprietário (opcional)
                </Label>
                <Input
                  id="rentedCompany"
                  type="text"
                  placeholder="Ex: Localiza, Movida..."
                  value={tripData.rentedCompany}
                  onChange={(e) =>
                    setTripData((prev) => ({ ...prev, rentedCompany: e.target.value }))
                  }
                  disabled={isActive || isViewMode}
                  className={`h-12 ${isActive || isViewMode ? "bg-muted cursor-not-allowed" : ""}`}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Initial KM Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label htmlFor="initialKm" className="text-base font-semibold">
            Km Inicial *
          </Label>
          <Input
            id="initialKm"
            type="number"
            placeholder="Quilometragem atual"
            value={tripData.initialKm}
            onChange={(e) =>
              setTripData((prev) => ({
                ...prev,
                initialKm: e.target.value,
              }))
            }
            disabled={isActive || isViewMode}
            className={`h-12 ${isActive || isViewMode ? "bg-muted cursor-not-allowed" : ""}`}
          />
        </CardContent>
      </Card>

      {/* Origin & Destination */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-3">
            <Label
              htmlFor="origin"
              className="text-base font-semibold flex items-center gap-2"
            >
              <MapPin className="h-4 w-4 text-primary" />
              Origem
            </Label>
            <Input
              id="origin"
              placeholder="Local de saída"
              value={tripData.origin}
            onChange={(e) =>
              setTripData((prev) => ({ ...prev, origin: e.target.value }))
            }
            disabled={isActive || isViewMode}
            className={`h-12 ${isActive || isViewMode ? "bg-muted cursor-not-allowed" : ""}`}
            />
          </div>
          <div className="space-y-3">
            <Label
              htmlFor="destination"
              className="text-base font-semibold flex items-center gap-2"
            >
              <Navigation className="h-4 w-4 text-secondary" />
              Destino
            </Label>
            <Input
              id="destination"
              placeholder="Local de destino"
              value={tripData.destination}
              onChange={(e) =>
                setTripData((prev) => ({
                  ...prev,
                  destination: e.target.value,
                }))
              }
              disabled={isActive || isViewMode}
              className={`h-12 ${isActive || isViewMode ? "bg-muted cursor-not-allowed" : ""}`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Reason Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label
            htmlFor="reason"
            className="text-base font-semibold flex items-center gap-2"
          >
            <FileText className="h-4 w-4 text-primary" />
            Motivo da Viagem
          </Label>
          <Textarea
            id="reason"
            placeholder="Descreva o motivo da viagem"
            value={tripData.reason}
            onChange={(e) =>
              setTripData((prev) => ({ ...prev, reason: e.target.value }))
            }
            disabled={isActive || isViewMode}
            className={`min-h-24 resize-none ${isActive || isViewMode ? "bg-muted cursor-not-allowed" : ""}`}
          />
        </CardContent>
      </Card>

      {/* Observation Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label htmlFor="observation" className="text-base font-semibold">
            Observações
          </Label>
          <Textarea
            id="observation"
            placeholder="Registre observações, danos ou situações atípicas"
            value={tripData.observation}
            onChange={(e) =>
              setTripData((prev) => ({
                ...prev,
                observation: e.target.value,
              }))
            }
            disabled={isActive || isViewMode}
            className={`min-h-24 resize-none ${isActive || isViewMode ? "bg-muted cursor-not-allowed" : ""}`}
          />
        </CardContent>
      </Card>

      {/* Images Upload */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Fotos ({tripData.images.length})
          </Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handleImageUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isViewMode}
            className="w-full h-12"
          >
            <Camera className="h-5 w-5 mr-2" />
            Adicionar Fotos
          </Button>
          {tripData.images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {tripData.images.map((img, idx) => (
                <div
                  key={idx}
                  className="aspect-square bg-muted rounded-md overflow-hidden"
                >
                  <img
                    src={URL.createObjectURL(img)}
                    alt={`Foto ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {tripData.startLocation && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">
              <strong>Localização inicial:</strong>{" "}
              {tripData.startLocation.lat.toFixed(6)},{" "}
              {tripData.startLocation.lng.toFixed(6)}
            </p>
            {tripData.endLocation && (
              <p className="text-sm text-muted-foreground mt-1">
                <strong>Localização final:</strong>{" "}
                {tripData.endLocation.lat.toFixed(6)},{" "}
                {tripData.endLocation.lng.toFixed(6)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!isViewMode && (
        <div className="pt-2 pb-6">
          <Button
            variant={isActive ? "trip-end" : "trip-start"}
            size="xl"
            onClick={isActive ? handleEndTrip : handleStartTrip}
            disabled={isCapturingLocation}
            className="w-full"
          >
            {isCapturingLocation ? (
              <>
                <Navigation className="h-5 w-5 animate-pulse" />
                Capturando localização...
              </>
            ) : isActive ? (
              <>
                <Flag className="h-5 w-5" />
                Finalizar Viagem
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                Iniciar Viagem
              </>
            )}
          </Button>
        </div>
      )}

      {isViewMode && (
        <div className="pt-2 pb-6">
          <div className="text-center text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg">
            Visualização em modo somente leitura
          </div>
        </div>
      )}

      <AlertDialog open={showEndTripDialog} onOpenChange={setShowEndTripDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar Viagem</AlertDialogTitle>
            <AlertDialogDescription>
              Insira a quilometragem final do veículo para finalizar a viagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            <Label htmlFor="dialogFinalKm" className="text-base font-semibold">
              Km Final *
            </Label>
            <Input
              id="dialogFinalKm"
              type="number"
              placeholder="Quilometragem final"
              value={tempFinalKm}
              onChange={(e) => setTempFinalKm(e.target.value)}
              className="h-12"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEndTrip}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PullToRefresh>
  );
};

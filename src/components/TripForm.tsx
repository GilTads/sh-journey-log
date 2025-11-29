import { useState, useEffect, useRef } from "react";
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
import { Capacitor } from "@capacitor/core";
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHintALLOption,
} from "@capacitor/barcode-scanner";
import { Geolocation } from "@capacitor/geolocation";
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
  Square,
} from "lucide-react";
import { CapacitorSQLite } from "@capacitor-community/sqlite";

interface TripData {
  employeeId: string;
  employeePhoto: File | null;
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
  } = useOfflineData();

  const { uploadPhoto, createTrip, updateTrip, getOngoingTripFromServer } = useTrips();
  const {
    isReady: isSQLiteReady,
    hasDb: hasSQLiteDb,
    saveTrip: saveTripOffline,
    updateTripOnEnd,
    getEmployees: getEmployeesRaw,
    getVehicles: getVehiclesRaw,
  } = useSQLite();

  const [employees, setEmployees] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isLoadingOngoingTrip, setIsLoadingOngoingTrip] = useState(true);

  const [tripData, setTripData] = useState<TripData>({
    employeeId: "",
    employeePhoto: null,
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const locationTrackingRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const employeePhotoInputRef = useRef<HTMLInputElement>(null);

  // IDs para rastreamento de posições
  const [currentLocalTripId, setCurrentLocalTripId] = useState<number | null>(null);
  const [currentServerTripId, setCurrentServerTripId] = useState<string | null>(null);

  // Ref para evitar execução múltipla do carregamento de viagem em andamento
  const hasLoadedOngoingTripRef = useRef(false);

  // 🔍 STATUS DO TESTE DO SQLITE (DEBUG)
  const [sqliteStatus, setSqliteStatus] = useState<string>(
    "Aguardando teste..."
  );

  // ========= CARREGA VIAGEM EM ANDAMENTO NO MOUNT =========
  useEffect(() => {
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
            console.log("[TripForm] Viagem em andamento encontrada (offline):", ongoingTrip.id);
            restoreTripState(ongoingTrip, ongoingTrip.id!, null);
            return;
          }
        }

        // ONLINE: busca no Supabase
        if (isOnline) {
          console.log("[TripForm] Buscando viagem em andamento no Supabase...");
          const serverTrip = await getOngoingTripFromServer();

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
            console.log("[TripForm] Viagem local em andamento encontrada:", localOngoingTrip.id);
            restoreTripState(localOngoingTrip, localOngoingTrip.id!, null);
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
  }, [isReady, hasDb, isOnline]);

  // Função auxiliar para restaurar estado do form a partir de viagem offline
  const restoreTripState = (
    trip: any,
    localTripId: number | null,
    serverTripId: string | null
  ) => {
    const startTime = new Date(trip.start_time);
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    setTripData((prev) => ({
      ...prev,
      employeeId: trip.employee_id || "",
      vehicleId: trip.vehicle_id || "",
      initialKm: String(trip.km_inicial || ""),
      origin: trip.origem || "",
      reason: trip.motivo || "",
      observation: trip.observacao || "",
      isRentedVehicle: trip.is_rented_vehicle === 1 || trip.is_rented_vehicle === true,
      rentedPlate: trip.rented_plate || "",
      rentedModel: trip.rented_model || "",
      rentedCompany: trip.rented_company || "",
      startLocation: trip.start_latitude && trip.start_longitude
        ? { lat: trip.start_latitude, lng: trip.start_longitude }
        : undefined,
      startTime,
    }));

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
      vehicleId: trip.vehicle_id || "",
      initialKm: String(trip.km_inicial || ""),
      origin: trip.origem || "",
      reason: trip.motivo || "",
      observation: trip.observacao || "",
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

  // ========= RASTREAMENTO DE LOCALIZAÇÃO A CADA 30 SEGUNDOS =========
  useEffect(() => {
    if (!isActive) {
      // Se a viagem não está ativa, limpa o intervalo
      if (locationTrackingRef.current) {
        clearInterval(locationTrackingRef.current);
        locationTrackingRef.current = null;
        console.log("[TripForm] Rastreamento de localização parado");
      }
      return;
    }

    // Função para capturar e salvar a posição
    const captureAndSavePosition = async () => {
      try {
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== "granted") {
          console.warn("[TripForm] Sem permissão de localização para rastreamento");
          return;
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
        });

        const positionData = {
          local_trip_id: currentLocalTripId ?? undefined,
          server_trip_id: currentServerTripId ?? undefined,
          captured_at: new Date().toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          synced: 0,
          deleted: 0,
        };

        const saved = await saveTripPosition(positionData);
        if (saved) {
          console.log(
            `[TripForm] Posição capturada: ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`
          );
        } else {
          console.error("[TripForm] Erro ao salvar posição");
        }
      } catch (error) {
        console.error("[TripForm] Erro ao capturar posição:", error);
      }
    };

    // Captura imediatamente ao iniciar
    captureAndSavePosition();

    // Inicia intervalo de 30 segundos
    locationTrackingRef.current = setInterval(captureAndSavePosition, 30000);
    console.log("[TripForm] Rastreamento de localização iniciado (30s)");

    return () => {
      if (locationTrackingRef.current) {
        clearInterval(locationTrackingRef.current);
        locationTrackingRef.current = null;
      }
    };
  }, [isActive, currentLocalTripId, currentServerTripId, saveTripPosition]);

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

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
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

  const handleStartTrip = async () => {
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
    }

    if (!tripData.initialKm) {
      toast.error("Preencha o Km Inicial");
      return;
    }

    setIsCapturingLocation(true);
    try {
      const location = await getCurrentLocation();
      const startTime = new Date();

      // Converte foto do motorista para base64 se offline
      let employeePhotoBase64: string | undefined;
      const shouldSaveOffline = Capacitor.isNativePlatform() && !isOnline && isSQLiteReady;
      
      if (shouldSaveOffline && tripData.employeePhoto) {
        employeePhotoBase64 = await fileToBase64(tripData.employeePhoto);
      }

      // Se offline, cria viagem "em_andamento" no SQLite para vincular posições
      if (shouldSaveOffline) {
        const draftTrip = {
          employee_id: tripData.employeeId,
          vehicle_id: tripData.isRentedVehicle ? null : tripData.vehicleId,
          km_inicial: parseFloat(tripData.initialKm),
          km_final: 0, // será preenchido ao finalizar
          start_time: startTime.toISOString(),
          end_time: startTime.toISOString(), // placeholder, será atualizado
          start_latitude: location.lat,
          start_longitude: location.lng,
          end_latitude: null,
          end_longitude: null,
          duration_seconds: 0,
          origem: tripData.origin || null,
          destino: null,
          motivo: tripData.reason || null,
          observacao: tripData.observation || null,
          status: "em_andamento",
          employee_photo_base64: employeePhotoBase64,
          is_rented_vehicle: tripData.isRentedVehicle ? 1 : 0,
          rented_plate: tripData.isRentedVehicle ? tripData.rentedPlate || null : null,
          rented_model: tripData.isRentedVehicle ? tripData.rentedModel || null : null,
          rented_company: tripData.isRentedVehicle ? tripData.rentedCompany || null : null,
          synced: 0,
          deleted: 0,
        };

        const localTripId = await saveTripOffline(draftTrip);
        if (localTripId) {
          setCurrentLocalTripId(localTripId);
          console.log("[TripForm] Viagem draft criada com ID local:", localTripId);
        } else {
          console.error("[TripForm] Erro ao criar viagem draft no SQLite");
        }
      } else if (isOnline) {
        // ONLINE: cria viagem "em_andamento" no Supabase para vincular posições
        let employeePhotoUrl: string | null = null;
        if (tripData.employeePhoto) {
          const photoPath = `employees/${tripData.employeeId}/${Date.now()}.jpg`;
          employeePhotoUrl = await uploadPhoto(tripData.employeePhoto, photoPath);
        }

        const draftTripRecord = {
          employee_id: tripData.employeeId,
          vehicle_id: tripData.isRentedVehicle ? null : tripData.vehicleId,
          km_inicial: parseFloat(tripData.initialKm),
          km_final: 0, // será preenchido ao finalizar
          start_time: startTime.toISOString(),
          end_time: startTime.toISOString(), // placeholder
          start_latitude: location.lat,
          start_longitude: location.lng,
          duration_seconds: 0,
          status: "em_andamento",
          origem: tripData.origin || null,
          motivo: tripData.reason || null,
          employee_photo_url: employeePhotoUrl || undefined,
          is_rented_vehicle: tripData.isRentedVehicle,
          rented_plate: tripData.isRentedVehicle ? tripData.rentedPlate || null : null,
          rented_model: tripData.isRentedVehicle ? tripData.rentedModel || null : null,
          rented_company: tripData.isRentedVehicle ? tripData.rentedCompany || null : null,
        };

        const { data, error } = await createTrip(draftTripRecord);
        if (error) {
          console.error("[TripForm] Erro ao criar viagem draft no Supabase:", error);
          toast.error("Erro ao iniciar viagem no servidor");
          setIsCapturingLocation(false);
          return;
        }

        if (data?.id) {
          setCurrentServerTripId(data.id);
          console.log("[TripForm] Viagem draft criada no Supabase com ID:", data.id);
        }
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

    setShowEndTripDialog(false);
    setIsCapturingLocation(true);

    try {
      const location = await getCurrentLocation();
      const endTime = new Date();

      setTripData(prev => ({
        ...prev,
        endLocation: location,
      }));

      const shouldSaveOffline =
        Capacitor.isNativePlatform() && !isOnline && isSQLiteReady;

      if (shouldSaveOffline) {
        // Prepara fotos para base64
        const tripPhotosBase64: string[] = [];
        for (const img of tripData.images) {
          const base64 = await fileToBase64(img);
          tripPhotosBase64.push(base64);
        }

        // Se já temos um local trip ID (criado no handleStartTrip), atualizamos
        if (currentLocalTripId) {
          const updates = {
            km_final: parseFloat(tempFinalKm),
            end_time: endTime.toISOString(),
            end_latitude: location.lat,
            end_longitude: location.lng,
            duration_seconds: elapsedTime,
            origem: tripData.origin || null,
            destino: tripData.destination || null,
            motivo: tripData.reason || null,
            observacao: tripData.observation || null,
            status: "finalizada",
            trip_photos_base64: tripPhotosBase64.length > 0
              ? JSON.stringify(tripPhotosBase64)
              : undefined,
          };

          const updated = await updateTripOnEnd(currentLocalTripId, updates);
          if (!updated) {
            throw new Error("Erro ao atualizar viagem offline");
          }

          console.log("[TripForm] Viagem atualizada com ID local:", currentLocalTripId);
        } else {
          // Fallback: cria nova viagem (não deveria acontecer, mas por segurança)
          let employeePhotoBase64: string | undefined;
          if (tripData.employeePhoto) {
            employeePhotoBase64 = await fileToBase64(tripData.employeePhoto);
          }

          const offlineTrip = {
            employee_id: tripData.employeeId,
            vehicle_id: tripData.isRentedVehicle ? null : tripData.vehicleId,
            km_inicial: parseFloat(tripData.initialKm),
            km_final: parseFloat(tempFinalKm),
            start_time: tripData.startTime!.toISOString(),
            end_time: endTime.toISOString(),
            start_latitude: tripData.startLocation?.lat,
            start_longitude: tripData.startLocation?.lng,
            end_latitude: location.lat,
            end_longitude: location.lng,
            duration_seconds: elapsedTime,
            origem: tripData.origin || null,
            destino: tripData.destination || null,
            motivo: tripData.reason || null,
            observacao: tripData.observation || null,
            status: "finalizada",
            employee_photo_base64: employeePhotoBase64,
            trip_photos_base64: tripPhotosBase64.length > 0
              ? JSON.stringify(tripPhotosBase64)
              : undefined,
            is_rented_vehicle: tripData.isRentedVehicle ? 1 : 0,
            rented_plate: tripData.isRentedVehicle ? tripData.rentedPlate || null : null,
            rented_model: tripData.isRentedVehicle ? tripData.rentedModel || null : null,
            rented_company: tripData.isRentedVehicle ? tripData.rentedCompany || null : null,
            synced: 0,
            deleted: 0,
          };

          const savedId = await saveTripOffline(offlineTrip);
          if (!savedId) {
            throw new Error("Erro ao salvar viagem offline");
          }
          console.log("[TripForm] Viagem criada (fallback) com ID local:", savedId);
        }

        setIsActive(false);

        toast.success("Viagem salva offline!", {
          description: "Será sincronizada quando houver internet",
        });
      } else {
        // ONLINE: atualiza ou cria viagem no Supabase
        const tripPhotosUrls: string[] = [];
        for (let i = 0; i < tripData.images.length; i++) {
          const photoPath = `trips/${Date.now()}_${i}.jpg`;
          const url = await uploadPhoto(tripData.images[i], photoPath);
          if (url) tripPhotosUrls.push(url);
        }

        // Se já existe uma viagem no servidor (criada no handleStartTrip), apenas atualiza
        if (currentServerTripId) {
          const tripUpdates = {
            km_final: parseFloat(tempFinalKm),
            end_time: endTime.toISOString(),
            end_latitude: location.lat,
            end_longitude: location.lng,
            duration_seconds: elapsedTime,
            destino: tripData.destination || null,
            observacao: tripData.observation || null,
            status: "finalizada",
            trip_photos_urls:
              tripPhotosUrls.length > 0 ? tripPhotosUrls : undefined,
          };

          const { error } = await updateTrip(currentServerTripId, tripUpdates);

          if (error) {
            throw new Error("Erro ao atualizar viagem no banco de dados");
          }

          console.log("[TripForm] Viagem atualizada no Supabase com ID:", currentServerTripId);
        } else {
          // Fallback: cria nova viagem (não deveria acontecer se handleStartTrip funcionou)
          let employeePhotoUrl: string | null = null;
          if (tripData.employeePhoto) {
            const photoPath = `employees/${tripData.employeeId}/${Date.now()}.jpg`;
            employeePhotoUrl = await uploadPhoto(tripData.employeePhoto, photoPath);
          }

          const tripRecord = {
            employee_id: tripData.employeeId,
            vehicle_id: tripData.isRentedVehicle ? null : tripData.vehicleId,
            km_inicial: parseFloat(tripData.initialKm),
            km_final: parseFloat(tempFinalKm),
            start_time: tripData.startTime!.toISOString(),
            end_time: endTime.toISOString(),
            start_latitude: tripData.startLocation?.lat,
            start_longitude: tripData.startLocation?.lng,
            end_latitude: location.lat,
            end_longitude: location.lng,
            duration_seconds: elapsedTime,
            origem: tripData.origin || null,
            destino: tripData.destination || null,
            motivo: tripData.reason || null,
            observacao: tripData.observation || null,
            status: "finalizada",
            employee_photo_url: employeePhotoUrl || undefined,
            trip_photos_urls:
              tripPhotosUrls.length > 0 ? tripPhotosUrls : undefined,
            is_rented_vehicle: tripData.isRentedVehicle,
            rented_plate: tripData.isRentedVehicle ? tripData.rentedPlate || null : null,
            rented_model: tripData.isRentedVehicle ? tripData.rentedModel || null : null,
            rented_company: tripData.isRentedVehicle ? tripData.rentedCompany || null : null,
          };

          const { data, error } = await createTrip(tripRecord);

          if (error) {
            throw new Error("Erro ao salvar viagem no banco de dados");
          }

          if (data?.id) {
            console.log("[TripForm] Viagem criada (fallback) no Supabase com ID:", data.id);
          }
        }

        setIsActive(false);

        toast.success("Viagem finalizada e salva!", {
          description: `Duração: ${formatTime(elapsedTime)}`,
        });
      }

      setTripData({
        employeeId: "",
        employeePhoto: null,
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
      // Limpa IDs de rastreamento de posição
      setCurrentLocalTripId(null);
      setCurrentServerTripId(null);
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

  const handleEmployeePhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (files && files[0]) {
      setTripData((prev) => ({
        ...prev,
        employeePhoto: files[0],
      }));
      toast.success("Foto do motorista capturada");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files);
      setTripData((prev) => ({
        ...prev,
        images: [...prev.images, ...newImages],
      }));
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

      const employee = employees.find((emp) => emp.matricula === scanned);

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
              label: `${emp.nome_completo} (${emp.matricula})`,
              searchText: `${emp.nome_completo} ${emp.matricula} ${emp.cargo}`,
            }))}
            value={tripData.employeeId}
            onChange={(value) =>
              setTripData((prev) => ({ ...prev, employeeId: value }))
            }
            placeholder="Digite nome ou matrícula..."
            emptyText="Nenhum motorista encontrado."
            disabled={isActive}
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
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 flex items-center justify-center gap-2 border-2 border-dashed hover:border-primary"
              onClick={() => employeePhotoInputRef.current?.click()}
              disabled={isActive}
            >
              <Camera className="h-5 w-5" />
              <span>Tirar Foto do Motorista</span>
            </Button>
            <Input
              id="employeePhoto"
              ref={employeePhotoInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleEmployeePhotoUpload}
              disabled={isActive}
              className="hidden"
            />
            {tripData.employeePhoto && (
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
                  disabled={isActive}
                >
                  Remover
                </Button>
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
              disabled={isActive}
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
                  label: `${veh.placa} - ${veh.marca} ${veh.modelo}`,
                  searchText: `${veh.placa} ${veh.marca} ${veh.modelo}`,
                }))}
                value={tripData.vehicleId}
                onChange={(value) =>
                  setTripData((prev) => ({ ...prev, vehicleId: value }))
                }
                placeholder="Digite placa ou modelo..."
                emptyText="Nenhum veículo encontrado."
                disabled={isActive}
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
                  placeholder="Ex: ABC-1234"
                  value={tripData.rentedPlate}
                  onChange={(e) =>
                    setTripData((prev) => ({ ...prev, rentedPlate: e.target.value }))
                  }
                  disabled={isActive}
                  className="h-12"
                />
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
                  disabled={isActive}
                  className="h-12"
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
                  disabled={isActive}
                  className="h-12"
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
            disabled={isActive}
            className="h-12"
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
              disabled={isActive}
              className="h-12"
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
              className="h-12"
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
            className="min-h-24 resize-none"
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
            className="min-h-24 resize-none"
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
              <Square className="h-5 w-5" />
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

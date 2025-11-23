import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { SQLiteDebugPanel } from "@/components/SQLiteDebugPanel";
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
  MapPin,
  FileText,
  Camera,
  Navigation,
  Clock,
  QrCode,
  Play,
  Square,
} from "lucide-react";
import { CapacitorSQLite } from "@capacitor-community/sqlite"; // ⬅️ NOVO IMPORT

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
}

export const TripForm = () => {
  const {
    isOnline,
    isSyncing,
    getMotoristas,
    getVeiculos,
    isReady,
    lastSyncAt,
    syncNow,
  } = useOfflineData();

  const { uploadPhoto, createTrip } = useTrips();
  const {
    isReady: isSQLiteReady,
    hasDb: hasSQLiteDb,
    saveTrip: saveTripOffline,
    getEmployees: getEmployeesRaw,
    getVehicles: getVehiclesRaw,
  } = useSQLite();

  const [employees, setEmployees] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

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
  });

  const [isActive, setIsActive] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [showEndTripDialog, setShowEndTripDialog] = useState(false);
  const [tempFinalKm, setTempFinalKm] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const employeePhotoInputRef = useRef<HTMLInputElement>(null);

  // 🔍 STATUS DO TESTE DO SQLITE (DEBUG)
  const [sqliteStatus, setSqliteStatus] = useState<string>(
    "Aguardando teste..."
  );

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

  const handleStartTrip = async () => {
    if (
      !tripData.employeeId ||
      !tripData.employeePhoto ||
      !tripData.vehicleId ||
      !tripData.initialKm
    ) {
      toast.error(
        "Preencha os campos obrigatórios: Motorista, Foto do Motorista, Veículo e Km Inicial"
      );
      return;
    }

    setIsCapturingLocation(true);
    try {
      const location = await getCurrentLocation();
      const startTime = new Date();

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

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

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

      const shouldSaveOffline =
        Capacitor.isNativePlatform() && !isOnline && isSQLiteReady;

      if (shouldSaveOffline) {
        let employeePhotoBase64: string | undefined;
        if (tripData.employeePhoto) {
          employeePhotoBase64 = await fileToBase64(tripData.employeePhoto);
        }

        const tripPhotosBase64: string[] = [];
        for (const img of tripData.images) {
          const base64 = await fileToBase64(img);
          tripPhotosBase64.push(base64);
        }

        const offlineTrip = {
          employee_id: tripData.employeeId,
          vehicle_id: tripData.vehicleId,
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
          trip_photos_base64:
            tripPhotosBase64.length > 0
              ? JSON.stringify(tripPhotosBase64)
              : undefined,
          synced: 0,
          deleted: 0,
        };

        const saved = await saveTripOffline(offlineTrip);

        if (!saved) {
          throw new Error("Erro ao salvar viagem offline");
        }

        setIsActive(false);

        toast.success("Viagem salva offline!", {
          description: "Será sincronizada quando houver internet",
        });
      } else {
        let employeePhotoUrl: string | null = null;
        if (tripData.employeePhoto) {
          const photoPath = `employees/${tripData.employeeId}/${Date.now()}.jpg`;
          employeePhotoUrl = await uploadPhoto(tripData.employeePhoto, photoPath);
        }

        const tripPhotosUrls: string[] = [];
        for (let i = 0; i < tripData.images.length; i++) {
          const photoPath = `trips/${Date.now()}_${i}.jpg`;
          const url = await uploadPhoto(tripData.images[i], photoPath);
          if (url) tripPhotosUrls.push(url);
        }

        const tripRecord = {
          employee_id: tripData.employeeId,
          vehicle_id: tripData.vehicleId,
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
        };

        const { error } = await createTrip(tripRecord);

        if (error) {
          throw new Error("Erro ao salvar viagem no banco de dados");
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
      });
      setTempFinalKm("");
      setElapsedTime(0);
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

      {/* Debug Panel - mostra status do SQLite */}
      {Capacitor.isNativePlatform() && <SQLiteDebugPanel />}

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

      {/* Vehicle Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            Veículo *
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

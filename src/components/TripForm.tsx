import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { useEmployees } from "@/hooks/useEmployees";
import { useVehicles } from "@/hooks/useVehicles";
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

interface TripData {
  employeeId: string;
  vehicleId: string;
  initialKm: string;
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
  const { data: employees = [], isLoading: isLoadingEmployees } = useEmployees();
  const { data: vehicles = [], isLoading: isLoadingVehicles } = useVehicles();

  const [tripData, setTripData] = useState<TripData>({
    employeeId: "",
    vehicleId: "",
    initialKm: "",
    origin: "",
    destination: "",
    reason: "",
    observation: "",
    images: [],
  });

  const [isActive, setIsActive] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
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
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocalização não suportada"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        }
      );
    });
  };

  const handleStartTrip = async () => {
    // Validação básica
    if (!tripData.employeeId || !tripData.vehicleId || !tripData.initialKm) {
      toast.error("Preencha os campos obrigatórios: Funcionário, Veículo e Km Inicial");
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
        description: `Localização capturada: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`,
      });
    } catch (error) {
      toast.error("Erro ao capturar localização", {
        description: "Permita o acesso à localização para iniciar a viagem",
      });
    } finally {
      setIsCapturingLocation(false);
    }
  };

  const handleEndTrip = async () => {
    setIsCapturingLocation(true);
    try {
      const location = await getCurrentLocation();
      const endTime = new Date();

      setTripData((prev) => ({
        ...prev,
        endLocation: location,
        endTime,
      }));

      setIsActive(false);

      // Aqui você salvaria os dados no banco
      const tripRecord = {
        ...tripData,
        endLocation: location,
        endTime,
        duration: elapsedTime,
      };

      console.log("Viagem finalizada:", tripRecord);

      toast.success("Viagem finalizada!", {
        description: `Duração: ${formatTime(elapsedTime)}`,
      });

      // Reset form (opcional)
      // resetForm();
    } catch (error) {
      toast.error("Erro ao capturar localização final");
    } finally {
      setIsCapturingLocation(false);
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

  const handleBarcodeScanner = () => {
    // Implementação do scanner seria feita aqui
    // Por enquanto, vamos simular
    toast.info("Abrir scanner de código de barras", {
      description: "Funcionalidade disponível em dispositivos móveis",
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Timer Display */}
      {isActive && (
        <Card className="bg-gradient-to-r from-trip-active to-secondary">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-3 text-white">
              <Clock className="h-6 w-6" />
              <span className="text-2xl font-bold tabular-nums">{formatTime(elapsedTime)}</span>
            </div>
            <p className="text-center text-white/90 text-sm mt-1">Viagem em andamento</p>
          </CardContent>
        </Card>
      )}

      {/* Employee Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Funcionário *
            </Label>
            <Button variant="ghost" size="sm" onClick={handleBarcodeScanner}>
              <QrCode className="h-4 w-4" />
            </Button>
          </div>
          <Combobox
            options={employees.map((emp) => ({
              value: emp.id,
              label: `${emp.nome_completo} (${emp.matricula}) - ${emp.cargo}`,
            }))}
            value={tripData.employeeId}
            onChange={(value) => setTripData({ ...tripData, employeeId: value })}
            placeholder="Selecione um funcionário"
            searchPlaceholder="Buscar por nome ou matrícula..."
            emptyText="Nenhum funcionário encontrado."
            disabled={isActive || isLoadingEmployees}
          />
        </CardContent>
      </Card>

      {/* Vehicle Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            Veículo *
          </Label>
          <Combobox
            options={vehicles.map((veh) => ({
              value: veh.id,
              label: `${veh.placa} - ${veh.marca} ${veh.modelo}`,
            }))}
            value={tripData.vehicleId}
            onChange={(value) => setTripData({ ...tripData, vehicleId: value })}
            placeholder="Selecione um veículo"
            searchPlaceholder="Buscar por placa ou modelo..."
            emptyText="Nenhum veículo encontrado."
            disabled={isActive || isLoadingVehicles}
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
            onChange={(e) => setTripData({ ...tripData, initialKm: e.target.value })}
            disabled={isActive}
            className="h-12"
          />
        </CardContent>
      </Card>

      {/* Origin & Destination */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-3">
            <Label htmlFor="origin" className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Origem
            </Label>
            <Input
              id="origin"
              placeholder="Local de saída"
              value={tripData.origin}
              onChange={(e) => setTripData({ ...tripData, origin: e.target.value })}
              disabled={isActive}
              className="h-12"
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="destination" className="text-base font-semibold flex items-center gap-2">
              <Navigation className="h-4 w-4 text-secondary" />
              Destino
            </Label>
            <Input
              id="destination"
              placeholder="Local de destino"
              value={tripData.destination}
              onChange={(e) => setTripData({ ...tripData, destination: e.target.value })}
              className="h-12"
            />
          </div>
        </CardContent>
      </Card>

      {/* Reason Field */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label htmlFor="reason" className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Motivo da Viagem
          </Label>
          <Textarea
            id="reason"
            placeholder="Descreva o motivo da viagem"
            value={tripData.reason}
            onChange={(e) => setTripData({ ...tripData, reason: e.target.value })}
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
            onChange={(e) => setTripData({ ...tripData, observation: e.target.value })}
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
                <div key={idx} className="aspect-square bg-muted rounded-md overflow-hidden">
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

      {/* Location Info */}
      {tripData.startLocation && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">
              <strong>Localização inicial:</strong> {tripData.startLocation.lat.toFixed(6)},{" "}
              {tripData.startLocation.lng.toFixed(6)}
            </p>
            {tripData.endLocation && (
              <p className="text-sm text-muted-foreground mt-1">
                <strong>Localização final:</strong> {tripData.endLocation.lat.toFixed(6)},{" "}
                {tripData.endLocation.lng.toFixed(6)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Button */}
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
    </div>
  );
};

// src/components/TripCard.tsx
import {
  Car,
  CarTaxiFront,
  User,
  MapPin,
  Clock,
  Route,
  CheckCircle2,
  AlertTriangle,
  Play,
  Calendar,
  Gauge,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TripHistory, SyncStatus } from "@/hooks/useTripsHistory";
import { formatTime, formatDuration, formatKm } from "@/lib/formatters";
import { useNavigate } from "react-router-dom";

interface TripCardProps {
  trip: TripHistory;
}

const getStatusConfig = (status: string | null) => {
  switch (status?.toLowerCase()) {
    case "finalizada":
    case "completed":
      return {
        label: "Finalizada",
        icon: CheckCircle2,
        className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      };
    case "em_andamento":
    case "in_progress":
      return {
        label: "Em andamento",
        icon: Play,
        className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      };
    default:
      return {
        label: status || "Desconhecido",
        icon: AlertTriangle,
        className: "bg-muted text-muted-foreground",
      };
  }
};

const getSyncStatusConfig = (syncStatus: SyncStatus) => {
  if (syncStatus === "synced") {
    return {
      label: "Sincronizada",
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    };
  }
  return {
    label: "Pendente",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
};

export const TripCard = ({ trip }: TripCardProps) => {
  const navigate = useNavigate();
  const statusConfig = getStatusConfig(trip.status);
  const syncConfig = getSyncStatusConfig(trip.sync_status);
  const StatusIcon = statusConfig.icon;

  const isOngoing = trip.status?.toLowerCase() === "em_andamento" || trip.status?.toLowerCase() === "in_progress";

  const handleCardClick = () => {
    if (isOngoing) {
      navigate("/", { state: { viewTripId: trip.id, viewTrip: trip } });
    }
  };

  // Driver info
  const driverName = trip.employee?.full_name || "Motorista não informado";
  const driverInitials = driverName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const driverRegistrationId = trip.employee?.registration_id;

  // Vehicle info
  const isRented = trip.is_rented_vehicle;
  const VehicleIcon = isRented ? CarTaxiFront : Car;
  const vehicleLabel = isRented
    ? `${trip.rented_plate || ""} ${trip.rented_model || ""}`.trim() || "Veículo alugado"
    : trip.vehicle
    ? `${trip.vehicle.license_plate} - ${trip.vehicle.brand} ${trip.vehicle.model}`
    : "Veículo não informado";

  // Route info
  const hasRoute = trip.origin || trip.destination;

  return (
    <Card 
      className={`shadow-sm hover:shadow-md transition-shadow ${isOngoing ? "cursor-pointer" : ""}`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        {/* Header: Driver + Status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar className="h-10 w-10 shrink-0">
              {trip.employee_photo_url ? (
                <AvatarImage src={trip.employee_photo_url} alt={driverName} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {driverInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm truncate">{driverName}</span>
              </div>
              {driverRegistrationId && (
                <span className="text-xs text-muted-foreground">
                  Mat: {driverRegistrationId}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 items-end shrink-0">
            <Badge variant="outline" className={statusConfig.className}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusConfig.label}
            </Badge>
            {trip.sync_status === "offline-only" && (
              <Badge variant="outline" className={syncConfig.className}>
                {syncConfig.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Vehicle */}
        <div className="flex items-center gap-2 mb-3 text-sm">
          <VehicleIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground truncate">
            {isRented && (
              <span className="text-orange-600 dark:text-orange-400 font-medium mr-1">
                [Alugado]
              </span>
            )}
            {vehicleLabel}
          </span>
          {isRented && trip.rented_company && (
            <span className="text-xs text-muted-foreground">
              ({trip.rented_company})
            </span>
          )}
        </div>

        {/* Route: Origin → Destination */}
        {hasRoute && (
          <div className="flex items-start gap-2 mb-3 text-sm">
            <Route className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {trip.origin && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-green-600" />
                  <span className="truncate">{trip.origin}</span>
                </div>
              )}
              {trip.destination && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-red-600" />
                  <span className="truncate">{trip.destination}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Time & KM Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {/* Start Time */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">Início</div>
              <div className="font-medium">{formatTime(trip.start_time)}</div>
            </div>
          </div>

          {/* End Time */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">Fim</div>
              <div className="font-medium">{formatTime(trip.end_time)}</div>
            </div>
          </div>

          {/* KM */}
          <div className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">Km</div>
              <div className="font-medium">
                {formatKm(trip.initial_km)}
                {trip.final_km != null && (
                  <span className="text-muted-foreground"> → {formatKm(trip.final_km)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <div className="text-muted-foreground">Duração</div>
              <div className="font-medium">{formatDuration(trip.duration_seconds)}</div>
            </div>
          </div>
        </div>

        {/* Reason */}
        {trip.reason && (
          <div className="mt-3 pt-3 border-t text-xs">
            <span className="text-muted-foreground">Motivo: </span>
            <span>{trip.reason}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

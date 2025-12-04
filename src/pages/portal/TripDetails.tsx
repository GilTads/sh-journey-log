import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  User,
  Car,
  MapPin,
  Clock,
  Calendar,
  FileText,
  Navigation,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { TripMap } from "@/components/portal/TripMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTripDetails, useTripPositions } from "@/hooks/usePortalTrips";
import { formatDuration } from "@/lib/formatters";

const TripDetails = () => {
  const { id } = useParams<{ id: string }>();
  const { data: trip, isLoading } = useTripDetails(id || "");
  const { data: positions } = useTripPositions(id || "");

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-[400px]" />
            <Skeleton className="h-[400px]" />
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (!trip) {
    return (
      <PortalLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Viagem não encontrada</p>
          <Button asChild className="mt-4">
            <Link to="/portal/trips">Voltar às viagens</Link>
          </Button>
        </div>
      </PortalLayout>
    );
  }

  const kmDriven =
    trip.final_km !== null &&
    trip.final_km !== undefined &&
    trip.initial_km !== null &&
    trip.initial_km !== undefined
      ? Number(trip.final_km) - Number(trip.initial_km)
      : null;
  const startAt = trip.start_time ? new Date(trip.start_time) : null;
  const endAt = trip.end_time ? new Date(trip.end_time) : null;

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link to="/portal/trips">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Detalhes da Viagem</h1>
              <p className="text-sm text-muted-foreground">
                ID: {trip.id.slice(0, 8)}...
              </p>
            </div>
          </div>
          <Badge
            variant={trip.status === "finalizada" ? "default" : "secondary"}
            className={
              trip.status === "finalizada"
                ? "bg-green-500/10 text-green-600"
                : "bg-blue-500/10 text-blue-600"
            }
          >
            {trip.status === "finalizada" ? "Finalizada" : "Em Andamento"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Informações da Viagem
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Driver */}
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Motorista</p>
                  <p className="font-medium">{trip.employee?.full_name || "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {trip.employee?.registration_id} • {trip.employee?.position}
                  </p>
                </div>
              </div>

              {/* Vehicle */}
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Car className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Veículo</p>
                  {trip.is_rented_vehicle ? (
                    <>
                      <p className="font-medium">Veículo Alugado</p>
                      <p className="text-sm text-muted-foreground">
                        {[trip.rented_plate, trip.rented_model, trip.rented_company]
                          .filter(Boolean)
                          .join(" • ") || "—"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">{trip.vehicle?.license_plate || "—"}</p>
                      <p className="text-sm text-muted-foreground">
                        {trip.vehicle?.brand} {trip.vehicle?.model}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Route */}
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Percurso</p>
                  <p className="font-medium">{trip.origin || "—"}</p>
                  <p className="text-sm text-muted-foreground">para</p>
                  <p className="font-medium">{trip.destination || "—"}</p>
                </div>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Início</p>
                    <p className="font-medium">
                      {startAt && !isNaN(startAt.getTime())
                        ? format(startAt, "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {startAt && !isNaN(startAt.getTime())
                        ? format(startAt, "HH:mm", { locale: ptBR })
                        : "—"}
                    </p>
                  </div>
                </div>

                {endAt && !isNaN(endAt.getTime()) && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Fim</p>
                      <p className="font-medium">
                        {format(endAt, "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(endAt, "HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div className="text-center">
                  <p className="text-2xl font-bold">{trip.initial_km}</p>
                  <p className="text-xs text-muted-foreground">KM Inicial</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{trip.final_km || "—"}</p>
                  <p className="text-xs text-muted-foreground">KM Final</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">
                    {kmDriven !== null ? kmDriven : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">KM Rodados</p>
                </div>
              </div>

              {trip.duration_seconds && (
                <div className="flex items-center gap-3 pt-4 border-t">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Duração Total</p>
                    <p className="font-medium">{formatDuration(trip.duration_seconds)}</p>
                  </div>
                </div>
              )}

              {/* Reason & Notes */}
              {trip.reason && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Motivo</p>
                  <p>{trip.reason}</p>
                </div>
              )}

              {trip.notes && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Observações</p>
                  <p>{trip.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Map Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Navigation className="h-5 w-5" />
                Mapa do Percurso
                {positions && positions.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {positions.length} pontos
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[500px]">
                <TripMap
                  startLat={trip.start_latitude}
                  startLng={trip.start_longitude}
                  endLat={trip.end_latitude}
                  endLng={trip.end_longitude}
                  origin={trip.origin}
                  destination={trip.destination}
                  positions={positions}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline (if positions exist) */}
        {positions && positions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Linha do Tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                <div className="space-y-4">
                  {positions.slice(0, 20).map((pos, index) => (
                    <div key={pos.id} className="flex items-center gap-4 pl-8 relative">
                      <div className="absolute left-2.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {format(new Date(pos.captured_at), "HH:mm:ss", { locale: ptBR })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pos.latitude.toFixed(6)}, {pos.longitude.toFixed(6)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {positions.length > 20 && (
                    <p className="text-sm text-muted-foreground pl-8">
                      ... e mais {positions.length - 20} pontos
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
};

export default TripDetails;

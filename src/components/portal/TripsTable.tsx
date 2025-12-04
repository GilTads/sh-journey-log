import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MapPin, Clock, Car, User, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TripWithDetails } from "@/types/portal";
import { formatDuration } from "@/lib/formatters";

interface TripsTableProps {
  trips: TripWithDetails[];
  isLoading?: boolean;
}

export const TripsTable = ({ trips, isLoading }: TripsTableProps) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhuma viagem encontrada</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Motorista</TableHead>
            <TableHead>Veículo</TableHead>
            <TableHead>Origem / Destino</TableHead>
            <TableHead>Data/Hora</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>KM</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trips.map((trip) => {
            const kmDriven =
              trip.final_km !== null &&
              trip.final_km !== undefined &&
              trip.initial_km !== null &&
              trip.initial_km !== undefined
                ? Number(trip.final_km) - Number(trip.initial_km)
                : null;
            const startAt = trip.start_time ? new Date(trip.start_time) : null;
            const formattedStart =
              startAt && !isNaN(startAt.getTime())
                ? format(startAt, "dd/MM/yyyy HH:mm", { locale: ptBR })
                : "—";

            return (
              <TableRow key={trip.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {trip.employee?.full_name || "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    {trip.is_rented_vehicle ? (
                      <span className="text-sm">
                        {trip.rented_plate || trip.rented_model || "Alugado"}
                      </span>
                    ) : (
                      <span className="text-sm">
                        {trip.vehicle?.license_plate || "—"}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate max-w-[200px]">
                      {trip.origin || "—"} → {trip.destination || "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {formattedStart}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {trip.duration_seconds ? formatDuration(trip.duration_seconds) : "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-medium">
                    {kmDriven !== null ? `${kmDriven} km` : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={trip.status === "finalizada" ? "default" : "secondary"}
                    className={
                      trip.status === "finalizada"
                        ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                        : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                    }
                  >
                    {trip.status === "finalizada" ? "Finalizada" : "Em Andamento"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/portal/trips/${trip.id}`}>
                      <Eye className="h-4 w-4 mr-1" />
                      Ver
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

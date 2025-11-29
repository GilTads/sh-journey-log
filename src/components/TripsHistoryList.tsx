// src/components/TripsHistoryList.tsx
import { useState, useMemo } from "react";
import { History, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TripCard } from "@/components/TripCard";
import { TripCardSkeleton } from "@/components/TripCardSkeleton";
import { TripsHistoryFilters } from "@/components/TripsHistoryFilters";
import { useTripsHistory, TripHistory, TripStatus, SyncStatus } from "@/hooks/useTripsHistory";
import { getDayKey, getDayLabel } from "@/lib/formatters";

interface GroupedTrips {
  key: string;
  label: string;
  trips: TripHistory[];
}

const groupTripsByDay = (trips: TripHistory[]): GroupedTrips[] => {
  const groups = new Map<string, TripHistory[]>();

  for (const trip of trips) {
    const key = getDayKey(trip.start_time);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(trip);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // Mais recente primeiro
    .map(([key, dayTrips]) => ({
      key,
      label: getDayLabel(dayTrips[0].start_time),
      trips: dayTrips,
    }));
};

export const TripsHistoryList = () => {
  // Filter states
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<TripStatus>("all");
  const [syncStatusFilter, setSyncStatusFilter] = useState<SyncStatus | "all">("all");

  // Fetch trips with filters
  const {
    data: trips = [],
    isLoading,
    isError,
    refetch,
  } = useTripsHistory({
    employeeId: selectedEmployeeId || undefined,
    vehicleId: selectedVehicleId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    statusFilter: statusFilter !== "all" ? statusFilter : undefined,
    syncStatusFilter: syncStatusFilter !== "all" ? syncStatusFilter : undefined,
  });

  // Group trips by day
  const groupedTrips = useMemo(() => groupTripsByDay(trips), [trips]);

  const handleClearFilters = () => {
    setSelectedEmployeeId("");
    setSelectedVehicleId("");
    setStartDate("");
    setEndDate("");
    setStatusFilter("all");
    setSyncStatusFilter("all");
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <TripsHistoryFilters
        selectedEmployeeId={selectedEmployeeId}
        setSelectedEmployeeId={setSelectedEmployeeId}
        selectedVehicleId={selectedVehicleId}
        setSelectedVehicleId={setSelectedVehicleId}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        syncStatusFilter={syncStatusFilter}
        setSyncStatusFilter={setSyncStatusFilter}
        onClear={handleClearFilters}
        onRefresh={handleRefresh}
        isLoading={isLoading}
      />

      {/* Results Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" />
          <span>
            {isLoading
              ? "Carregando..."
              : `${trips.length} viagem${trips.length !== 1 ? "s" : ""} encontrada${trips.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <TripCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm text-destructive font-medium">
              Ocorreu um erro ao carregar as viagens.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tente novamente mais tarde.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !isError && trips.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <History className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              Nenhuma viagem encontrada
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tente ajustar os filtros ou iniciar uma nova viagem.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trips List Grouped by Day */}
      {!isLoading &&
        !isError &&
        trips.length > 0 &&
        groupedTrips.map((group) => (
          <div key={group.key} className="space-y-3">
            {/* Day Header */}
            <div className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm py-2 px-1 -mx-1 border-b">
              <h3 className="text-sm font-semibold text-foreground">
                {group.label}
              </h3>
              <span className="text-xs text-muted-foreground">
                {group.trips.length} viagem{group.trips.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Trip Cards */}
            <div className="space-y-3">
              {group.trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
};

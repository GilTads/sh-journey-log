import { useState } from "react";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { TripsFiltersPortal } from "@/components/portal/TripsFiltersPortal";
import { TripsTable } from "@/components/portal/TripsTable";
import { usePortalTrips } from "@/hooks/usePortalTrips";
import { TripFilters } from "@/types/portal";

const TripsList = () => {
  const [filters, setFilters] = useState<TripFilters>({});
  const { data: trips, isLoading } = usePortalTrips(filters);

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Viagens</h1>
          <p className="text-muted-foreground mt-1">
            Consulte e filtre todas as viagens registradas
          </p>
        </div>

        <TripsFiltersPortal filters={filters} onFiltersChange={setFilters} />

        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {trips?.length || 0} viagem(ns) encontrada(s)
            </p>
          </div>

          <TripsTable trips={trips || []} isLoading={isLoading} />
        </div>
      </div>
    </PortalLayout>
  );
};

export default TripsList;

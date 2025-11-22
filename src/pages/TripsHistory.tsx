import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { useTripsHistory } from "@/hooks/useTripsHistory";
import { useOfflineData } from "@/contexts/OfflineContext";
import type {
  OfflineEmployee,
  OfflineVehicle,
  OfflineTrip,
} from "@/hooks/useSQLite";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

type OfflineTripWithJoins = OfflineTrip & {
  employee?: Pick<OfflineEmployee, "nome_completo" | "matricula">;
  vehicle?: Pick<OfflineVehicle, "placa" | "marca" | "modelo">;
};

const TripsHistory = () => {
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const {
    isOnline,
    isReady,
    getMotoristas,
    getVeiculos,
    getViagens,
    lastSyncAt,
  } = useOfflineData();

  const [employees, setEmployees] = useState<OfflineEmployee[]>([]);
  const [vehicles, setVehicles] = useState<OfflineVehicle[]>([]);
  const [offlineTrips, setOfflineTrips] = useState<OfflineTripWithJoins[]>([]);
  const [isLoadingOfflineTrips, setIsLoadingOfflineTrips] = useState(false);

  // 🔄 Dados online (Supabase) – só quando tiver internet
  const {
    data: tripsOnline = [],
    isLoading: isLoadingTripsOnline,
  } = useTripsHistory({
    employeeId: employeeFilter || undefined,
    vehicleId: vehicleFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    enabled: isOnline,
  });

  // 🔁 Carrega funcionários/veículos (mesma lógica do TripForm)
  useEffect(() => {
    if (!isReady) return;

    const loadMaster = async () => {
      const emps = await getMotoristas();
      const vehs = await getVeiculos();
      setEmployees(emps);
      setVehicles(vehs);
    };

    loadMaster();
  }, [getMotoristas, getVeiculos, lastSyncAt, isReady]);

  // 🔁 Trips offline (SQLite) quando estiver sem internet
  useEffect(() => {
    if (!isReady) return;

    if (isOnline) {
      // Voltou a internet → usamos apenas o histórico online
      setOfflineTrips([]);
      return;
    }

    const loadOfflineTrips = async () => {
      setIsLoadingOfflineTrips(true);
      try {
        const rawTrips = await getViagens();

        // filtros em memória
        let filtered = rawTrips;

        if (employeeFilter) {
          filtered = filtered.filter(
            (t) => t.employee_id === employeeFilter
          );
        }

        if (vehicleFilter) {
          filtered = filtered.filter((t) => t.vehicle_id === vehicleFilter);
        }

        if (startDate) {
          filtered = filtered.filter(
            (t) => t.start_time.slice(0, 10) >= startDate
          );
        }

        if (endDate) {
          filtered = filtered.filter(
            (t) => t.start_time.slice(0, 10) <= endDate
          );
        }

        const joined: OfflineTripWithJoins[] = filtered.map((t) => ({
          ...t,
          employee: employees.find((e) => e.id === t.employee_id),
          vehicle: vehicles.find((v) => v.id === t.vehicle_id),
        }));

        setOfflineTrips(joined);
      } finally {
        setIsLoadingOfflineTrips(false);
      }
    };

    loadOfflineTrips();
  }, [
    isOnline,
    isReady,
    getViagens,
    employeeFilter,
    vehicleFilter,
    startDate,
    endDate,
    employees,
    vehicles,
  ]);

  // Opções para os combos (igual TripForm)
  const employeeOptions = employees.map((emp) => ({
    value: emp.id,
    label: `${emp.nome_completo} (${emp.matricula})`,
    searchText: `${emp.nome_completo} ${emp.matricula} ${emp.cargo}`,
  }));

  const vehicleOptions = vehicles.map((veh) => ({
    value: veh.id,
    label: `${veh.placa} - ${veh.marca} ${veh.modelo}`,
    searchText: `${veh.placa} ${veh.marca} ${veh.modelo}`,
  }));

  const formatDuration = (seconds: number | null) => {
    if (!seconds && seconds !== 0) return "-";
    const s = seconds ?? 0;
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const handleClearFilters = () => {
    setEmployeeFilter("");
    setVehicleFilter("");
    setStartDate("");
    setEndDate("");
  };

  const isLoadingTrips = isOnline
    ? isLoadingTripsOnline
    : isLoadingOfflineTrips;

  const trips = useMemo(
    () => (isOnline ? tripsOnline : offlineTrips),
    [isOnline, tripsOnline, offlineTrips]
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-8">
        <div className="max-w-5xl mx-auto px-4 pt-4 space-y-4">
          {/* Filtros */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Filtros
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Motorista */}
              <div className="space-y-2">
                <Label htmlFor="employee-filter">Motorista</Label>
                <SearchableCombobox
                  options={employeeOptions}
                  value={employeeFilter}
                  onChange={setEmployeeFilter}
                  placeholder="Digite nome ou matrícula..."
                  emptyText="Nenhum motorista encontrado"
                  disabled={!employees.length}
                  minCharsToSearch={2}
                />
              </div>

              {/* Veículo */}
              <div className="space-y-2">
                <Label htmlFor="vehicle-filter">Veículo</Label>
                <SearchableCombobox
                  options={vehicleOptions}
                  value={vehicleFilter}
                  onChange={setVehicleFilter}
                  placeholder="Digite placa ou modelo..."
                  emptyText="Nenhum veículo encontrado"
                  disabled={!vehicles.length}
                  minCharsToSearch={2}
                />
              </div>

              {/* Datas */}
              <div className="space-y-2">
                <Label htmlFor="start-date">Data Inicial</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">Data Final</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <Button variant="outline" onClick={handleClearFilters}>
                Limpar Filtros
              </Button>
            </div>
          </div>

          {/* Resultados */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {isLoadingTrips ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma viagem encontrada
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Motorista</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>KM Inicial</TableHead>
                      <TableHead>KM Final</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Destino</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.map((trip) => (
                      <TableRow key={trip.id}>
                        <TableCell>
                          {trip.start_time
                            ? format(
                                new Date(trip.start_time),
                                "dd/MM/yyyy HH:mm"
                              )
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {trip.employee?.nome_completo || "-"}
                        </TableCell>
                        <TableCell>
                          {trip.vehicle
                            ? `${trip.vehicle.placa} - ${trip.vehicle.marca} ${trip.vehicle.modelo}`
                            : "-"}
                        </TableCell>
                        <TableCell>{trip.km_inicial}</TableCell>
                        <TableCell>{trip.km_final ?? "-"}</TableCell>
                        <TableCell>
                          {formatDuration(trip.duration_seconds)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-block px-2 py-1 text-xs rounded ${
                              trip.status === "finalizada"
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {trip.status === "finalizada"
                              ? "Finalizada"
                              : "Em Andamento"}
                          </span>
                        </TableCell>
                        <TableCell>{trip.origem || "-"}</TableCell>
                        <TableCell>{trip.destino || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default TripsHistory;

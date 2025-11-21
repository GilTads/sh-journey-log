import { useState } from "react";
import { Header } from "@/components/Header";
import { useTripsHistory } from "@/hooks/useTripsHistory";
import { useEmployees } from "@/hooks/useEmployees";
import { useVehicles } from "@/hooks/useVehicles";
import { Combobox } from "@/components/ui/combobox";
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

const TripsHistory = () => {
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const { data: employees = [], isLoading: isLoadingEmployees } = useEmployees();
  const { data: vehicles = [], isLoading: isLoadingVehicles } = useVehicles();
  const { data: trips = [], isLoading: isLoadingTrips } = useTripsHistory({
    employeeId: employeeFilter,
    vehicleId: vehicleFilter,
    startDate: startDate,
    endDate: endDate,
  });

  const handleClearFilters = () => {
    setEmployeeFilter("");
    setVehicleFilter("");
    setStartDate("");
    setEndDate("");
  };

  const employeeOptions = employees.map((emp) => ({
    value: emp.id,
    label: `${emp.nome_completo} (${emp.matricula})`,
  }));

  const vehicleOptions = vehicles.map((veh) => ({
    value: veh.id,
    label: `${veh.placa} - ${veh.marca} ${veh.modelo}`,
  }));

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-foreground mb-6">
          Histórico de Viagens
        </h1>

        {/* Filters */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employee-filter">Motorista</Label>
              <Combobox
                options={employeeOptions}
                value={employeeFilter}
                onChange={setEmployeeFilter}
                placeholder="Selecione o motorista"
                searchPlaceholder="Buscar motorista..."
                emptyText="Nenhum motorista encontrado"
                disabled={isLoadingEmployees}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vehicle-filter">Veículo</Label>
              <Combobox
                options={vehicleOptions}
                value={vehicleFilter}
                onChange={setVehicleFilter}
                placeholder="Selecione o veículo"
                searchPlaceholder="Buscar veículo..."
                emptyText="Nenhum veículo encontrado"
                disabled={isLoadingVehicles}
              />
            </div>

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

        {/* Results */}
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
                    <TableHead>Data/Hora Início</TableHead>
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
                        {format(new Date(trip.start_time), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        {trip.employee?.nome_completo || "-"}
                      </TableCell>
                      <TableCell>
                        {trip.vehicle?.placa || "-"}
                      </TableCell>
                      <TableCell>{trip.km_inicial}</TableCell>
                      <TableCell>{trip.km_final || "-"}</TableCell>
                      <TableCell>{formatDuration(trip.duration_seconds)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-block px-2 py-1 text-xs rounded ${
                            trip.status === "finalizada"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {trip.status === "finalizada" ? "Finalizada" : "Em Andamento"}
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
      </main>
    </div>
  );
};

export default TripsHistory;

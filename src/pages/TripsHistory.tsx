// src/pages/TripsHistory.tsx
import { useEffect, useState } from "react";
import { format } from "date-fns";

import { Header } from "@/components/Header";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useTripsHistory } from "@/hooks/useTripsHistory";
import { useOfflineData } from "@/contexts/OfflineContext";
import { OfflineEmployee, OfflineVehicle } from "@/hooks/useSQLite";
import { Loader2 } from "lucide-react";

const TripsHistory = () => {
  // filtros
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // opções de combos
  const { getMotoristas, getVeiculos } = useOfflineData();
  const [employeeOptions, setEmployeeOptions] = useState<any[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<any[]>([]);

  useEffect(() => {
    const loadOptions = async () => {
      const employees: OfflineEmployee[] = await getMotoristas();
      const vehicles: OfflineVehicle[] = await getVeiculos();

      setEmployeeOptions(
        employees.map((emp) => ({
          value: String(emp.id),
          label: `${emp.nome_completo} (${emp.matricula})`,
          searchText: `${emp.nome_completo} ${emp.matricula} ${emp.cargo ?? ""}`,
        }))
      );

      setVehicleOptions(
        vehicles.map((veh) => ({
          value: String(veh.id),
          label: `${veh.placa} - ${veh.marca} ${veh.modelo}`,
          searchText: `${veh.placa} ${veh.marca} ${veh.modelo}`,
        }))
      );
    };

    loadOptions();
  }, [getMotoristas, getVeiculos]);

  // hook que já trata online/offline
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
  });

  const handleClearFilters = () => {
    setSelectedEmployeeId("");
    setSelectedVehicleId("");
    setStartDate("");
    setEndDate("");
    refetch();
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return format(d, "dd/MM/yyyy HH:mm");
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m} min`;
    return `${h}h ${m}min`;
  };

  return (
    <div className="min-h-screen bg-muted">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* FILTROS */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Filtros</h2>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Motorista */}
            <div className="space-y-2">
              <Label>Motorista</Label>
              <SearchableCombobox
                options={employeeOptions}
                value={selectedEmployeeId}
                onChange={setSelectedEmployeeId}
                placeholder="Digite nome ou matrícula..."
                emptyText="Nenhum motorista encontrado."
                minCharsToSearch={2}
              />
            </div>

            {/* Veículo */}
            <div className="space-y-2">
              <Label>Veículo</Label>
              <SearchableCombobox
                options={vehicleOptions}
                value={selectedVehicleId}
                onChange={setSelectedVehicleId}
                placeholder="Digite placa ou modelo..."
                emptyText="Nenhum veículo encontrado."
                minCharsToSearch={2}
              />
            </div>

            {/* Datas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Inicial</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Data Final</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between gap-2">
            <Button variant="outline" type="button" onClick={handleClearFilters}>
              Limpar Filtros
            </Button>

            <Button type="button" onClick={() => refetch()}>
              Aplicar
            </Button>
          </CardFooter>
        </Card>

        {/* LISTA DE VIAGENS */}
        <section className="space-y-3">
          {isLoading && (
            <div className="flex justify-center items-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando viagens...
            </div>
          )}

          {isError && (
            <div className="text-center text-sm text-red-500 py-4">
              Ocorreu um erro ao carregar as viagens.
            </div>
          )}

          {!isLoading && !isError && trips.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma viagem encontrada
              </CardContent>
            </Card>
          )}

          {!isLoading &&
            !isError &&
            trips.length > 0 &&
            trips.map((trip) => {
              const driverLabel =
                trip.employee?.nome_completo && trip.employee?.matricula
                  ? `${trip.employee.nome_completo} (${trip.employee.matricula})`
                  : trip.employee_id;

              const vehicleLabel =
                trip.vehicle?.placa && trip.vehicle?.modelo
                  ? `${trip.vehicle.placa} - ${trip.vehicle.marca} ${trip.vehicle.modelo}`
                  : trip.vehicle_id;

              return (
                <Card key={trip.id} className="shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="text-xs uppercase text-muted-foreground">
                        Viagem #{trip.id}
                      </div>

                      <div className="text-sm font-semibold">
                        {driverLabel || "Motorista não informado"}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {vehicleLabel || "Veículo não informado"}
                      </div>
                    </div>

                    {trip.status && (
                      <Badge
                        variant={
                          trip.status.toLowerCase() === "finalizada" ||
                          trip.status.toLowerCase() === "completed"
                            ? "default"
                            : "outline"
                        }
                      >
                        {trip.status}
                      </Badge>
                    )}
                  </CardHeader>

                  <CardContent className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                    {/* Início */}
                    <div className="space-y-1">
                      <div className="font-medium text-muted-foreground">
                        Início
                      </div>
                      <div>{formatDateTime(trip.start_time)}</div>
                    </div>

                    {/* Fim */}
                    <div className="space-y-1">
                      <div className="font-medium text-muted-foreground">
                        Fim
                      </div>
                      <div>{formatDateTime(trip.end_time)}</div>
                    </div>

                    {/* Km */}
                    <div className="space-y-1">
                      <div className="font-medium text-muted-foreground">
                        Km
                      </div>
                      <div>
                        {trip.km_inicial}
                        {trip.km_final != null && ` ➜ ${trip.km_final}`}
                      </div>
                    </div>

                    {/* Duração */}
                    <div className="space-y-1">
                      <div className="font-medium text-muted-foreground">
                        Duração
                      </div>
                      <div>{formatDuration(trip.duration_seconds)}</div>
                    </div>

                    {/* Origem */}
                    {trip.origem && (
                      <div className="space-y-1 col-span-2">
                        <div className="font-medium text-muted-foreground">
                          Origem
                        </div>
                        <div>{trip.origem}</div>
                      </div>
                    )}

                    {/* Destino */}
                    {trip.destino && (
                      <div className="space-y-1 col-span-2">
                        <div className="font-medium text-muted-foreground">
                          Destino
                        </div>
                        <div>{trip.destino}</div>
                      </div>
                    )}

                    {/* Motivo */}
                    {trip.motivo && (
                      <div className="space-y-1 col-span-2">
                        <div className="font-medium text-muted-foreground">
                          Motivo da viagem
                        </div>
                        <div>{trip.motivo}</div>
                      </div>
                    )}

                    {/* Observação */}
                    {trip.observacao && (
                      <div className="space-y-1 col-span-2">
                        <div className="font-medium text-muted-foreground">
                          Observação
                        </div>
                        <div>{trip.observacao}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </section>
      </main>
    </div>
  );
};

export default TripsHistory;

// src/components/TripsHistoryFilters.tsx
import { useEffect, useState } from "react";
import { Filter, X, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useOfflineData } from "@/contexts/OfflineContext";
import { OfflineEmployee, OfflineVehicle } from "@/hooks/useSQLite";
import { TripStatus, SyncStatus } from "@/hooks/useTripsHistory";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface TripsHistoryFiltersProps {
  selectedEmployeeId: string;
  setSelectedEmployeeId: (id: string) => void;
  selectedVehicleId: string;
  setSelectedVehicleId: (id: string) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  statusFilter: TripStatus;
  setStatusFilter: (status: TripStatus) => void;
  syncStatusFilter: SyncStatus | "all";
  setSyncStatusFilter: (status: SyncStatus | "all") => void;
  onClear: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const TripsHistoryFilters = ({
  selectedEmployeeId,
  setSelectedEmployeeId,
  selectedVehicleId,
  setSelectedVehicleId,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  statusFilter,
  setStatusFilter,
  syncStatusFilter,
  setSyncStatusFilter,
  onClear,
  onRefresh,
  isLoading,
}: TripsHistoryFiltersProps) => {
  const [isOpen, setIsOpen] = useState(true);
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
          label: `${emp.full_name} (${emp.registration_id})`,
          searchText: `${emp.full_name} ${emp.registration_id} ${emp.position ?? ""}`,
        }))
      );

      setVehicleOptions(
        vehicles.map((veh) => ({
          value: String(veh.id),
          label: `${veh.license_plate} - ${veh.brand} ${veh.model}`,
          searchText: `${veh.license_plate} ${veh.brand} ${veh.model}`,
        }))
      );
    };

    loadOptions();
  }, [getMotoristas, getVeiculos]);

  const hasActiveFilters =
    selectedEmployeeId ||
    selectedVehicleId ||
    startDate ||
    endDate ||
    statusFilter !== "all" ||
    syncStatusFilter !== "all";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Filtros</h2>
                {hasActiveFilters && (
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                    Ativos
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {isOpen ? "Fechar" : "Abrir"}
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Motorista */}
            <div className="space-y-2">
              <Label className="text-xs">Motorista</Label>
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
              <Label className="text-xs">Veículo</Label>
              <SearchableCombobox
                options={vehicleOptions}
                value={selectedVehicleId}
                onChange={setSelectedVehicleId}
                placeholder="Digite placa ou modelo..."
                emptyText="Nenhum veículo encontrado."
                minCharsToSearch={2}
              />
            </div>

            {/* Status da Viagem */}
            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              <ToggleGroup
                type="single"
                value={statusFilter}
                onValueChange={(val) => val && setStatusFilter(val as TripStatus)}
                className="justify-start flex-wrap"
              >
                <ToggleGroupItem value="all" size="sm" className="text-xs">
                  Todos
                </ToggleGroupItem>
                <ToggleGroupItem value="em_andamento" size="sm" className="text-xs">
                  Em andamento
                </ToggleGroupItem>
                <ToggleGroupItem value="finalizada" size="sm" className="text-xs">
                  Finalizada
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Status de Sincronização */}
            <div className="space-y-2">
              <Label className="text-xs">Sincronização</Label>
              <ToggleGroup
                type="single"
                value={syncStatusFilter}
                onValueChange={(val) => val && setSyncStatusFilter(val as SyncStatus | "all")}
                className="justify-start flex-wrap"
              >
                <ToggleGroupItem value="all" size="sm" className="text-xs">
                  Todos
                </ToggleGroupItem>
                <ToggleGroupItem value="synced" size="sm" className="text-xs">
                  Sincronizados
                </ToggleGroupItem>
                <ToggleGroupItem value="offline-only" size="sm" className="text-xs">
                  Pendentes
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Data Inicial</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Data Final</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClear}
                className="flex-1"
                disabled={!hasActiveFilters}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Limpar
              </Button>
              <Button
                size="sm"
                onClick={onRefresh}
                className="flex-1"
                disabled={isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

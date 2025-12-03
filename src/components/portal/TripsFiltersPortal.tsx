import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { TripFilters } from "@/types/portal";
import { supabase } from "@/integrations/supabase/client";

interface TripsFiltersPortalProps {
  filters: TripFilters;
  onFiltersChange: (filters: TripFilters) => void;
}

export const TripsFiltersPortal = ({ filters, onFiltersChange }: TripsFiltersPortalProps) => {
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; license_plate: string; model: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [empResult, vehResult] = await Promise.all([
        supabase.from("employees").select("id, full_name").order("full_name"),
        supabase.from("vehicles").select("id, license_plate, model").order("license_plate"),
      ]);
      
      if (empResult.data) setEmployees(empResult.data);
      if (vehResult.data) setVehicles(vehResult.data);
    };
    fetchData();
  }, []);

  const handleClear = () => {
    onFiltersChange({});
  };

  const hasFilters = Object.values(filters).some(v => v);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="space-y-2">
            <Label>Data Início</Label>
            <Input
              type="date"
              value={filters.startDate || ""}
              onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Data Fim</Label>
            <Input
              type="date"
              value={filters.endDate || ""}
              onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Motorista</Label>
            <Select
              value={filters.employeeId || "all"}
              onValueChange={(v) => onFiltersChange({ ...filters, employeeId: v === "all" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Veículo</Label>
            <Select
              value={filters.vehicleId || "all"}
              onValueChange={(v) => onFiltersChange({ ...filters, vehicleId: v === "all" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {vehicles.map((veh) => (
                  <SelectItem key={veh.id} value={veh.id}>
                    {veh.license_plate} - {veh.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={filters.status || "all"}
              onValueChange={(v) => onFiltersChange({ ...filters, status: v === "all" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="finalizada">Finalizada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 flex items-end">
            {hasFilters && (
              <Button variant="outline" onClick={handleClear} className="w-full">
                <X className="h-4 w-4 mr-2" />
                Limpar
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <Label>Origem</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar origem..."
                value={filters.origin || ""}
                onChange={(e) => onFiltersChange({ ...filters, origin: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destino</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar destino..."
                value={filters.destination || ""}
                onChange={(e) => onFiltersChange({ ...filters, destination: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// src/components/SQLiteDebugPanel.tsx
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSQLite } from "@/hooks/useSQLite";
import { useOfflineData } from "@/contexts/OfflineContext";
import { RefreshCw } from "lucide-react";

export const SQLiteDebugPanel = () => {
  const { isReady, hasDb, getEmployees, getVehicles, getAllTrips } = useSQLite();
  const { isOnline, isSyncing, syncNow } = useOfflineData();

  const [empCount, setEmpCount] = useState<number>(0);
  const [vehCount, setVehCount] = useState<number>(0);
  const [tripCount, setTripCount] = useState<number>(0);

  const loadCounts = async () => {
    try {
      const [emps, vehs, trips] = await Promise.all([
        getEmployees(),
        getVehicles(),
        getAllTrips(),
      ]);
      setEmpCount(emps.length);
      setVehCount(vehs.length);
      setTripCount(trips.length);
    } catch (error) {
      console.error("[SQLiteDebugPanel] Erro ao carregar contagens:", error);
      setEmpCount(0);
      setVehCount(0);
      setTripCount(0);
    }
  };

  useEffect(() => {
    if (isReady && hasDb) {
      loadCounts();
    }
  }, [isReady, hasDb]);

  const handleRefresh = async () => {
    await loadCounts();
  };

  return (
    <Card className="mb-4">
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="font-semibold">🔧 Debug SQLite</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="h-8 w-8"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span>SQLite Ready:</span>
          <span className="font-medium">{isReady ? "✅ SIM" : "❌ NÃO"}</span>

          <span>Banco Conectado (hasDb):</span>
          <span className="font-medium">{hasDb ? "✅ SIM" : "❌ NÃO"}</span>

          <span>Online:</span>
          <span className="font-medium">
            {isOnline ? "🟢 ONLINE" : "🟠 OFFLINE"}
          </span>

          <span>Sincronizando:</span>
          <span className="font-medium">{isSyncing ? "⏳ SIM" : "✅ NÃO"}</span>

          <span>Funcionários no SQLite:</span>
          <span className="font-medium">{empCount}</span>

          <span>Veículos no SQLite:</span>
          <span className="font-medium">{vehCount}</span>

          <span>Viagens no SQLite:</span>
          <span className="font-medium">{tripCount}</span>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            className="flex-1"
          >
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={syncNow}
            disabled={!isOnline || isSyncing}
            className="flex-1"
          >
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>
      </div>
    </Card>
  );
};

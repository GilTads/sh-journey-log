import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSQLite } from "@/hooks/useSQLite";
import { useOfflineData } from "@/contexts/OfflineContext";
import { RefreshCw } from "lucide-react";

export const SQLiteDebugPanel = () => {
  const { isReady, hasDb, getEmployees, getVehicles } = useSQLite();
  const { isOnline, isSyncing, syncNow } = useOfflineData();
  const [empCount, setEmpCount] = useState<number>(0);
  const [vehCount, setVehCount] = useState<number>(0);

  const loadCounts = async () => {
    const emps = await getEmployees();
    const vehs = await getVehicles();
    setEmpCount(emps.length);
    setVehCount(vehs.length);
  };

  useEffect(() => {
    if (isReady && hasDb) {
      loadCounts();
    }
  }, [isReady, hasDb]);

  return (
    <Card className="p-4 mb-4 bg-muted/30">
      <h3 className="font-semibold mb-3 text-sm">🔧 Debug SQLite</h3>
      
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span>SQLite Ready:</span>
          <span className={isReady ? "text-green-600" : "text-red-600"}>
            {isReady ? "✅ SIM" : "❌ NÃO"}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Banco Conectado (hasDb):</span>
          <span className={hasDb ? "text-green-600" : "text-red-600"}>
            {hasDb ? "✅ SIM" : "❌ NÃO"}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Online:</span>
          <span className={isOnline ? "text-green-600" : "text-orange-600"}>
            {isOnline ? "✅ ONLINE" : "📴 OFFLINE"}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Sincronizando:</span>
          <span>{isSyncing ? "⏳ SIM" : "✅ NÃO"}</span>
        </div>

        <hr className="my-2" />
        
        <div className="flex justify-between font-semibold">
          <span>Funcionários no SQLite:</span>
          <span className={empCount > 0 ? "text-green-600" : "text-red-600"}>
            {empCount}
          </span>
        </div>
        
        <div className="flex justify-between font-semibold">
          <span>Veículos no SQLite:</span>
          <span className={vehCount > 0 ? "text-green-600" : "text-red-600"}>
            {vehCount}
          </span>
        </div>

        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={loadCounts}
            className="flex-1"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
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

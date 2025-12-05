import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Database,
  Wifi,
  Smartphone,
  AlertTriangle,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SQLiteDebugPanel } from "@/components/SQLiteDebugPanel";
import { useNavigate } from "react-router-dom";
import { useOfflineData } from "@/contexts/OfflineContext";
import { useSQLite } from "@/hooks/useSQLite";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils"; // ✅ IMPORT DO cn
import { clearRegisteredDevice } from "@/lib/deviceId";
import { toast } from "sonner";

export default function DebugInfo() {
  const navigate = useNavigate();

  // offline data
  const {
    isOnline,
    lastSyncAt,
    isSyncing,
    syncNow,
    deviceId,
    deviceCode,
    deviceName,
    refreshDeviceFromStorage,
  } = useOfflineData();

  // sqlite access (usando funções que realmente existem no hook)
  const { getEmployees, getVehicles, getUnsyncedTrips, getAllTrips } =
    useSQLite();

  const [appInfo, setAppInfo] = useState<any>({});
  const [supabaseStatus, setSupabaseStatus] =
    useState<"idle" | "ok" | "error">("idle");
  const [supabaseMessage, setSupabaseMessage] = useState("");
  const [isClearingDevice, setIsClearingDevice] = useState(false);

  const [pendingTrips, setPendingTrips] = useState<any[]>([]);
  const [sqliteDump, setSqliteDump] = useState<any>({
    employees: [],
    vehicles: [],
    trips: [],
  });

  const [errorLogs, setErrorLogs] = useState<string[]>([]);

  // Carrega logs internos do localStorage
  useEffect(() => {
    try {
      const logs = JSON.parse(localStorage.getItem("sh-trip-errors") || "[]");
      setErrorLogs(logs);
    } catch {
      setErrorLogs([]);
    }
  }, []);

  const addLog = (msg: string) => {
    const logs = [...errorLogs, `[${new Date().toISOString()}] ${msg}`];
    setErrorLogs(logs);
    localStorage.setItem("sh-trip-errors", JSON.stringify(logs));
  };

  // Carrega dados do SQLite (employees, vehicles, trips)
  const loadDump = async () => {
    try {
      const emps = await getEmployees();
      const vehs = await getVehicles();
      const pending = await getUnsyncedTrips();
      const allTrips = await getAllTrips();

      setPendingTrips(pending);
      setSqliteDump({
        employees: emps,
        vehicles: vehs,
        trips: allTrips,
      });
    } catch (err: any) {
      console.error(err);
      addLog("Erro ao carregar dump do SQLite: " + (err?.message ?? String(err)));
    }
  };

  // Info de app/dispositivo
  useEffect(() => {
    const info = {
      appVersion: "1.0.0",
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform(),
      sqliteAvailable: true,
    };
    setAppInfo(info);
  }, []);

  // Teste de conexão Supabase
  const testSupabase = async () => {
    setSupabaseStatus("idle");
    setSupabaseMessage("");

    try {
      const { error } = await supabase.from("trips").select("id").limit(1);
      if (error) throw error;

      setSupabaseStatus("ok");
      setSupabaseMessage("Conexão com Supabase OK");
    } catch (err: any) {
      console.error(err);
      setSupabaseStatus("error");
      setSupabaseMessage("Erro ao conectar: " + (err?.message ?? String(err)));
      addLog("Falha Supabase: " + (err?.message ?? String(err)));
    }
  };

  const handleClearDevice = async () => {
    try {
      setIsClearingDevice(true);
      await clearRegisteredDevice();
      await refreshDeviceFromStorage();
      toast.success("Registro do dispositivo limpo. Cadastre novamente para continuar usando o app.");
      navigate("/registrar-dispositivo");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao limpar registro do dispositivo");
      addLog("Erro ao limpar dispositivo: " + (err?.message ?? String(err)));
    } finally {
      setIsClearingDevice(false);
    }
  };

  useEffect(() => {
    loadDump();
  }, []);

  return (
    <div className="min-h-screen bg-muted px-4 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          🛠️ Informações para a TI
        </h1>
      </div>

      {/* Status de conectividade */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            Status de Conectividade
          </h2>

          <p className="text-sm">
            <strong>Plataforma:</strong> {appInfo.platform}
          </p>

          <p className="text-sm">
            <strong>Status:</strong> {isOnline ? "🌐 Online" : "📡 Offline"}
          </p>

          <p className="text-sm">
            <strong>Última Sincronização:</strong>{" "}
            {lastSyncAt ? lastSyncAt.toLocaleString("pt-BR") : "Nunca"}
          </p>

          <Button
            onClick={() => syncNow()}
            disabled={isSyncing || !isOnline}
            className="mt-2"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Forçar Sincronização
          </Button>
        </CardContent>
      </Card>

      {/* Teste Supabase */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            Teste de Conexão com Supabase
          </h2>

          <Button onClick={testSupabase} variant="outline">
            Testar Conexão
          </Button>

          {supabaseStatus !== "idle" && (
            <p
              className={cn(
                "text-sm mt-2",
                supabaseStatus === "ok" ? "text-green-600" : "text-red-600"
              )}
            >
              {supabaseMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Info do app/dispositivo */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            Informações do App e Dispositivo
          </h2>

          <p className="text-sm">
            <strong>Versão do App:</strong> {appInfo.appVersion}
          </p>
          <p className="text-sm">
            <strong>Native:</strong> {String(appInfo.isNative)}
          </p>
          <p className="text-sm">
            <strong>SQLite Disponível:</strong>{" "}
            {String(appInfo.sqliteAvailable)}
          </p>
          <p className="text-sm">
            <strong>Device ID:</strong> {deviceId || "(indisponível)"}
          </p>
          <p className="text-sm">
            <strong>Código do dispositivo:</strong> {deviceCode || "(indisponível)"}
          </p>
          <p className="text-sm">
            <strong>Nome do dispositivo:</strong> {deviceName || "(indisponível)"}
          </p>
          <Button
            variant="destructive"
            onClick={handleClearDevice}
            disabled={isClearingDevice}
            className="mt-2"
          >
            {isClearingDevice ? "Limpando registro..." : "Limpar registro do dispositivo"}
          </Button>
        </CardContent>
      </Card>

      {/* Viagens pendentes */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Viagens Pendentes de Sincronização
          </h2>

          {pendingTrips.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma viagem pendente.
            </p>
          ) : (
            <ul className="text-sm list-disc ml-5">
              {pendingTrips.map((t) => (
                <li key={t.id}>
                  #{t.id} — {t.origem} ➜ {t.destino} — Km {t.km_inicial} ➜{" "}
                  {t.km_final}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Dump + painel SQLite */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Dump Completo do SQLite
          </h2>

          <SQLiteDebugPanel />

          <pre className="text-xs bg-black/20 p-3 rounded-md max-h-[300px] overflow-auto">
{JSON.stringify(sqliteDump, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Logs Internos de Erro
          </h2>

          {errorLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum erro registrado.
            </p>
          ) : (
            <pre className="text-xs bg-black/20 p-3 rounded-md max-h-[250px] overflow-auto">
{errorLogs.join("\n")}
            </pre>
          )}

          <Button
            variant="destructive"
            onClick={() => {
              setErrorLogs([]);
              localStorage.removeItem("sh-trip-errors");
            }}
          >
            Limpar Logs
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

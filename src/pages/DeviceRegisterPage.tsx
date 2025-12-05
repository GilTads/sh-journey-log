import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineData } from "@/contexts/OfflineContext";
import { setRegisteredDevice } from "@/lib/deviceId";
import { toast } from "sonner";

const DeviceRegisterPage = () => {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const {
    isOnline,
    deviceId,
    deviceCode,
    deviceName,
    refreshDeviceFromStorage,
    isDeviceLoaded,
  } = useOfflineData();

  useEffect(() => {
    if (isDeviceLoaded && deviceId) {
      navigate("/");
    }
  }, [deviceId, isDeviceLoaded, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();

    if (!trimmed) {
      toast.error("Informe o código do dispositivo.");
      return;
    }

    if (!isOnline) {
      toast.error("Conecte-se à internet para registrar o dispositivo.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("devices")
        .select("id, code, name, is_active")
        .eq("code", trimmed)
        .maybeSingle();

      if (error || !data) {
        toast.error("Dispositivo não encontrado.");
        return;
      }

      if (data.is_active === false) {
        toast.error("Este dispositivo está desativado.");
        return;
      }

      await setRegisteredDevice({
        id: data.id,
        code: data.code,
        name: data.name ?? undefined,
      });
      await refreshDeviceFromStorage();

      toast.success("Dispositivo registrado com sucesso!");
      navigate("/");
    } catch (err) {
      console.error("[DeviceRegisterPage] Erro ao registrar dispositivo:", err);
      toast.error("Erro ao registrar dispositivo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const offlineBlocking = !isOnline && !deviceId;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2 text-center">
            <h1 className="text-xl font-semibold">Registrar Dispositivo</h1>
            <p className="text-sm text-muted-foreground">
              Digite o código fornecido no portal para vincular este app a um dispositivo registrado.
            </p>
          </div>

          {offlineBlocking && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
              É necessário estar online pelo menos uma vez para registrar o dispositivo.
            </div>
          )}

          {deviceId && (
            <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md p-2">
              Dispositivo atual: {deviceCode || deviceId}
              {deviceName ? ` — ${deviceName}` : ""}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deviceCode">Código do dispositivo</Label>
              <Input
                id="deviceCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: RDV-0001"
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting || !isOnline}>
              {isSubmitting ? "Registrando..." : "Registrar"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            O código vem da tabela <code>devices</code> no Supabase e substitui o antigo ID gerado localmente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceRegisterPage;

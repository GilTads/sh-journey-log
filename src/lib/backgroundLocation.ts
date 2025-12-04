import { registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  Location,
  CallbackError,
} from "@capacitor-community/background-geolocation";

// Wrapper para o plugin de geolocalização em segundo plano.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation"
);

export type BackgroundWatcher = {
  id: string;
};

/**
 * Inicia o watcher em segundo plano com notificação persistente.
 * Retorna o id para parar depois.
 */
export const startBackgroundWatcher = async (
  onLocation: (loc: Location) => Promise<void> | void,
  onError?: (err: CallbackError) => void
): Promise<BackgroundWatcher | null> => {
  try {
    const options: any = {
      // Foreground service text
      backgroundTitle: "Viagem em andamento",
      backgroundMessage: "Capturando localização com alta precisão",
      // Permissões
      requestPermissions: true,
      stale: false,
      // Precisão e frequência
      desiredAccuracy: "high",
      distanceFilter: 5, // meters
      stationaryRadius: 10, // meters
      // Evita desligar ao fechar app
      stopOnTerminate: false,
      // Não usar significant changes (precisamos de pontos contínuos)
      useSignificantChanges: false,
    };

    const id = await BackgroundGeolocation.addWatcher(
      options,
      async (location, error) => {
        if (error) {
          console.error("[BG] Erro no watcher:", error);
          onError?.(error);
          return;
        }
        if (!location) return;
        console.log(
          "[BG] Posição recebida",
          {
            lat: location.latitude,
            lng: location.longitude,
            acc: location.accuracy,
            speed: location.speed,
            ts: location.time,
          }
        );
        await onLocation(location);
      }
    );
    console.log("[BG] Background watcher iniciado:", id);
    return { id };
  } catch (err) {
    console.error("[BG] Falha ao iniciar background watcher:", err);
    return null;
  }
};

export const stopBackgroundWatcher = async (watcher: BackgroundWatcher | null) => {
  if (!watcher?.id) return;
  try {
    await BackgroundGeolocation.removeWatcher({ id: watcher.id });
    console.log("[BG] Background watcher parado:", watcher.id);
  } catch (err) {
    console.error("[BG] Falha ao parar watcher:", err);
  }
};

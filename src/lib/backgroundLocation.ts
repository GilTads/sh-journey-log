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
    const id = await BackgroundGeolocation.addWatcher(
      {
        // Mensagens da notificação do foreground service (Android)
        backgroundTitle: "Viagem em andamento",
        backgroundMessage: "Capturando localização a cada 30s",
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      async (location, error) => {
        if (error) {
          console.error("[BG] Erro no watcher:", error);
          onError?.(error);
          return;
        }
        if (!location) return;
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

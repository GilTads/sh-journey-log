import { Capacitor, registerPlugin } from "@capacitor/core";

type BackgroundLocationPlugin = {
  startService(options?: { title?: string; text?: string }): Promise<void>;
  stopService(): Promise<void>;
};

const BackgroundLocation = Capacitor.isNativePlatform()
  ? registerPlugin<BackgroundLocationPlugin>("BackgroundLocation")
  : null;

export const startBackgroundLocationService = async (
  options?: { title?: string; text?: string }
) => {
  if (!BackgroundLocation) return;
  try {
    await BackgroundLocation.startService({
      title: options?.title,
      text: options?.text,
    });
  } catch (error) {
    console.error("[backgroundLocation] Falha ao iniciar serviço:", error);
  }
};

export const stopBackgroundLocationService = async () => {
  if (!BackgroundLocation) return;
  try {
    await BackgroundLocation.stopService();
  } catch (error) {
    console.error("[backgroundLocation] Falha ao parar serviço:", error);
  }
};

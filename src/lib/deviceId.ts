import { Preferences } from "@capacitor/preferences";

const STORAGE_KEY = 'sh_device_id';

let cachedDeviceId: string | null = null;

export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value) {
      cachedDeviceId = value;
      return value;
    }
  } catch (err) {
    console.error('[deviceId] Erro ao ler Preferences:', err);
  }

  const newId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  cachedDeviceId = newId;
  try {
    await Preferences.set({ key: STORAGE_KEY, value: newId });
  } catch (err) {
    console.error('[deviceId] Erro ao salvar Preferences:', err);
  }
  return newId;
};

import { Preferences } from "@capacitor/preferences";

const STORAGE_KEY = "sh_registered_device";

export interface RegisteredDevice {
  id: string;   // devices.id (uuid) - FK in Supabase trips/trip_points
  code: string; // devices.code (ex: RDV-0001)
  name?: string | null;
}

const parseDevice = (raw?: string | null): RegisteredDevice | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RegisteredDevice;
    if (parsed?.id && parsed?.code) {
      return {
        id: parsed.id,
        code: parsed.code,
        name: parsed.name ?? null,
      };
    }
    return null;
  } catch (err) {
    console.error("[deviceId] Erro ao converter registro salvo:", err);
    return null;
  }
};

export const getRegisteredDevice = async (): Promise<RegisteredDevice | null> => {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    return parseDevice(value);
  } catch (err) {
    console.error("[deviceId] Erro ao ler dispositivo registrado:", err);
    return null;
  }
};

export const setRegisteredDevice = async (device: RegisteredDevice): Promise<void> => {
  try {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(device) });
  } catch (err) {
    console.error("[deviceId] Erro ao salvar dispositivo registrado:", err);
  }
};

export const clearRegisteredDevice = async (): Promise<void> => {
  try {
    await Preferences.remove({ key: STORAGE_KEY });
  } catch (err) {
    console.error("[deviceId] Erro ao limpar dispositivo registrado:", err);
  }
};

export const getRegisteredDeviceId = async (): Promise<string | null> => {
  const device = await getRegisteredDevice();
  return device?.id ?? null;
};

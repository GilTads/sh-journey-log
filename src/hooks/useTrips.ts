import { supabase } from "@/integrations/supabase/client";

export interface TripRecord {
  employee_id: string;
  vehicle_id: string;
  km_inicial: number;
  km_final: number;
  start_time: string;
  end_time: string;
  start_latitude?: number;
  start_longitude?: number;
  end_latitude?: number;
  end_longitude?: number;
  duration_seconds: number;
  origem?: string;
  destino?: string;
  motivo?: string;
  observacao?: string;
  status: string;
  employee_photo_url?: string;
  trip_photos_urls?: string[];
}

export const useTrips = () => {
  const uploadPhoto = async (file: File, path: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from("trip-photos")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from("trip-photos")
        .getPublicUrl(data.path);

      return publicUrlData.publicUrl;
    } catch (error) {
      console.error("Error uploading photo:", error);
      return null;
    }
  };

  const createTrip = async (tripData: TripRecord) => {
    try {
      const { data, error } = await supabase
        .from("trips")
        .insert([tripData])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Error creating trip:", error);
      return { data: null, error };
    }
  };

  return {
    uploadPhoto,
    createTrip,
  };
};

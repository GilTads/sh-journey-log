import { supabase } from "@/integrations/supabase/client";

export interface TripRecord {
  local_id: string;
  employee_id: string;
  vehicle_id?: string | null;
  initial_km: number;
  final_km: number;
  start_time: string;
  end_time: string;
  start_latitude?: number;
  start_longitude?: number;
  end_latitude?: number;
  end_longitude?: number;
  duration_seconds: number;
  origin?: string;
  destination?: string;
  reason?: string;
  notes?: string;
  status: string;
  employee_photo_url?: string;
  trip_photos_urls?: string[];
  is_rented_vehicle?: boolean;
  rented_plate?: string | null;
  rented_model?: string | null;
  rented_company?: string | null;
  device_id?: string | null;
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
        .upsert([tripData as any], { onConflict: "local_id" })
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Error creating trip:", error);
      return { data: null, error };
    }
  };

  const updateTrip = async (tripId: string, updates: Partial<TripRecord>) => {
    try {
      console.log("[useTrips] Updating trip:", tripId, "Status:", updates.status);
      
      const { data, error } = await supabase
        .from("trips")
        .update(updates as any)
        .eq("id", tripId)
        .select()
        .single();

      if (error) throw error;
      
      console.log("[useTrips] Trip updated successfully. Final status:", data?.status);
      return { data, error: null };
    } catch (error) {
      console.error("[useTrips] Error updating trip:", error);
      return { data: null, error };
    }
  };

  /**
   * Fetch ongoing trip from Supabase
   * STRICT FILTER: status = 'em_andamento' AND end_time IS NULL
   */
  const getOngoingTripFromServer = async (deviceId?: string | null) => {
    try {
      let query = supabase
        .from("trips")
        .select("*")
        .eq("status", "em_andamento")
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1);

      if (deviceId) {
        query = query.eq("device_id", deviceId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error("[useTrips] Error fetching ongoing trip:", error);
        return null;
      }

      console.log("[useTrips] Ongoing trip found:", data?.id || "none");
      return data;
    } catch (error) {
      console.error("[useTrips] Error fetching ongoing trip:", error);
      return null;
    }
  };

  return {
    uploadPhoto,
    createTrip,
    updateTrip,
    getOngoingTripFromServer,
  };
};

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Vehicle {
  id: string;
  license_plate: string;
  brand: string;
  model: string;
}

export const useVehicles = () => {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("license_plate");

      if (error) throw error;
      return data as Vehicle[];
    },
  });
};

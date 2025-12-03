import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TripFilters, TripWithDetails, TripPosition, DashboardStats } from "@/types/portal";

export const usePortalTrips = (filters: TripFilters) => {
  return useQuery({
    queryKey: ["portal-trips", filters],
    queryFn: async () => {
      let query = supabase
        .from("trips")
        .select(`
          *,
          employee:employees(id, full_name, registration_id, position),
          vehicle:vehicles(id, brand, model, license_plate)
        `)
        .order("start_time", { ascending: false });

      if (filters.startDate) {
        query = query.gte("start_time", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("start_time", `${filters.endDate}T23:59:59`);
      }
      if (filters.employeeId) {
        query = query.eq("employee_id", filters.employeeId);
      }
      if (filters.vehicleId) {
        query = query.eq("vehicle_id", filters.vehicleId);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }
      if (filters.origin) {
        query = query.ilike("origin", `%${filters.origin}%`);
      }
      if (filters.destination) {
        query = query.ilike("destination", `%${filters.destination}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as TripWithDetails[];
    },
  });
};

export const useTripDetails = (tripId: string) => {
  return useQuery({
    queryKey: ["portal-trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select(`
          *,
          employee:employees(id, full_name, registration_id, position),
          vehicle:vehicles(id, brand, model, license_plate)
        `)
        .eq("id", tripId)
        .maybeSingle();

      if (error) throw error;
      return data as TripWithDetails | null;
    },
    enabled: !!tripId,
  });
};

export const useTripPositions = (tripId: string) => {
  return useQuery({
    queryKey: ["trip-positions", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_positions")
        .select("*")
        .eq("trip_id", tripId)
        .order("captured_at", { ascending: true });

      if (error) throw error;
      return data as TripPosition[];
    },
    enabled: !!tripId,
  });
};

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [tripsResult, employeesResult] = await Promise.all([
        supabase.from("trips").select("id, status, initial_km, final_km"),
        supabase.from("employees").select("id"),
      ]);

      if (tripsResult.error) throw tripsResult.error;
      if (employeesResult.error) throw employeesResult.error;

      const trips = tripsResult.data || [];
      const totalTrips = trips.length;
      const activeTrips = trips.filter(t => t.status === "em_andamento").length;
      const totalKm = trips.reduce((acc, t) => {
        if (t.final_km && t.initial_km) {
          return acc + (Number(t.final_km) - Number(t.initial_km));
        }
        return acc;
      }, 0);
      const totalDrivers = employeesResult.data?.length || 0;

      return {
        totalTrips,
        activeTrips,
        totalKm: Math.round(totalKm),
        totalDrivers,
      } as DashboardStats;
    },
  });
};

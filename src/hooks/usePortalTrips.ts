import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TripFilters, TripWithDetails, TripPosition, DashboardStats } from "@/types/portal";

type TripTable = "trip_point" | "trips";

// We need to reach a table that is not yet part of the generated Supabase types.
const supabaseAny = supabase as any;

const extractStartTime = (trip: any): string | null =>
  trip.start_time ?? trip.startTime ?? trip.started_at ?? trip.startedAt ?? null;

const extractEndTime = (trip: any): string | null =>
  trip.end_time ?? trip.endTime ?? trip.finished_at ?? trip.finishedAt ?? null;

const extractEmployeeId = (trip: any): string | null =>
  trip.employee_id ?? trip.employeeId ?? trip.driver_id ?? null;

const extractVehicleId = (trip: any): string | null =>
  trip.vehicle_id ?? trip.vehicleId ?? trip.car_id ?? null;

const extractOrigin = (trip: any): string | null =>
  trip.origin ?? trip.start_address ?? trip.origin_name ?? null;

const extractDestination = (trip: any): string | null =>
  trip.destination ?? trip.end_address ?? trip.destination_name ?? null;

const extractStatus = (trip: any): string | null =>
  trip.status ?? trip.trip_status ?? trip.state ?? trip.tripState ?? null;

const applyClientFilters = (trips: any[], filters: TripFilters) => {
  return trips.filter((trip) => {
    const startTime = extractStartTime(trip);
    const employeeId = extractEmployeeId(trip);
    const vehicleId = extractVehicleId(trip);
    const origin = extractOrigin(trip)?.toLowerCase();
    const destination = extractDestination(trip)?.toLowerCase();
    const status = extractStatus(trip);

    if (filters.employeeId && employeeId !== filters.employeeId) return false;
    if (filters.vehicleId && vehicleId !== filters.vehicleId) return false;
    if (filters.status && status !== filters.status) return false;

    if (filters.origin && (!origin || !origin.includes(filters.origin.toLowerCase()))) {
      return false;
    }

    if (
      filters.destination &&
      (!destination || !destination.includes(filters.destination.toLowerCase()))
    ) {
      return false;
    }

    if (filters.startDate) {
      const startBoundary = new Date(`${filters.startDate}T00:00:00`).getTime();
      const tripStart = startTime ? new Date(startTime).getTime() : NaN;
      if (!tripStart || Number.isNaN(tripStart) || tripStart < startBoundary) return false;
    }

    if (filters.endDate) {
      const endBoundary = new Date(`${filters.endDate}T23:59:59.999`).getTime();
      const tripStart = startTime ? new Date(startTime).getTime() : NaN;
      if (!tripStart || Number.isNaN(tripStart) || tripStart > endBoundary) return false;
    }

    return true;
  });
};

const fetchEmployeesByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, registration_id, position")
    .in("id", ids);

  if (error) throw error;
  return data || [];
};

const fetchVehiclesByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, brand, model, license_plate")
    .in("id", ids);

  if (error) throw error;
  return data || [];
};

const normalizeTripRecord = (
  trip: any,
  employeesMap: Map<string, any>,
  vehiclesMap: Map<string, any>
): TripWithDetails => {
  const startTime = extractStartTime(trip);
  const endTime = extractEndTime(trip);
  const employeeId = extractEmployeeId(trip);
  const vehicleId = extractVehicleId(trip);

  const initialKmRaw =
    trip.initial_km ?? trip.start_km ?? trip.initialKm ?? trip.start_odometer ?? 0;
  const finalKmRaw =
    trip.final_km ?? trip.end_km ?? trip.finalKm ?? trip.end_odometer ?? null;

  const durationSeconds =
    trip.duration_seconds ??
    trip.duration ??
    trip.total_duration ??
    (startTime && endTime
      ? Math.max(
          0,
          Math.round(
            (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
          )
        )
      : null);

  return {
    id: trip.id,
    employee_id: employeeId || "",
    vehicle_id: vehicleId ?? null,
    initial_km: Number(initialKmRaw) || 0,
    final_km: finalKmRaw !== undefined && finalKmRaw !== null ? Number(finalKmRaw) : null,
    start_time: startTime || "",
    end_time: endTime ?? null,
    start_latitude: trip.start_latitude ?? trip.start_lat ?? null,
    start_longitude: trip.start_longitude ?? trip.start_lng ?? null,
    end_latitude: trip.end_latitude ?? trip.end_lat ?? null,
    end_longitude: trip.end_longitude ?? trip.end_lng ?? null,
    origin: extractOrigin(trip),
    destination: extractDestination(trip),
    reason: trip.reason ?? null,
    notes: trip.notes ?? null,
    duration_seconds: durationSeconds,
    status: extractStatus(trip),
    is_rented_vehicle: Boolean(trip.is_rented_vehicle ?? trip.rented_vehicle ?? false),
    rented_plate: trip.rented_plate ?? trip.rentedPlate ?? null,
    rented_model: trip.rented_model ?? trip.rentedModel ?? null,
    rented_company: trip.rented_company ?? trip.rentedCompany ?? null,
    created_at: trip.created_at ?? trip.inserted_at ?? trip.createdAt ?? null,
    employee: trip.employee || (employeeId ? employeesMap.get(employeeId) : undefined),
    vehicle: trip.vehicle || (vehicleId ? vehiclesMap.get(vehicleId) : undefined),
  };
};

const fetchTripsFromTable = async (tableName: TripTable, filters: TripFilters) => {
  let trips: any[] = [];

  try {
    let query = supabaseAny.from(tableName).select("*");

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

    query = query.order("start_time", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    trips = data || [];
  } catch (error) {
    // If trip_point has a different schema, retry without server-side filters and filter locally.
    if (tableName !== "trip_point") {
      throw error;
    }

    const { data, error: fallbackError } = await supabaseAny.from(tableName).select("*");
    if (fallbackError) throw fallbackError;
    trips = data || [];
  }

  const filteredTrips = applyClientFilters(trips, filters);
  const sortedTrips = filteredTrips.sort((a, b) => {
    const timeA = extractStartTime(a);
    const timeB = extractStartTime(b);
    return (timeB ? new Date(timeB).getTime() : 0) - (timeA ? new Date(timeA).getTime() : 0);
  });

  const employeeIds = Array.from(new Set(sortedTrips.map(extractEmployeeId).filter(Boolean))) as string[];
  const vehicleIds = Array.from(new Set(sortedTrips.map(extractVehicleId).filter(Boolean))) as string[];

  const [employees, vehicles] = await Promise.all([
    fetchEmployeesByIds(employeeIds),
    fetchVehiclesByIds(vehicleIds),
  ]);

  const employeeMap = new Map(employees.map((emp) => [emp.id, emp]));
  const vehicleMap = new Map(vehicles.map((veh) => [veh.id, veh]));

  return sortedTrips.map((trip) => normalizeTripRecord(trip, employeeMap, vehicleMap));
};

const fetchTripById = async (tableName: TripTable, tripId: string) => {
  const { data, error } = await supabaseAny
    .from(tableName)
    .select("*")
    .eq("id", tripId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const employeeId = extractEmployeeId(data);
  const vehicleId = extractVehicleId(data);

  const [employeeData, vehicleData] = await Promise.all([
    employeeId ? fetchEmployeesByIds([employeeId]) : Promise.resolve([]),
    vehicleId ? fetchVehiclesByIds([vehicleId]) : Promise.resolve([]),
  ]);

  const employeeMap = new Map(employeeData.map((emp) => [emp.id, emp]));
  const vehicleMap = new Map(vehicleData.map((veh) => [veh.id, veh]));

  return normalizeTripRecord(data, employeeMap, vehicleMap);
};

const computeKmDriven = (trip: any) => {
  const initialKm = trip.initial_km ?? trip.start_km ?? trip.initialKm ?? trip.start_odometer;
  const finalKm = trip.final_km ?? trip.end_km ?? trip.finalKm ?? trip.end_odometer;

  if (finalKm !== undefined && finalKm !== null && initialKm !== undefined && initialKm !== null) {
    return Number(finalKm) - Number(initialKm);
  }

  if (trip.distance_km !== undefined && trip.distance_km !== null) {
    return Number(trip.distance_km);
  }

  if (trip.distance !== undefined && trip.distance !== null) {
    return Number(trip.distance);
  }

  return 0;
};

const fetchStatsFromTable = async (tableName: TripTable) => {
  const { data, error } = await supabaseAny.from(tableName).select("*");
  if (error) throw error;

  const trips = data || [];
  const totalTrips = trips.length;
  const activeTrips = trips.filter((trip: any) => {
    const status = extractStatus(trip)?.toLowerCase();
    return status === "em_andamento" || status === "in_progress" || status === "ongoing";
  }).length;
  const totalKm = Math.round(
    trips.reduce((acc: number, trip: any) => acc + computeKmDriven(trip), 0)
  );

  return {
    totalTrips,
    activeTrips,
    totalKm,
  };
};

export const usePortalTrips = (filters: TripFilters) => {
  return useQuery({
    queryKey: ["portal-trips", filters],
    queryFn: async () => {
      try {
        return await fetchTripsFromTable("trip_point", filters);
      } catch (err) {
        console.warn("[usePortalTrips] trip_point fetch failed, falling back to trips:", err);
        return await fetchTripsFromTable("trips", filters);
      }
    },
  });
};

export const useTripDetails = (tripId: string) => {
  return useQuery({
    queryKey: ["portal-trip", tripId],
    queryFn: async () => {
      try {
        return await fetchTripById("trip_point", tripId);
      } catch (err) {
        console.warn("[useTripDetails] trip_point fetch failed, falling back to trips:", err);
        return await fetchTripById("trips", tripId);
      }
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
      const stats = await (async () => {
        try {
          return await fetchStatsFromTable("trip_point");
        } catch (err) {
          console.warn("[useDashboardStats] trip_point fetch failed, falling back to trips:", err);
          return await fetchStatsFromTable("trips");
        }
      })();

      const employeesResult = await supabase.from("employees").select("id");
      if (employeesResult.error) throw employeesResult.error;

      return {
        ...stats,
        totalDrivers: employeesResult.data?.length || 0,
      } as DashboardStats;
    },
  });
};

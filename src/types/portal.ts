export interface TripFilters {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  vehicleId?: string;
  origin?: string;
  destination?: string;
  status?: string;
}

export interface TripWithDetails {
  id: string;
  employee_id: string;
  vehicle_id: string | null;
  initial_km: number;
  final_km: number | null;
  start_time: string;
  end_time: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  origin: string | null;
  destination: string | null;
  reason: string | null;
  notes: string | null;
  duration_seconds: number | null;
  status: string | null;
  is_rented_vehicle: boolean;
  rented_plate: string | null;
  rented_model: string | null;
  rented_company: string | null;
  created_at: string | null;
  employee?: {
    id: string;
    full_name: string;
    registration_id: string;
    position: string;
  };
  vehicle?: {
    id: string;
    brand: string;
    model: string;
    license_plate: string;
  };
}

export interface TripPosition {
  id: string;
  trip_id: string;
  latitude: number;
  longitude: number;
  captured_at: string;
}

export interface DashboardStats {
  totalTrips: number;
  activeTrips: number;
  totalKm: number;
  totalDrivers: number;
}

import { useEffect, useState } from "react";
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";

const DB_NAME = "trips_offline";

// ======= GLOBAL STATE (singleton) =======
let sqliteConnection: SQLiteConnection | null = null;
let dbConnection: SQLiteDBConnection | null = null;
let initPromise: Promise<void> | null = null;
let globalIsReady = false;
let globalHasDb = false;

const createConnectionIfNeeded = async () => {
  if (!Capacitor.isNativePlatform()) {
    globalIsReady = true;
    globalHasDb = false;
    return;
  }

  if (dbConnection && globalHasDb) {
    globalIsReady = true;
    return;
  }

  try {
    if (!sqliteConnection) {
      sqliteConnection = new SQLiteConnection(CapacitorSQLite);
    }

    const isConn = await sqliteConnection.isConnection(DB_NAME, false);
    if (isConn.result) {
      dbConnection = await sqliteConnection.retrieveConnection(DB_NAME, false);
    } else {
      dbConnection = await sqliteConnection.createConnection(
        DB_NAME,
        false,
        "no-encryption",
        1,
        false
      );
    }

    await dbConnection.open();

    // Create tables with English column names
    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS offline_trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        vehicle_id TEXT,
        initial_km REAL NOT NULL,
        final_km REAL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        start_latitude REAL,
        start_longitude REAL,
        end_latitude REAL,
        end_longitude REAL,
        duration_seconds INTEGER,
        origin TEXT,
        destination TEXT,
        reason TEXT,
        notes TEXT,
        status TEXT NOT NULL,
        employee_photo_base64 TEXT,
        trip_photos_base64 TEXT,
        is_rented_vehicle INTEGER DEFAULT 0,
        rented_plate TEXT,
        rented_model TEXT,
        rented_company TEXT,
        synced INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0,
        server_trip_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS offline_employees (
        id TEXT PRIMARY KEY,
        registration_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        position TEXT NOT NULL
      );
    `);

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS offline_vehicles (
        id TEXT PRIMARY KEY,
        license_plate TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL
      );
    `);

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS offline_trip_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_trip_id INTEGER,
        server_trip_id TEXT,
        captured_at TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        synced INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    globalIsReady = true;
    globalHasDb = true;
  } catch (error) {
    console.error("[useSQLite] Error creating connection/tables:", error);
    globalIsReady = false;
    globalHasDb = false;
  }
};

const ensureInit = async () => {
  if (!initPromise) {
    initPromise = createConnectionIfNeeded();
  }
  await initPromise;
};

// ======= TYPES =======
export interface OfflineTrip {
  id?: number;
  employee_id: string;
  vehicle_id?: string | null;
  initial_km: number;
  final_km?: number | null;
  start_time: string;
  end_time?: string | null;
  start_latitude?: number;
  start_longitude?: number;
  end_latitude?: number;
  end_longitude?: number;
  duration_seconds?: number | null;
  origin?: string | null;
  destination?: string | null;
  reason?: string | null;
  notes?: string | null;
  status: string;
  employee_photo_base64?: string;
  trip_photos_base64?: string;
  is_rented_vehicle?: number;
  rented_plate?: string | null;
  rented_model?: string | null;
  rented_company?: string | null;
  synced?: number;
  deleted?: number;
  server_trip_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OfflineEmployee {
  id: string;
  registration_id: string;
  full_name: string;
  position: string;
}

export interface OfflineVehicle {
  id: string;
  license_plate: string;
  brand: string;
  model: string;
}

export interface OfflineTripPosition {
  id?: number;
  local_trip_id?: number;
  server_trip_id?: string;
  captured_at: string;
  latitude: number;
  longitude: number;
  synced?: number;
  deleted?: number;
  created_at?: string;
}

// ======= HOOK =======
export const useSQLite = () => {
  const [isReady, setIsReady] = useState(globalIsReady);
  const [hasDb, setHasDb] = useState(globalHasDb);

  useEffect(() => {
    let canceled = false;

    const init = async () => {
      await ensureInit();
      if (!canceled) {
        setIsReady(globalIsReady);
        setHasDb(globalHasDb);
      }
    };

    init();

    return () => {
      canceled = true;
    };
  }, []);

  const requireDb = (fnName: string): SQLiteDBConnection | null => {
    if (!Capacitor.isNativePlatform()) {
      console.warn(`[useSQLite] ${fnName} called on web platform (no native SQLite)`);
      return null;
    }

    if (!dbConnection || !globalHasDb) {
      console.error(`[useSQLite] DB not initialized in ${fnName} (hasDb=${globalHasDb})`);
      return null;
    }

    return dbConnection;
  };

  // ===== TRIPS =====
  const saveTrip = async (trip: OfflineTrip): Promise<number | null> => {
    const db = requireDb("saveTrip");
    if (!db) return null;

    try {
      const query = `
        INSERT INTO offline_trips (
          employee_id, vehicle_id, initial_km, final_km,
          start_time, end_time,
          start_latitude, start_longitude,
          end_latitude, end_longitude,
          duration_seconds,
          origin, destination, reason, notes, status,
          employee_photo_base64, trip_photos_base64,
          is_rented_vehicle, rented_plate, rented_model, rented_company,
          synced, deleted, server_trip_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      const values = [
        trip.employee_id,
        trip.vehicle_id ?? null,
        trip.initial_km,
        trip.final_km ?? null,
        trip.start_time,
        trip.end_time ?? null,
        trip.start_latitude ?? null,
        trip.start_longitude ?? null,
        trip.end_latitude ?? null,
        trip.end_longitude ?? null,
        trip.duration_seconds ?? null,
        trip.origin ?? null,
        trip.destination ?? null,
        trip.reason ?? null,
        trip.notes ?? null,
        trip.status,
        trip.employee_photo_base64 ?? null,
        trip.trip_photos_base64 ?? null,
        trip.is_rented_vehicle ?? 0,
        trip.rented_plate ?? null,
        trip.rented_model ?? null,
        trip.rented_company ?? null,
        trip.synced ?? 0,
        trip.deleted ?? 0,
        trip.server_trip_id ?? null,
      ];

      const result = await db.run(query, values);
      const insertedId = result.changes?.lastId;
      
      if (trip.server_trip_id) {
        console.log(`[useSQLite] ✅ Trip saved with server mirror - Local ID: ${insertedId}, Server ID: ${trip.server_trip_id}`);
      } else {
        console.log("[useSQLite] Trip saved in SQLite with local ID:", insertedId);
      }
      
      return insertedId ?? null;
    } catch (error) {
      console.error("[useSQLite] Error saving trip:", error);
      return null;
    }
  };

  const updateTripOnEnd = async (
    localTripId: number,
    updates: Partial<OfflineTrip>
  ): Promise<boolean> => {
    const db = requireDb("updateTripOnEnd");
    if (!db) return false;

    try {
      const query = `
        UPDATE offline_trips SET
          final_km = ?,
          end_time = ?,
          end_latitude = ?,
          end_longitude = ?,
          duration_seconds = ?,
          origin = ?,
          destination = ?,
          reason = ?,
          notes = ?,
          status = 'finalizada',
          employee_photo_base64 = ?,
          trip_photos_base64 = ?,
          updated_at = datetime('now')
        WHERE id = ?;
      `;

      const values = [
        updates.final_km ?? null,
        updates.end_time ?? null,
        updates.end_latitude ?? null,
        updates.end_longitude ?? null,
        updates.duration_seconds ?? null,
        updates.origin ?? null,
        updates.destination ?? null,
        updates.reason ?? null,
        updates.notes ?? null,
        updates.employee_photo_base64 ?? null,
        updates.trip_photos_base64 ?? null,
        localTripId,
      ];

      await db.run(query, values);
      console.log("[useSQLite] ✅ Trip finalized in SQLite (status=finalizada):", localTripId);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error updating trip:", error);
      return false;
    }
  };

  const getUnsyncedTrips = async (): Promise<OfflineTrip[]> => {
    const db = requireDb("getUnsyncedTrips");
    if (!db) return [];

    try {
      const result = await db.query(
        "SELECT * FROM offline_trips WHERE synced = 0 AND deleted = 0;"
      );
      return (result.values || []) as OfflineTrip[];
    } catch (error) {
      console.error("[useSQLite] Error fetching unsynced trips:", error);
      return [];
    }
  };

  const getAllTrips = async (): Promise<OfflineTrip[]> => {
    const db = requireDb("getAllTrips");
    if (!db) return [];

    try {
      const result = await db.query(
        "SELECT * FROM offline_trips WHERE deleted = 0 ORDER BY start_time DESC;"
      );
      return (result.values || []) as OfflineTrip[];
    } catch (error) {
      console.error("[useSQLite] Error fetching trips:", error);
      return [];
    }
  };

  const getOngoingTrip = async (): Promise<OfflineTrip | null> => {
    const db = requireDb("getOngoingTrip");
    if (!db) return null;

    try {
      const result = await db.query(
        `SELECT * FROM offline_trips 
         WHERE status = 'em_andamento' 
         AND deleted = 0 
         AND end_time IS NULL
         ORDER BY start_time DESC 
         LIMIT 1;`
      );
      const trips = (result.values || []) as OfflineTrip[];
      const found = trips.length > 0 ? trips[0] : null;
      
      console.log("[useSQLite] Search for ongoing trip:", found ? `ID ${found.id}` : "none");
      return found;
    } catch (error) {
      console.error("[useSQLite] Error fetching ongoing trip:", error);
      return null;
    }
  };

  const markTripAsSynced = async (id: number): Promise<boolean> => {
    const db = requireDb("markTripAsSynced");
    if (!db) return false;

    try {
      await db.run("UPDATE offline_trips SET synced = 1 WHERE id = ?;", [id]);
      console.log("[useSQLite] Trip marked as synced:", id);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error marking trip as synced:", error);
      return false;
    }
  };

  const deleteTrip = async (id: number): Promise<boolean> => {
    const db = requireDb("deleteTrip");
    if (!db) return false;

    try {
      await db.run("DELETE FROM offline_trips WHERE id = ?;", [id]);
      console.log("[useSQLite] Trip deleted:", id);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error deleting trip:", error);
      return false;
    }
  };

  const replaceSyncedTripsFromServer = async (
    tripsFromServer: any[]
  ): Promise<boolean> => {
    const db = requireDb("replaceSyncedTripsFromServer");
    if (!db) return false;

    try {
      await db.execute("BEGIN TRANSACTION;");

      if (!tripsFromServer.length) {
        await db.execute("DELETE FROM offline_trips WHERE synced = 1;");
        await db.execute("COMMIT;");
        console.log("[useSQLite] No trips from server - removed all synced=1");
        return true;
      }

      const serverTripIds = tripsFromServer
        .map(t => t.id)
        .filter(id => id)
        .map(id => `'${id}'`)
        .join(',');

      if (serverTripIds) {
        await db.execute(`
          DELETE FROM offline_trips 
          WHERE synced = 1 
          OR (server_trip_id IS NOT NULL AND server_trip_id NOT IN (${serverTripIds}));
        `);
        console.log("[useSQLite] Removed synced trips not present on server");
      } else {
        await db.execute("DELETE FROM offline_trips WHERE synced = 1;");
      }

      for (const t of tripsFromServer) {
        const statusFromServer = t.status;
        
        console.log(`[useSQLite] Saving trip ${t.id} from server with status: ${statusFromServer}`);

        await db.run(
          `
          INSERT INTO offline_trips (
            server_trip_id, employee_id, vehicle_id, initial_km, final_km,
            start_time, end_time,
            start_latitude, start_longitude,
            end_latitude, end_longitude,
            duration_seconds,
            origin, destination, reason, notes, status,
            employee_photo_base64, trip_photos_base64,
            is_rented_vehicle, rented_plate, rented_model, rented_company,
            synced, deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
          [
            t.id,
            t.employee_id,
            t.vehicle_id ?? null,
            t.initial_km,
            t.final_km ?? null,
            t.start_time,
            t.end_time ?? null,
            t.start_latitude ?? null,
            t.start_longitude ?? null,
            t.end_latitude ?? null,
            t.end_longitude ?? null,
            t.duration_seconds ?? null,
            t.origin ?? null,
            t.destination ?? null,
            t.reason ?? null,
            t.notes ?? null,
            statusFromServer,
            null,
            null,
            t.is_rented_vehicle ? 1 : 0,
            t.rented_plate ?? null,
            t.rented_model ?? null,
            t.rented_company ?? null,
            1,
            0,
          ]
        );
      }

      await db.execute("COMMIT;");
      console.log(`[useSQLite] ✅ ${tripsFromServer.length} trips from server saved/updated (synced=1)`);
      return true;
    } catch (error) {
      console.error("[useSQLite] ❌ Error saving server trips to SQLite:", error);
      try {
        await db.execute("ROLLBACK;");
      } catch {}
      return false;
    }
  };

  // ===== EMPLOYEES =====
  const saveEmployees = async (employees: OfflineEmployee[]): Promise<boolean> => {
    const db = requireDb("saveEmployees");
    if (!db) return false;

    try {
      await db.execute("DELETE FROM offline_employees;");

      if (!employees.length) {
        console.log("[useSQLite] No employees to save (empty list)");
        return true;
      }

      await db.execute("BEGIN TRANSACTION;");
      for (const employee of employees) {
        await db.run(
          "INSERT INTO offline_employees (id, registration_id, full_name, position) VALUES (?, ?, ?, ?);",
          [employee.id, employee.registration_id, employee.full_name, employee.position]
        );
      }
      await db.execute("COMMIT;");

      console.log(`[useSQLite] ${employees.length} employees saved to SQLite`);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error saving employees:", error);
      try {
        await db.execute("ROLLBACK;");
      } catch {}
      return false;
    }
  };

  const getEmployees = async (): Promise<OfflineEmployee[]> => {
    const db = requireDb("getEmployees");
    if (!db) return [];

    try {
      const result = await db.query("SELECT * FROM offline_employees;");
      return (result.values || []) as OfflineEmployee[];
    } catch (error) {
      console.error("[useSQLite] Error fetching employees:", error);
      return [];
    }
  };

  // ===== VEHICLES =====
  const saveVehicles = async (vehicles: OfflineVehicle[]): Promise<boolean> => {
    const db = requireDb("saveVehicles");
    if (!db) return false;

    try {
      await db.execute("DELETE FROM offline_vehicles;");

      if (!vehicles.length) {
        console.log("[useSQLite] No vehicles to save (empty list)");
        return true;
      }

      await db.execute("BEGIN TRANSACTION;");
      for (const vehicle of vehicles) {
        await db.run(
          "INSERT INTO offline_vehicles (id, license_plate, brand, model) VALUES (?, ?, ?, ?);",
          [vehicle.id, vehicle.license_plate, vehicle.brand, vehicle.model]
        );
      }
      await db.execute("COMMIT;");

      console.log(`[useSQLite] ${vehicles.length} vehicles saved to SQLite`);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error saving vehicles:", error);
      try {
        await db.execute("ROLLBACK;");
      } catch {}
      return false;
    }
  };

  const getVehicles = async (): Promise<OfflineVehicle[]> => {
    const db = requireDb("getVehicles");
    if (!db) return [];

    try {
      const result = await db.query("SELECT * FROM offline_vehicles;");
      return (result.values || []) as OfflineVehicle[];
    } catch (error) {
      console.error("[useSQLite] Error fetching vehicles:", error);
      return [];
    }
  };

  // ===== TRIP POSITIONS =====
  const saveTripPosition = async (position: OfflineTripPosition): Promise<boolean> => {
    const db = requireDb("saveTripPosition");
    if (!db) return false;

    try {
      const query = `
        INSERT INTO offline_trip_positions (
          local_trip_id, server_trip_id, captured_at, latitude, longitude, synced, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?);
      `;

      const values = [
        position.local_trip_id ?? null,
        position.server_trip_id ?? null,
        position.captured_at,
        position.latitude,
        position.longitude,
        position.synced ?? 0,
        position.deleted ?? 0,
      ];

      await db.run(query, values);
      console.log("[useSQLite] TripPosition saved to SQLite");
      return true;
    } catch (error) {
      console.error("[useSQLite] Error saving trip position:", error);
      return false;
    }
  };

  const getUnsyncedTripPositions = async (): Promise<OfflineTripPosition[]> => {
    const db = requireDb("getUnsyncedTripPositions");
    if (!db) return [];

    try {
      const result = await db.query(
        "SELECT * FROM offline_trip_positions WHERE synced = 0 AND deleted = 0;"
      );
      return (result.values || []) as OfflineTripPosition[];
    } catch (error) {
      console.error("[useSQLite] Error fetching unsynced trip positions:", error);
      return [];
    }
  };

  const getTripPositionsByLocalTripId = async (localTripId: number): Promise<OfflineTripPosition[]> => {
    const db = requireDb("getTripPositionsByLocalTripId");
    if (!db) return [];

    try {
      const result = await db.query(
        "SELECT * FROM offline_trip_positions WHERE local_trip_id = ? AND deleted = 0 ORDER BY captured_at;",
        [localTripId]
      );
      return (result.values || []) as OfflineTripPosition[];
    } catch (error) {
      console.error("[useSQLite] Error fetching trip positions by local_trip_id:", error);
      return [];
    }
  };

  const markTripPositionAsSynced = async (id: number): Promise<boolean> => {
    const db = requireDb("markTripPositionAsSynced");
    if (!db) return false;

    try {
      await db.run("UPDATE offline_trip_positions SET synced = 1 WHERE id = ?;", [id]);
      console.log("[useSQLite] TripPosition marked as synced:", id);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error marking trip position as synced:", error);
      return false;
    }
  };

  const updateTripPositionsServerTripId = async (
    localTripId: number,
    serverTripId: string
  ): Promise<boolean> => {
    const db = requireDb("updateTripPositionsServerTripId");
    if (!db) return false;

    try {
      await db.run(
        "UPDATE offline_trip_positions SET server_trip_id = ? WHERE local_trip_id = ?;",
        [serverTripId, localTripId]
      );
      console.log(`[useSQLite] Trip positions updated with server_trip_id: ${serverTripId}`);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error updating server_trip_id:", error);
      return false;
    }
  };

  const deleteTripPositionsByLocalTripId = async (localTripId: number): Promise<boolean> => {
    const db = requireDb("deleteTripPositionsByLocalTripId");
    if (!db) return false;

    try {
      await db.run("DELETE FROM offline_trip_positions WHERE local_trip_id = ?;", [localTripId]);
      console.log("[useSQLite] Trip positions deleted for local_trip_id:", localTripId);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error deleting trip positions:", error);
      return false;
    }
  };

  return {
    isReady,
    hasDb,
    saveTrip,
    updateTripOnEnd,
    getUnsyncedTrips,
    getAllTrips,
    getOngoingTrip,
    markTripAsSynced,
    deleteTrip,
    replaceSyncedTripsFromServer,
    saveEmployees,
    getEmployees,
    saveVehicles,
    getVehicles,
    saveTripPosition,
    getUnsyncedTripPositions,
    getTripPositionsByLocalTripId,
    markTripPositionAsSynced,
    updateTripPositionsServerTripId,
    deleteTripPositionsByLocalTripId,
  };
};

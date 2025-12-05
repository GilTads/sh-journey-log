import { useEffect, useState } from "react";
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";
import { logErrorToFile } from "@/lib/logger";

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
        local_id TEXT PRIMARY KEY, -- UUID estável
        server_trip_id TEXT,
        employee_id TEXT NOT NULL,
        vehicle_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('created','in_progress','finalized')),
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
        employee_photo_base64 TEXT,
        trip_photos_base64 TEXT,
        is_rented_vehicle INTEGER DEFAULT 0,
        rented_plate TEXT,
        rented_model TEXT,
        rented_company TEXT,
        device_id TEXT,
        needs_sync INTEGER DEFAULT 1,
        deleted INTEGER DEFAULT 0,
        last_updated TEXT DEFAULT (datetime('now'))
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
        local_trip_id TEXT NOT NULL, -- referencia trips.local_id
        server_trip_id TEXT,
        captured_at TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        speed REAL,
        accuracy REAL,
        device_id TEXT,
        needs_sync INTEGER DEFAULT 1,
        deleted INTEGER DEFAULT 0,
        last_updated TEXT DEFAULT (datetime('now')),
        UNIQUE(local_trip_id, captured_at)
      );
    `);

    // Add missing columns for backward compatibility (best effort)
    try { await dbConnection.execute("ALTER TABLE offline_trips ADD COLUMN local_id TEXT;"); } catch {}
    try { await dbConnection.execute("ALTER TABLE offline_trips ADD COLUMN needs_sync INTEGER DEFAULT 1;"); } catch {}
    try { await dbConnection.execute("ALTER TABLE offline_trips ADD COLUMN last_updated TEXT DEFAULT (datetime('now'));"); } catch {}
    try { await dbConnection.execute("ALTER TABLE offline_trip_positions ADD COLUMN speed REAL;"); } catch {}
    try { await dbConnection.execute("ALTER TABLE offline_trip_positions ADD COLUMN accuracy REAL;"); } catch {}
    try { await dbConnection.execute("ALTER TABLE offline_trip_positions ADD COLUMN needs_sync INTEGER DEFAULT 1;"); } catch {}
    try { await dbConnection.execute("ALTER TABLE offline_trip_positions ADD COLUMN last_updated TEXT DEFAULT (datetime('now'));"); } catch {}

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
  local_id: string; // UUID estável
  server_trip_id?: string | null;
  employee_id: string;
  vehicle_id?: string | null;
  status: "created" | "in_progress" | "finalized";
  initial_km: number;
  final_km?: number | null;
  start_time: string;
  end_time?: string | null;
  start_latitude?: number | null;
  start_longitude?: number | null;
  end_latitude?: number | null;
  end_longitude?: number | null;
  duration_seconds?: number | null;
  origin?: string | null;
  destination?: string | null;
  reason?: string | null;
  notes?: string | null;
  employee_photo_base64?: string | null;
  trip_photos_base64?: string | null;
  is_rented_vehicle?: number;
  rented_plate?: string | null;
  rented_model?: string | null;
  rented_company?: string | null;
  device_id?: string | null;
  needs_sync?: number;
  deleted?: number;
  last_updated?: string;
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
  local_trip_id: string; // referencia trips.local_id
  server_trip_id?: string | null;
  captured_at: string;
  latitude: number;
  longitude: number;
  speed?: number | null;
  accuracy?: number | null;
  device_id?: string | null;
  needs_sync?: number;
  deleted?: number;
  last_updated?: string;
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
  const saveTrip = async (trip: OfflineTrip): Promise<string | null> => {
    let db = requireDb("saveTrip");
    if (!db) {
      await ensureInit();
      db = requireDb("saveTrip");
      if (!db) return null;
    }

    if (!trip.device_id) {
      console.warn("[useSQLite] Trip sem device_id registrado, abortando saveTrip");
      return null;
    }

    try {
      // Evita duplicar viagem em andamento para o mesmo device (id vindo do Supabase.devices)
      const existing = await db.query(
        `SELECT local_id FROM offline_trips 
         WHERE status = 'in_progress' 
         AND deleted = 0 
         AND end_time IS NULL 
         AND device_id = ?
         LIMIT 1;`,
        [trip.device_id]
      );
      const found = (existing.values || [])[0] as { local_id: string } | undefined;
      if (found?.local_id) {
        console.warn("[useSQLite] Reutilizando viagem em andamento para device:", trip.device_id, "local_id:", found.local_id);
        return found.local_id;
      }

      const query = `
        INSERT INTO offline_trips (
          local_id, server_trip_id,
          employee_id, vehicle_id, status,
          initial_km, final_km,
          start_time, end_time,
          start_latitude, start_longitude,
          end_latitude, end_longitude,
          duration_seconds,
          origin, destination, reason, notes,
          employee_photo_base64, trip_photos_base64,
          is_rented_vehicle, rented_plate, rented_model, rented_company,
          device_id,
          needs_sync, deleted, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      const values = [
        trip.local_id,
        trip.server_trip_id ?? null,
        trip.employee_id,
        trip.vehicle_id ?? null,
        trip.status,
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
        trip.employee_photo_base64 ?? null,
        trip.trip_photos_base64 ?? null,
        trip.is_rented_vehicle ?? 0,
        trip.rented_plate ?? null,
        trip.rented_model ?? null,
        trip.rented_company ?? null,
        trip.device_id,
        trip.needs_sync ?? 1,
        trip.deleted ?? 0,
        trip.last_updated ?? new Date().toISOString(),
      ];

      await db.run(query, values);
      console.log("[useSQLite] Trip saved in SQLite with local_id:", trip.local_id, "server:", trip.server_trip_id);
      return trip.local_id;
    } catch (error) {
      console.error("[useSQLite] Error saving trip:", error);
      logErrorToFile("useSQLite/saveTrip", error);
      return null;
    }
  };

  const updateTripOnEnd = async (
    localTripId: string,
    updates: Partial<OfflineTrip>
  ): Promise<boolean> => {
    let db = requireDb("updateTripOnEnd");
    if (!db) {
      await ensureInit();
      db = requireDb("updateTripOnEnd");
      if (!db) return false;
    }

    try {
      // Mantém o espelho local alinhado com o servidor usando status fornecido (default finalizado).
      const statusValue = updates.status ?? "finalized";
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
          status = ?,
          employee_photo_base64 = ?,
          trip_photos_base64 = ?,
          device_id = COALESCE(device_id, ?),
          needs_sync = ?,
          server_trip_id = COALESCE(?, server_trip_id),
          last_updated = datetime('now')
        WHERE local_id = ?;
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
        statusValue,
        updates.employee_photo_base64 ?? null,
        updates.trip_photos_base64 ?? null,
        updates.device_id ?? null,
        // Se estamos offline, garante needs_sync=1; se online já veio setado
        updates.needs_sync ?? 1,
        updates.server_trip_id ?? null,
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
      // Também captura viagens que por algum motivo ficaram sem server_trip_id
      // mesmo com needs_sync zerado, para reempurrar ao servidor.
      const result = await db.query(
        "SELECT * FROM offline_trips WHERE (needs_sync = 1 OR server_trip_id IS NULL) AND deleted = 0;"
      );
      return (result.values || []) as OfflineTrip[];
    } catch (error) {
      console.error("[useSQLite] Error fetching unsynced trips:", error);
      return [];
    }
  };

  const updateTripPhotos = async (
    localTripId: string,
    photosBase64Json: string | null
  ): Promise<boolean> => {
    const db = requireDb("updateTripPhotos");
    if (!db) return false;

    try {
      // Atualiza somente o campo de fotos base64 para preservar imagens capturadas offline.
      await db.run(
        `
        UPDATE offline_trips
        SET trip_photos_base64 = ?, last_updated = datetime('now'), needs_sync = 1
        WHERE local_id = ?;
        `,
        [photosBase64Json, localTripId]
      );
      console.log("[useSQLite] Fotos da viagem atualizadas (base64) para ID local:", localTripId);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error updating trip photos:", error);
      return false;
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

  const getOngoingTrip = async (deviceId?: string): Promise<OfflineTrip | null> => {
    const db = requireDb("getOngoingTrip");
    if (!db) return null;
    if (!deviceId) {
      console.warn("[useSQLite] getOngoingTrip chamado sem deviceId registrado");
      return null;
    }

    try {
      const sql = `SELECT * FROM offline_trips 
           WHERE status = 'in_progress' 
           AND deleted = 0 
           AND end_time IS NULL
           AND device_id = ?
           ORDER BY start_time DESC 
           LIMIT 1;`;

      const result = await db.query(sql, [deviceId]);
      const trips = (result.values || []) as OfflineTrip[];
      const found = trips.length > 0 ? trips[0] : null;
      
      console.log("[useSQLite] Search for ongoing trip:", found ? `ID ${found.id}` : "none");
      return found;
    } catch (error) {
      console.error("[useSQLite] Error fetching ongoing trip:", error);
      return null;
    }
  };

  const markTripAsSynced = async (localId: string): Promise<boolean> => {
    const db = requireDb("markTripAsSynced");
    if (!db) return false;

    try {
      await db.run("UPDATE offline_trips SET needs_sync = 0 WHERE local_id = ?;", [localId]);
      console.log("[useSQLite] Trip marked as synced:", localId);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error marking trip as synced:", error);
      return false;
    }
  };

  const deleteTrip = async (localId: string): Promise<boolean> => {
    const db = requireDb("deleteTrip");
    if (!db) return false;

    try {
      await db.run("DELETE FROM offline_trips WHERE local_id = ?;", [localId]);
      console.log("[useSQLite] Trip deleted:", localId);
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
      for (const t of tripsFromServer) {
        const statusFromServer = (t.status || "").toLowerCase();
        const normalizedStatus = statusFromServer === "in_progress" || statusFromServer === "em_andamento"
          ? "in_progress"
          : statusFromServer === "finalized" || statusFromServer === "finalizada"
          ? "finalized"
          : "created";

        const localId = t.local_id;

        // Verifica se já existe um espelho local com o mesmo local_id
        const existing = await db.query(
          "SELECT * FROM offline_trips WHERE local_id = ? LIMIT 1;",
          [localId]
        );
        const local = (existing.values || [])[0] as OfflineTrip | undefined;

        // Resolve qual versão manter (last_updated maior vence, preservando finalização local mais recente)
        const localUpdatedAt = local?.last_updated ? new Date(local.last_updated).getTime() : 0;
        const serverUpdatedAt = t.last_updated ? new Date(t.last_updated).getTime() : 0;
        const preferLocal = local && localUpdatedAt > serverUpdatedAt;

        const merged = preferLocal
          ? { ...t, ...local, status: local.status, end_time: local.end_time, final_km: local.final_km }
          : {
              ...local,
              ...t,
              status: normalizedStatus,
              last_updated: t.last_updated ?? new Date().toISOString(),
            };

        await db.run(
          `
          INSERT INTO offline_trips (
            local_id, server_trip_id, employee_id, vehicle_id, status,
            initial_km, final_km,
            start_time, end_time,
            start_latitude, start_longitude,
            end_latitude, end_longitude,
            duration_seconds,
            origin, destination, reason, notes,
          employee_photo_base64, trip_photos_base64,
          is_rented_vehicle, rented_plate, rented_model, rented_company,
          device_id,
          needs_sync, deleted, last_updated
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
          ON CONFLICT(local_id) DO UPDATE SET
            server_trip_id=excluded.server_trip_id,
            employee_id=excluded.employee_id,
            vehicle_id=excluded.vehicle_id,
            status=excluded.status,
            initial_km=excluded.initial_km,
            final_km=excluded.final_km,
            start_time=excluded.start_time,
            end_time=excluded.end_time,
            start_latitude=excluded.start_latitude,
            start_longitude=excluded.start_longitude,
            end_latitude=excluded.end_latitude,
            end_longitude=excluded.end_longitude,
            duration_seconds=excluded.duration_seconds,
            origin=excluded.origin,
            destination=excluded.destination,
            reason=excluded.reason,
            notes=excluded.notes,
            is_rented_vehicle=excluded.is_rented_vehicle,
            rented_plate=excluded.rented_plate,
            rented_model=excluded.rented_model,
            rented_company=excluded.rented_company,
            device_id=excluded.device_id,
            needs_sync=0,
            deleted=0,
            last_updated=excluded.last_updated;
        `,
          [
            localId,
            merged.server_trip_id ?? t.id,
            merged.employee_id,
            merged.vehicle_id ?? null,
            merged.status,
            merged.initial_km,
            merged.final_km ?? null,
            merged.start_time,
            merged.end_time ?? null,
            merged.start_latitude ?? null,
            merged.start_longitude ?? null,
            merged.end_latitude ?? null,
            merged.end_longitude ?? null,
            merged.duration_seconds ?? null,
            merged.origin ?? null,
            merged.destination ?? null,
            merged.reason ?? null,
            merged.notes ?? null,
            null, // não armazenamos base64 vinda do servidor
            null,
            merged.is_rented_vehicle ? 1 : 0,
            merged.rented_plate ?? null,
            merged.rented_model ?? null,
            merged.rented_company ?? null,
            (merged as any).device_id ?? null,
            0,
            0,
            merged.last_updated ?? new Date().toISOString(),
          ]
        );
      }

      console.log(`[useSQLite] ✅ ${tripsFromServer.length} trips from server saved/updated (mirror)`);
      return true;
    } catch (error) {
      console.error("[useSQLite] ❌ Error saving server trips to SQLite:", error);
      return false;
    }
  };

  // ===== EMPLOYEES =====
  const saveEmployees = async (employees: OfflineEmployee[]): Promise<boolean> => {
    const db = requireDb("saveEmployees");
    if (!db) return false;

    try {
      await db.execute("BEGIN;");
      await db.execute("DELETE FROM offline_employees;");

      if (!employees.length) {
        console.log("[useSQLite] No employees to save (empty list)");
        await db.execute("COMMIT;");
        return true;
      }

      for (const employee of employees) {
        // Usa OR REPLACE para evitar falha por duplicados no payload recebido
        await db.run(
          "INSERT OR REPLACE INTO offline_employees (id, registration_id, full_name, position) VALUES (?, ?, ?, ?);",
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
      await db.execute("BEGIN;");
      await db.execute("DELETE FROM offline_vehicles;");

      if (!vehicles.length) {
        console.log("[useSQLite] No vehicles to save (empty list)");
        await db.execute("COMMIT;");
        return true;
      }

      for (const vehicle of vehicles) {
        // Usa OR REPLACE para evitar falha por duplicados no payload recebido
        await db.run(
          "INSERT OR REPLACE INTO offline_vehicles (id, license_plate, brand, model) VALUES (?, ?, ?, ?);",
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
    let db = requireDb("saveTripPosition");
    if (!db) {
      await ensureInit();
      db = requireDb("saveTripPosition");
      if (!db) return false;
    }

    if (!position.device_id) {
      console.warn("[useSQLite] TripPosition sem device_id registrado, abortando saveTripPosition");
      return false;
    }

    try {
      const query = `
        INSERT INTO offline_trip_positions (
          local_trip_id, server_trip_id, captured_at, latitude, longitude, speed, accuracy, device_id, needs_sync, deleted, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(local_trip_id, captured_at) DO UPDATE SET
          server_trip_id=excluded.server_trip_id,
          speed=excluded.speed,
          accuracy=excluded.accuracy,
          device_id=excluded.device_id,
          needs_sync=excluded.needs_sync,
          deleted=excluded.deleted,
          last_updated=excluded.last_updated;
      `;

      const values = [
        position.local_trip_id ?? null,
        position.server_trip_id ?? null,
        position.captured_at,
        position.latitude,
        position.longitude,
        position.speed ?? null,
        position.accuracy ?? null,
        position.device_id,
        position.needs_sync ?? 1,
        position.deleted ?? 0,
        position.last_updated ?? new Date().toISOString(),
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
        "SELECT * FROM offline_trip_positions WHERE needs_sync = 1 AND deleted = 0;"
      );
      return (result.values || []) as OfflineTripPosition[];
    } catch (error) {
      console.error("[useSQLite] Error fetching unsynced trip positions:", error);
      return [];
    }
  };

  const getTripPositionsByLocalTripId = async (localTripId: string): Promise<OfflineTripPosition[]> => {
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

  // ===== DEBUG =====
  const dumpOfflineTrips = async (tag = "dump"): Promise<OfflineTrip[]> => {
    const db = requireDb("dumpOfflineTrips");
    if (!db) return [];

    try {
      const result = await db.query("SELECT * FROM offline_trips ORDER BY start_time DESC;");
      const trips = (result.values || []) as OfflineTrip[];
      console.log(`[useSQLite][${tag}] offline_trips ->`, JSON.stringify(trips, null, 2));
      return trips;
    } catch (error) {
      console.error(`[useSQLite][${tag}] Error dumping trips:`, error);
      return [];
    }
  };

  const markTripPositionAsSynced = async (id: number): Promise<boolean> => {
    const db = requireDb("markTripPositionAsSynced");
    if (!db) return false;

    try {
      await db.run("UPDATE offline_trip_positions SET needs_sync = 0 WHERE id = ?;", [id]);
      console.log("[useSQLite] TripPosition marked as synced:", id);
      return true;
    } catch (error) {
      console.error("[useSQLite] Error marking trip position as synced:", error);
      return false;
    }
  };

  const updateTripPositionsServerTripId = async (
    localTripId: string,
    serverTripId: string
  ): Promise<boolean> => {
    const db = requireDb("updateTripPositionsServerTripId");
    if (!db) return false;

    try {
      await db.run(
        "UPDATE offline_trip_positions SET server_trip_id = ?, needs_sync = 0 WHERE local_trip_id = ?;",
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
    updateTripPhotos,
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
    dumpOfflineTrips,
  };
};

import { useEffect, useState } from "react";
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";

const DB_NAME = "trips_offline";

// ======= ESTADO GLOBAL (singleton) =======
let sqliteConnection: SQLiteConnection | null = null;
let dbConnection: SQLiteDBConnection | null = null;
let initPromise: Promise<void> | null = null;
let globalIsReady = false;
let globalHasDb = false;

const createConnectionIfNeeded = async () => {
  if (!Capacitor.isNativePlatform()) {
    // Web: não tem SQLite nativo
    globalIsReady = true;
    globalHasDb = false;
    return;
  }

  if (dbConnection && globalHasDb) {
    // Já existe conexão aberta
    globalIsReady = true;
    return;
  }

  try {
    if (!sqliteConnection) {
      sqliteConnection = new SQLiteConnection(CapacitorSQLite);
    }

    // Se já existir uma connection com esse nome, reusa
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

    // Cria tabelas
    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS offline_trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        vehicle_id TEXT NOT NULL,
        km_inicial REAL NOT NULL,
        km_final REAL NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        start_latitude REAL,
        start_longitude REAL,
        end_latitude REAL,
        end_longitude REAL,
        duration_seconds INTEGER NOT NULL,
        origem TEXT,
        destino TEXT,
        motivo TEXT,
        observacao TEXT,
        status TEXT NOT NULL,
        employee_photo_base64 TEXT,
        trip_photos_base64 TEXT,
        synced INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS offline_employees (
        id TEXT PRIMARY KEY,
        matricula TEXT NOT NULL,
        nome_completo TEXT NOT NULL,
        cargo TEXT NOT NULL
      );
    `);

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS offline_vehicles (
        id TEXT PRIMARY KEY,
        placa TEXT NOT NULL,
        marca TEXT NOT NULL,
        modelo TEXT NOT NULL
      );
    `);

    globalIsReady = true;
    globalHasDb = true;
  } catch (error) {
    console.error("[useSQLite] Erro ao criar conexão/tabelas:", error);
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

// ======= TIPOS =======
export interface OfflineTrip {
  id?: number;
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
  origem?: string | null;
  destino?: string | null;
  motivo?: string | null;
  observacao?: string | null;
  status: string;
  employee_photo_base64?: string;
  trip_photos_base64?: string;
  synced?: number; // 0 = not synced, 1 = synced
  deleted?: number; // 0 = not deleted, 1 = deleted (soft delete)
  created_at?: string;
  updated_at?: string;
}

export interface OfflineEmployee {
  id: string;
  matricula: string;
  nome_completo: string;
  cargo: string;
}

export interface OfflineVehicle {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
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
      console.warn(
        `[useSQLite] ${fnName} chamado em plataforma web (sem SQLite nativo)`
      );
      return null;
    }

    if (!dbConnection || !globalHasDb) {
      console.error(
        `[useSQLite] DB não inicializado em ${fnName} (hasDb=${globalHasDb})`
      );
      return null;
    }

    return dbConnection;
  };

  // ===== TRIPS =====
  const saveTrip = async (trip: OfflineTrip): Promise<boolean> => {
    const db = requireDb("saveTrip");
    if (!db) return false;

    try {
      const query = `
        INSERT INTO offline_trips (
          employee_id, vehicle_id, km_inicial, km_final,
          start_time, end_time,
          start_latitude, start_longitude,
          end_latitude, end_longitude,
          duration_seconds,
          origem, destino, motivo, observacao, status,
          employee_photo_base64, trip_photos_base64,
          synced, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      const values = [
        trip.employee_id,
        trip.vehicle_id,
        trip.km_inicial,
        trip.km_final,
        trip.start_time,
        trip.end_time,
        trip.start_latitude ?? null,
        trip.start_longitude ?? null,
        trip.end_latitude ?? null,
        trip.end_longitude ?? null,
        trip.duration_seconds,
        trip.origem ?? null,
        trip.destino ?? null,
        trip.motivo ?? null,
        trip.observacao ?? null,
        trip.status,
        trip.employee_photo_base64 ?? null,
        trip.trip_photos_base64 ?? null,
        trip.synced ?? 0,
        trip.deleted ?? 0,
      ];

      await db.run(query, values);
      console.log("[useSQLite] Trip salva no SQLite");
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao salvar trip:", error);
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
      console.error("[useSQLite] Erro ao buscar trips não sincronizadas:", error);
      return [];
    }
  };

  // Todas as viagens não deletadas (para debug / histórico offline)
  const getAllTrips = async (): Promise<OfflineTrip[]> => {
    const db = requireDb("getAllTrips");
    if (!db) return [];

    try {
      const result = await db.query(
        "SELECT * FROM offline_trips WHERE deleted = 0;"
      );
      return (result.values || []) as OfflineTrip[];
    } catch (error) {
      console.error("[useSQLite] Erro ao buscar trips:", error);
      return [];
    }
  };

  const markTripAsSynced = async (id: number): Promise<boolean> => {
    const db = requireDb("markTripAsSynced");
    if (!db) return false;

    try {
      await db.run("UPDATE offline_trips SET synced = 1 WHERE id = ?;", [id]);
      console.log("[useSQLite] Trip marcada como sincronizada:", id);
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao marcar trip como sincronizada:", error);
      return false;
    }
  };

  const deleteTrip = async (id: number): Promise<boolean> => {
    const db = requireDb("deleteTrip");
    if (!db) return false;

    try {
      await db.run("DELETE FROM offline_trips WHERE id = ?;", [id]);
      console.log("[useSQLite] Trip deletada:", id);
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao deletar trip:", error);
      return false;
    }
  };

  /**
   * Trips vindas do Supabase (histórico completo) usando a mesma filosofia
   * de saveEmployees/saveVehicles:
   *
   * - remove somente as viagens com synced = 1 (cópias do servidor)
   * - mantém as viagens locais pendentes (synced = 0)
   * - insere o histórico vindo do Supabase com synced = 1
   */
  const replaceSyncedTripsFromServer = async (
    tripsFromServer: any[]
  ): Promise<boolean> => {
    const db = requireDb("replaceSyncedTripsFromServer");
    if (!db) return false;

    try {
      // apaga apenas cópias sincronizadas previamente
      await db.execute("DELETE FROM offline_trips WHERE synced = 1;");

      if (!tripsFromServer.length) {
        console.log("[useSQLite] Nenhuma trip do servidor para salvar");
        return true;
      }

      await db.execute("BEGIN TRANSACTION;");

      for (const t of tripsFromServer) {
        await db.run(
          `
          INSERT INTO offline_trips (
            employee_id, vehicle_id, km_inicial, km_final,
            start_time, end_time,
            start_latitude, start_longitude,
            end_latitude, end_longitude,
            duration_seconds,
            origem, destino, motivo, observacao, status,
            employee_photo_base64, trip_photos_base64,
            synced, deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
          [
            t.employee_id,
            t.vehicle_id,
            t.km_inicial,
            t.km_final,
            t.start_time,
            t.end_time,
            t.start_latitude ?? null,
            t.start_longitude ?? null,
            t.end_latitude ?? null,
            t.end_longitude ?? null,
            t.duration_seconds ?? 0,
            t.origem ?? null,
            t.destino ?? null,
            t.motivo ?? null,
            t.observacao ?? null,
            t.status ?? "CONCLUIDA",
            null, // employee_photo_base64 (não precisamos pro histórico)
            null, // trip_photos_base64
            1, // synced -> veio do servidor
            0, // deleted
          ]
        );
      }

      await db.execute("COMMIT;");
      console.log(
        `[useSQLite] ${tripsFromServer.length} trips do servidor salvas no SQLite`
      );
      return true;
    } catch (error) {
      console.error(
        "[useSQLite] Erro ao salvar trips do servidor no SQLite:",
        error
      );
      try {
        await db.execute("ROLLBACK;");
      } catch {}
      return false;
    }
  };

  // ===== EMPLOYEES =====
  const saveEmployees = async (
    employees: OfflineEmployee[]
  ): Promise<boolean> => {
    const db = requireDb("saveEmployees");
    if (!db) return false;

    try {
      await db.execute("DELETE FROM offline_employees;");

      if (!employees.length) {
        console.log("[useSQLite] Nenhum employee para salvar (lista vazia)");
        return true;
      }

      await db.execute("BEGIN TRANSACTION;");
      for (const employee of employees) {
        await db.run(
          "INSERT INTO offline_employees (id, matricula, nome_completo, cargo) VALUES (?, ?, ?, ?);",
          [
            employee.id,
            employee.matricula,
            employee.nome_completo,
            employee.cargo,
          ]
        );
      }
      await db.execute("COMMIT;");

      console.log(
        `[useSQLite] ${employees.length} employees salvos no SQLite`
      );
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao salvar employees:", error);
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
      console.error("[useSQLite] Erro ao buscar employees:", error);
      return [];
    }
  };

  // ===== VEHICLES =====
  const saveVehicles = async (
    vehicles: OfflineVehicle[]
  ): Promise<boolean> => {
    const db = requireDb("saveVehicles");
    if (!db) return false;

    try {
      await db.execute("DELETE FROM offline_vehicles;");

      if (!vehicles.length) {
        console.log("[useSQLite] Nenhum vehicle para salvar (lista vazia)");
        return true;
      }

      await db.execute("BEGIN TRANSACTION;");
      for (const vehicle of vehicles) {
        await db.run(
          "INSERT INTO offline_vehicles (id, placa, marca, modelo) VALUES (?, ?, ?, ?);",
          [vehicle.id, vehicle.placa, vehicle.marca, vehicle.modelo]
        );
      }
      await db.execute("COMMIT;");

      console.log(
        `[useSQLite] ${vehicles.length} vehicles salvos no SQLite`
      );
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao salvar vehicles:", error);
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
      console.error("[useSQLite] Erro ao buscar vehicles:", error);
      return [];
    }
  };

  return {
    // estado
    isReady,
    hasDb,
    // trips
    saveTrip,
    getUnsyncedTrips,
    getAllTrips,
    markTripAsSynced,
    deleteTrip,
    replaceSyncedTripsFromServer, // 🔹 usado no OfflineContext
    // master data
    saveEmployees,
    getEmployees,
    saveVehicles,
    getVehicles,
  };
};

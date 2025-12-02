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
        vehicle_id TEXT,
        km_inicial REAL NOT NULL,
        km_final REAL,
        start_time TEXT NOT NULL,
        end_time TEXT,
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

    // Tabela para pontos de localização durante a viagem
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
  vehicle_id?: string | null;
  km_inicial: number;
  km_final?: number | null;
  start_time: string;
  end_time?: string | null;
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
  is_rented_vehicle?: number; // 0 = false, 1 = true
  rented_plate?: string | null;
  rented_model?: string | null;
  rented_company?: string | null;
  synced?: number; // 0 = not synced, 1 = synced
  deleted?: number; // 0 = not deleted, 1 = deleted (soft delete)
  server_trip_id?: string | null;
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

export interface OfflineTripPosition {
  id?: number;
  local_trip_id?: number;      // ID local da viagem (se salvou offline)
  server_trip_id?: string;     // UUID da viagem no Supabase (se salvou online)
  captured_at: string;
  latitude: number;
  longitude: number;
  synced?: number;             // 0 = não sincronizado, 1 = sincronizado
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
  /**
   * Salva uma viagem no SQLite e retorna o ID inserido (last_insert_rowid)
   * Retorna null em caso de erro
   */
  const saveTrip = async (trip: OfflineTrip): Promise<number | null> => {
    const db = requireDb("saveTrip");
    if (!db) return null;

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
          is_rented_vehicle, rented_plate, rented_model, rented_company,
          synced, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

      const values = [
        trip.employee_id,
        trip.vehicle_id ?? null,
        trip.km_inicial,
        trip.km_final ?? null, // ✅ Permite NULL para viagens em andamento
        trip.start_time,
        trip.end_time ?? null, // ✅ Permite NULL para viagens em andamento
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
        trip.is_rented_vehicle ?? 0,
        trip.rented_plate ?? null,
        trip.rented_model ?? null,
        trip.rented_company ?? null,
        trip.synced ?? 0,
        trip.deleted ?? 0,
      ];

      const result = await db.run(query, values);
      const insertedId = result.changes?.lastId;
      console.log("[useSQLite] Trip salva no SQLite com ID:", insertedId);
      return insertedId ?? null;
    } catch (error) {
      console.error("[useSQLite] Erro ao salvar trip:", error);
      return null;
    }
  };

  /**
   * Atualiza uma viagem existente com os dados finais (quando a viagem termina)
   * ✅ SEMPRE força status = "finalizada" para evitar viagens "fantasmas"
   */
  const updateTripOnEnd = async (
    localTripId: number,
    updates: Partial<OfflineTrip>
  ): Promise<boolean> => {
    const db = requireDb("updateTripOnEnd");
    if (!db) return false;

    try {
      const query = `
        UPDATE offline_trips SET
          km_final = ?,
          end_time = ?,
          end_latitude = ?,
          end_longitude = ?,
          duration_seconds = ?,
          origem = ?,
          destino = ?,
          motivo = ?,
          observacao = ?,
          status = 'finalizada',
          employee_photo_base64 = ?,
          trip_photos_base64 = ?,
          updated_at = datetime('now')
        WHERE id = ?;
      `;

      // ✅ IGNORA updates.status completamente - sempre grava "finalizada"
      const values = [
        updates.km_final ?? null,
        updates.end_time ?? null,
        updates.end_latitude ?? null,
        updates.end_longitude ?? null,
        updates.duration_seconds ?? 0,
        updates.origem ?? null,
        updates.destino ?? null,
        updates.motivo ?? null,
        updates.observacao ?? null,
        updates.employee_photo_base64 ?? null,
        updates.trip_photos_base64 ?? null,
        localTripId,
      ];

      await db.run(query, values);
      console.log("[useSQLite] ✅ Trip finalizada no SQLite (status=finalizada):", localTripId);
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao atualizar trip:", error);
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
        "SELECT * FROM offline_trips WHERE deleted = 0 ORDER BY start_time DESC;"
      );
      return (result.values || []) as OfflineTrip[];
    } catch (error) {
      console.error("[useSQLite] Erro ao buscar trips:", error);
      return [];
    }
  };

  /**
   * Busca viagem em andamento (status = 'em_andamento' e não deletada)
   * ✅ FILTRO RIGOROSO: garante que end_time ainda não foi preenchido
   * Retorna a viagem mais recente caso exista mais de uma
   */
  const getOngoingTrip = async (): Promise<OfflineTrip | null> => {
    const db = requireDb("getOngoingTrip");
    if (!db) return null;

    try {
      // ✅ FILTRO RIGOROSO: busca viagens com status em_andamento E end_time IS NULL
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
      
      console.log("[useSQLite] Busca por viagem em andamento:", found ? `ID ${found.id}` : "nenhuma");
      return found;
    } catch (error) {
      console.error("[useSQLite] Erro ao buscar viagem em andamento:", error);
      return null;
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
   * CORREÇÃO OFFLINE-FIRST:
   * Substitui as viagens sincronizadas (synced=1) pelas atualizadas do Supabase.
   * 
   * Resolve o problema de viagens deletadas no servidor continuarem aparecendo offline:
   * - Remove viagens com synced=1 que não existem mais no Supabase
   * - Remove viagens com server_trip_id que foram deletadas no servidor
   * - Mantém intactas as viagens locais pendentes (synced=0 sem server_trip_id)
   * - Insere o histórico completo vindo do Supabase com synced=1
   */
  const replaceSyncedTripsFromServer = async (
    tripsFromServer: any[]
  ): Promise<boolean> => {
    const db = requireDb("replaceSyncedTripsFromServer");
    if (!db) return false;

    try {
      await db.execute("BEGIN TRANSACTION;");

      if (!tripsFromServer.length) {
        // Se não há viagens no servidor, remove todas as sincronizadas
        await db.execute("DELETE FROM offline_trips WHERE synced = 1;");
        await db.execute("COMMIT;");
        console.log("[useSQLite] Nenhuma trip do servidor - removidas todas synced=1");
        return true;
      }

      // Coleta os IDs das viagens vindas do Supabase
      const serverTripIds = tripsFromServer
        .map(t => t.id)
        .filter(id => id)
        .map(id => `'${id}'`)
        .join(',');

      // Remove viagens sincronizadas que NÃO estão mais no servidor:
      // 1. Viagens com synced=1 que não têm ID na lista do servidor
      // 2. Viagens com server_trip_id preenchido mas que não existem mais no servidor
      if (serverTripIds) {
        await db.execute(`
          DELETE FROM offline_trips 
          WHERE synced = 1 
          OR (server_trip_id IS NOT NULL AND server_trip_id NOT IN (${serverTripIds}));
        `);
        console.log("[useSQLite] Removidas viagens sincronizadas não presentes no servidor");
      } else {
        await db.execute("DELETE FROM offline_trips WHERE synced = 1;");
      }

      // Insere/atualiza as viagens vindas do Supabase com synced=1
      for (const t of tripsFromServer) {
        await db.run(
          `
          INSERT INTO offline_trips (
            server_trip_id, employee_id, vehicle_id, km_inicial, km_final,
            start_time, end_time,
            start_latitude, start_longitude,
            end_latitude, end_longitude,
            duration_seconds,
            origem, destino, motivo, observacao, status,
            employee_photo_base64, trip_photos_base64,
            is_rented_vehicle, rented_plate, rented_model, rented_company,
            synced, deleted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
          [
            t.id, // server_trip_id
            t.employee_id,
            t.vehicle_id ?? null,
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
            t.status ?? "finalizada",
            null, // employee_photo_base64
            null, // trip_photos_base64
            t.is_rented_vehicle ? 1 : 0,
            t.rented_plate ?? null,
            t.rented_model ?? null,
            t.rented_company ?? null,
            1, // synced = 1 (veio do servidor)
            0, // deleted = 0
          ]
        );
      }

      await db.execute("COMMIT;");
      console.log(
        `[useSQLite] ✅ ${tripsFromServer.length} trips do servidor salvas/atualizadas no SQLite`
      );
      return true;
    } catch (error) {
      console.error(
        "[useSQLite] ❌ Erro ao salvar trips do servidor no SQLite:",
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
      console.log("[useSQLite] TripPosition salva no SQLite");
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao salvar trip position:", error);
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
      console.error("[useSQLite] Erro ao buscar trip positions não sincronizadas:", error);
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
      console.error("[useSQLite] Erro ao buscar trip positions por local_trip_id:", error);
      return [];
    }
  };

  const markTripPositionAsSynced = async (id: number): Promise<boolean> => {
    const db = requireDb("markTripPositionAsSynced");
    if (!db) return false;

    try {
      await db.run("UPDATE offline_trip_positions SET synced = 1 WHERE id = ?;", [id]);
      console.log("[useSQLite] TripPosition marcada como sincronizada:", id);
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao marcar trip position como sincronizada:", error);
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
      console.log(`[useSQLite] Trip positions atualizadas com server_trip_id: ${serverTripId}`);
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao atualizar server_trip_id:", error);
      return false;
    }
  };

  const deleteTripPositionsByLocalTripId = async (localTripId: number): Promise<boolean> => {
    const db = requireDb("deleteTripPositionsByLocalTripId");
    if (!db) return false;

    try {
      await db.run("DELETE FROM offline_trip_positions WHERE local_trip_id = ?;", [localTripId]);
      console.log("[useSQLite] Trip positions deletadas para local_trip_id:", localTripId);
      return true;
    } catch (error) {
      console.error("[useSQLite] Erro ao deletar trip positions:", error);
      return false;
    }
  };

  return {
    // estado
    isReady,
    hasDb,
    // trips
    saveTrip,
    updateTripOnEnd,
    getUnsyncedTrips,
    getAllTrips,
    getOngoingTrip,
    markTripAsSynced,
    deleteTrip,
    replaceSyncedTripsFromServer,
    // master data
    saveEmployees,
    getEmployees,
    saveVehicles,
    getVehicles,
    // trip positions
    saveTripPosition,
    getUnsyncedTripPositions,
    getTripPositionsByLocalTripId,
    markTripPositionAsSynced,
    updateTripPositionsServerTripId,
    deleteTripPositionsByLocalTripId,
  };
};

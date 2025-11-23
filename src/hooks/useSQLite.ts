import { useEffect, useState } from "react";
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

const DB_NAME = "trips_offline";

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
  synced?: number;
  deleted?: number;
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

export const useSQLite = () => {
  const [db, setDb] = useState<SQLiteDBConnection | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasDb, setHasDb] = useState(false); // <- para debug

  useEffect(() => {
    initializeDatabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeDatabase = async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        console.log("[SQLite] Web: não inicializa banco nativo");
        setIsReady(true);
        setHasDb(false);
        return;
      }

      const sqlite = new SQLiteConnection(CapacitorSQLite);

      const dbConnection = await sqlite.createConnection(
        DB_NAME,
        false,
        "no-encryption",
        1,
        false
      );

      await dbConnection.open();

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

      setDb(dbConnection);
      setHasDb(true);
      setIsReady(true);
      console.log("[SQLite] Banco inicializado com sucesso");
    } catch (error: any) {
      console.error("[SQLite] Erro inicializando banco:", error);
      toast.error("Erro inicializando SQLite", {
        description: error?.message ?? String(error),
      });
      setIsReady(true); // deixa a app seguir, mas hasDb fica false
      setHasDb(false);
    }
  };

  const saveTrip = async (trip: OfflineTrip): Promise<boolean> => {
    if (!db) {
      console.log("[SQLite] saveTrip: db nulo");
      toast.error("SQLite não disponível (saveTrip)");
      return false;
    }

    try {
      const query = `
        INSERT INTO offline_trips (
          employee_id, vehicle_id, km_inicial, km_final,
          start_time, end_time, start_latitude, start_longitude,
          end_latitude, end_longitude, duration_seconds,
          origem, destino, motivo, observacao, status,
          employee_photo_base64, trip_photos_base64, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
      ];

      await db.run(query, values);
      console.log("[SQLite] Trip salva no banco local");
      return true;
    } catch (error: any) {
      console.error("[SQLite] Erro salvando trip:", error);
      toast.error("Erro salvando viagem no SQLite", {
        description: error?.message ?? String(error),
      });
      return false;
    }
  };

  const getUnsyncedTrips = async (): Promise<OfflineTrip[]> => {
    if (!db) return [];

    try {
      const result = await db.query(
        "SELECT * FROM offline_trips WHERE synced = 0;"
      );
      return result.values || [];
    } catch (error: any) {
      console.error("[SQLite] Erro lendo trips:", error);
      toast.error("Erro lendo viagens do SQLite", {
        description: error?.message ?? String(error),
      });
      return [];
    }
  };

  const markTripAsSynced = async (id: number): Promise<boolean> => {
    if (!db) return false;

    try {
      await db.run("UPDATE offline_trips SET synced = 1 WHERE id = ?;", [id]);
      console.log(`[SQLite] Trip ${id} marcada como sincronizada`);
      return true;
    } catch (error: any) {
      console.error("[SQLite] Erro marcando trip:", error);
      toast.error("Erro marcando viagem como sincronizada", {
        description: error?.message ?? String(error),
      });
      return false;
    }
  };

  const deleteTrip = async (id: number): Promise<boolean> => {
    if (!db) return false;

    try {
      await db.run("DELETE FROM offline_trips WHERE id = ?;", [id]);
      console.log(`[SQLite] Trip ${id} removida do banco local`);
      return true;
    } catch (error: any) {
      console.error("[SQLite] Erro deletando trip:", error);
      toast.error("Erro deletando viagem do SQLite", {
        description: error?.message ?? String(error),
      });
      return false;
    }
  };

  const saveEmployees = async (
    employees: OfflineEmployee[]
  ): Promise<boolean> => {
    if (!db) {
      console.error("[SQLite] saveEmployees: db nulo");
      return false;
    }

    try {
      console.log("[SQLite] saveEmployees start, qtd:", employees.length);

      if (employees.length === 0) {
        console.warn("[SQLite] saveEmployees recebeu lista vazia, ignorando");
        return true;
      }

      await db.run("DELETE FROM offline_employees;");
      console.log("[SQLite] Tabela offline_employees limpa");

      for (const emp of employees) {
        await db.run(
          "INSERT INTO offline_employees (id, matricula, nome_completo, cargo) VALUES (?, ?, ?, ?);",
          [emp.id, emp.matricula, emp.nome_completo, emp.cargo]
        );
      }

      const verify = await db.query("SELECT COUNT(*) as count FROM offline_employees;");
      console.log("[SQLite] Funcionários salvos no banco local:", verify.values?.[0]?.count || 0);
      
      return true;
    } catch (error: any) {
      console.error("[SQLite] Erro em saveEmployees:", error);
      return false;
    }
  };

  const getEmployees = async (): Promise<OfflineEmployee[]> => {
    if (!db) return [];

    try {
      const result = await db.query("SELECT * FROM offline_employees;");
      return result.values || [];
    } catch (error: any) {
      console.error("[SQLite] Erro lendo employees:", error);
      toast.error("Erro lendo funcionários do SQLite", {
        description: error?.message ?? String(error),
      });
      return [];
    }
  };

  const saveVehicles = async (
    vehicles: OfflineVehicle[]
  ): Promise<boolean> => {
    if (!db) {
      console.error("[SQLite] saveVehicles: db nulo");
      return false;
    }

    try {
      console.log("[SQLite] saveVehicles start, qtd:", vehicles.length);

      if (vehicles.length === 0) {
        console.warn("[SQLite] saveVehicles recebeu lista vazia, ignorando");
        return true;
      }

      await db.run("DELETE FROM offline_vehicles;");
      console.log("[SQLite] Tabela offline_vehicles limpa");

      for (const veh of vehicles) {
        await db.run(
          "INSERT INTO offline_vehicles (id, placa, marca, modelo) VALUES (?, ?, ?, ?);",
          [veh.id, veh.placa, veh.marca, veh.modelo]
        );
      }

      const verify = await db.query("SELECT COUNT(*) as count FROM offline_vehicles;");
      console.log("[SQLite] Veículos salvos no banco local:", verify.values?.[0]?.count || 0);
      
      return true;
    } catch (error: any) {
      console.error("[SQLite] Erro em saveVehicles:", error);
      return false;
    }
  };

  const getVehicles = async (): Promise<OfflineVehicle[]> => {
    if (!db) return [];

    try {
      const result = await db.query("SELECT * FROM offline_vehicles;");
      return result.values || [];
    } catch (error: any) {
      console.error("[SQLite] Erro lendo vehicles:", error);
      toast.error("Erro lendo veículos do SQLite", {
        description: error?.message ?? String(error),
      });
      return [];
    }
  };

  return {
    isReady,
    hasDb, // <- NOVO, pra você ver se a conexão existe
    saveTrip,
    getUnsyncedTrips,
    markTripAsSynced,
    deleteTrip,
    saveEmployees,
    getEmployees,
    saveVehicles,
    getVehicles,
  };
};

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

      console.log("[SQLite] ========================================");
      console.log("[SQLite] Iniciando inicialização do banco...");
      console.log("[SQLite] Plataforma:", Capacitor.getPlatform());
      
      const sqlite = new SQLiteConnection(CapacitorSQLite);

      // Verifica se o banco já existe
      const isDBExists = await sqlite.isDatabase(DB_NAME);
      console.log("[SQLite] Banco", DB_NAME, "já existe?", isDBExists.result);

      console.log("[SQLite] Criando/abrindo conexão com o banco:", DB_NAME);
      const dbConnection = await sqlite.createConnection(
        DB_NAME,
        false,
        "no-encryption",
        1,
        false
      );

      console.log("[SQLite] Abrindo banco de dados...");
      await dbConnection.open();
      console.log("[SQLite] Banco aberto com sucesso");

      console.log("[SQLite] Criando tabelas...");
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

      console.log("[SQLite] Tabelas criadas/verificadas com sucesso");
      
      // Verifica quantos registros existem
      const empCount = await dbConnection.query("SELECT COUNT(*) as count FROM offline_employees;");
      const vehCount = await dbConnection.query("SELECT COUNT(*) as count FROM offline_vehicles;");
      const tripCount = await dbConnection.query("SELECT COUNT(*) as count FROM offline_trips;");
      
      console.log("[SQLite] ========================================");
      console.log("[SQLite] Registros existentes no banco:");
      console.log("[SQLite]   - Employees:", empCount.values?.[0]?.count || 0);
      console.log("[SQLite]   - Vehicles:", vehCount.values?.[0]?.count || 0);
      console.log("[SQLite]   - Trips:", tripCount.values?.[0]?.count || 0);
      console.log("[SQLite] ========================================");
      
      setDb(dbConnection);
      setHasDb(true);
      setIsReady(true);
      console.log("[SQLite] ✅ Banco inicializado com sucesso - conexão ativa:", !!dbConnection);
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
      console.error("[SQLite] ❌ saveEmployees: db é NULL!");
      return false;
    }

    try {
      console.log("[SQLite] 💾 saveEmployees iniciando, quantidade:", employees.length);

      if (employees.length === 0) {
        console.warn("[SQLite] ⚠️ saveEmployees recebeu lista vazia, ignorando");
        return true;
      }

      // Deleta todos os registros antigos
      console.log("[SQLite] 🗑️ Limpando tabela offline_employees...");
      await db.run("DELETE FROM offline_employees;");
      
      // Verifica se limpou
      const afterDelete = await db.query("SELECT COUNT(*) as count FROM offline_employees;");
      console.log("[SQLite] Registros após DELETE:", afterDelete.values?.[0]?.count || 0);

      // Insere os novos registros
      console.log("[SQLite] 📝 Inserindo", employees.length, "funcionários...");
      let insertedCount = 0;
      for (const emp of employees) {
        await db.run(
          "INSERT INTO offline_employees (id, matricula, nome_completo, cargo) VALUES (?, ?, ?, ?);",
          [emp.id, emp.matricula, emp.nome_completo, emp.cargo]
        );
        insertedCount++;
        if (insertedCount % 5 === 0) {
          console.log(`[SQLite] Inseridos ${insertedCount}/${employees.length}...`);
        }
      }

      // Verifica quantos foram salvos
      const verify = await db.query("SELECT COUNT(*) as count FROM offline_employees;");
      const finalCount = verify.values?.[0]?.count || 0;
      console.log("[SQLite] ✅ Funcionários salvos no banco:", finalCount, "de", employees.length);
      
      if (finalCount !== employees.length) {
        console.error("[SQLite] ❌ ERRO: Número de registros salvos diferente do esperado!");
        return false;
      }
      
      return true;
    } catch (error: any) {
      console.error("[SQLite] ❌ Erro em saveEmployees:", error);
      return false;
    }
  };

  const getEmployees = async (): Promise<OfflineEmployee[]> => {
    if (!db) {
      console.error("[SQLite] ❌ getEmployees: db é NULL!");
      return [];
    }

    try {
      console.log("[SQLite] 🔍 getEmployees: executando SELECT...");
      const result = await db.query("SELECT * FROM offline_employees;");
      const count = result.values?.length || 0;
      console.log("[SQLite] ✅ getEmployees retornou:", count, "registros");
      
      if (count > 0) {
        console.log("[SQLite] 📋 Primeiros 3 registros:", result.values?.slice(0, 3));
      }
      
      return result.values || [];
    } catch (error: any) {
      console.error("[SQLite] ❌ Erro lendo employees:", error);
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
      console.error("[SQLite] ❌ saveVehicles: db é NULL!");
      return false;
    }

    try {
      console.log("[SQLite] 💾 saveVehicles iniciando, quantidade:", vehicles.length);

      if (vehicles.length === 0) {
        console.warn("[SQLite] ⚠️ saveVehicles recebeu lista vazia, ignorando");
        return true;
      }

      // Deleta todos os registros antigos
      console.log("[SQLite] 🗑️ Limpando tabela offline_vehicles...");
      await db.run("DELETE FROM offline_vehicles;");
      
      // Verifica se limpou
      const afterDelete = await db.query("SELECT COUNT(*) as count FROM offline_vehicles;");
      console.log("[SQLite] Registros após DELETE:", afterDelete.values?.[0]?.count || 0);

      // Insere os novos registros
      console.log("[SQLite] 📝 Inserindo", vehicles.length, "veículos...");
      let insertedCount = 0;
      for (const veh of vehicles) {
        await db.run(
          "INSERT INTO offline_vehicles (id, placa, marca, modelo) VALUES (?, ?, ?, ?);",
          [veh.id, veh.placa, veh.marca, veh.modelo]
        );
        insertedCount++;
        if (insertedCount % 5 === 0) {
          console.log(`[SQLite] Inseridos ${insertedCount}/${vehicles.length}...`);
        }
      }

      // Verifica quantos foram salvos
      const verify = await db.query("SELECT COUNT(*) as count FROM offline_vehicles;");
      const finalCount = verify.values?.[0]?.count || 0;
      console.log("[SQLite] ✅ Veículos salvos no banco:", finalCount, "de", vehicles.length);
      
      if (finalCount !== vehicles.length) {
        console.error("[SQLite] ❌ ERRO: Número de registros salvos diferente do esperado!");
        return false;
      }
      
      return true;
    } catch (error: any) {
      console.error("[SQLite] ❌ Erro em saveVehicles:", error);
      return false;
    }
  };

  const getVehicles = async (): Promise<OfflineVehicle[]> => {
    if (!db) {
      console.error("[SQLite] ❌ getVehicles: db é NULL!");
      return [];
    }

    try {
      console.log("[SQLite] 🔍 getVehicles: executando SELECT...");
      const result = await db.query("SELECT * FROM offline_vehicles;");
      const count = result.values?.length || 0;
      console.log("[SQLite] ✅ getVehicles retornou:", count, "registros");
      
      if (count > 0) {
        console.log("[SQLite] 📋 Primeiros 3 registros:", result.values?.slice(0, 3));
      }
      
      return result.values || [];
    } catch (error: any) {
      console.error("[SQLite] ❌ Erro lendo vehicles:", error);
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

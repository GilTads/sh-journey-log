import { useEffect, useState } from "react";
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";

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
  origem?: string;
  destino?: string;
  motivo?: string;
  observacao?: string;
  status: string;
  employee_photo_base64?: string;
  trip_photos_base64?: string;
  synced: number; // 0 = not synced, 1 = synced
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

  useEffect(() => {
    initializeDatabase();
  }, []);

  const initializeDatabase = async () => {
    try {
      // Only initialize on native platforms
      if (!Capacitor.isNativePlatform()) {
        console.log("SQLite only works on native platforms");
        setIsReady(true);
        return;
      }

      const sqlite = new SQLiteConnection(CapacitorSQLite);
      
      // Create or open database
      const dbConnection = await sqlite.createConnection(
        DB_NAME,
        false,
        "no-encryption",
        1,
        false
      );

      await dbConnection.open();

      // Create trips table if it doesn't exist
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
          synced INTEGER DEFAULT 0
        );
      `);

      // Create employees table
      await dbConnection.execute(`
        CREATE TABLE IF NOT EXISTS offline_employees (
          id TEXT PRIMARY KEY,
          matricula TEXT NOT NULL,
          nome_completo TEXT NOT NULL,
          cargo TEXT NOT NULL
        );
      `);

      // Create vehicles table
      await dbConnection.execute(`
        CREATE TABLE IF NOT EXISTS offline_vehicles (
          id TEXT PRIMARY KEY,
          placa TEXT NOT NULL,
          marca TEXT NOT NULL,
          modelo TEXT NOT NULL
        );
      `);

      setDb(dbConnection);
      setIsReady(true);
      console.log("SQLite database initialized");
    } catch (error) {
      console.error("Error initializing SQLite:", error);
      setIsReady(true); // Set ready even on error to allow app to continue
    }
  };

  const saveTrip = async (trip: OfflineTrip): Promise<boolean> => {
    if (!db || !Capacitor.isNativePlatform()) {
      console.log("SQLite not available");
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
        trip.start_latitude || null,
        trip.start_longitude || null,
        trip.end_latitude || null,
        trip.end_longitude || null,
        trip.duration_seconds,
        trip.origem || null,
        trip.destino || null,
        trip.motivo || null,
        trip.observacao || null,
        trip.status,
        trip.employee_photo_base64 || null,
        trip.trip_photos_base64 || null,
        trip.synced || 0,
      ];

      await db.run(query, values);
      console.log("Trip saved to local database");
      return true;
    } catch (error) {
      console.error("Error saving trip to SQLite:", error);
      return false;
    }
  };

  const getUnsyncedTrips = async (): Promise<OfflineTrip[]> => {
    if (!db || !Capacitor.isNativePlatform()) {
      return [];
    }

    try {
      const result = await db.query(
        "SELECT * FROM offline_trips WHERE synced = 0;"
      );

      return result.values || [];
    } catch (error) {
      console.error("Error getting unsynced trips:", error);
      return [];
    }
  };

  const markTripAsSynced = async (id: number): Promise<boolean> => {
    if (!db || !Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      await db.run("UPDATE offline_trips SET synced = 1 WHERE id = ?;", [id]);
      console.log(`Trip ${id} marked as synced`);
      return true;
    } catch (error) {
      console.error("Error marking trip as synced:", error);
      return false;
    }
  };

  const deleteTrip = async (id: number): Promise<boolean> => {
    if (!db || !Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      await db.run("DELETE FROM offline_trips WHERE id = ?;", [id]);
      console.log(`Trip ${id} deleted from local database`);
      return true;
    } catch (error) {
      console.error("Error deleting trip:", error);
      return false;
    }
  };

  const saveEmployees = async (employees: OfflineEmployee[]): Promise<boolean> => {
    if (!db || !Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      // Clear existing employees
      await db.run("DELETE FROM offline_employees;");

      // Insert all employees
      for (const employee of employees) {
        await db.run(
          "INSERT INTO offline_employees (id, matricula, nome_completo, cargo) VALUES (?, ?, ?, ?);",
          [employee.id, employee.matricula, employee.nome_completo, employee.cargo]
        );
      }

      console.log(`${employees.length} employees saved to local database`);
      return true;
    } catch (error) {
      console.error("Error saving employees to SQLite:", error);
      return false;
    }
  };

  const getEmployees = async (): Promise<OfflineEmployee[]> => {
    if (!db || !Capacitor.isNativePlatform()) {
      return [];
    }

    try {
      const result = await db.query("SELECT * FROM offline_employees;");
      return result.values || [];
    } catch (error) {
      console.error("Error getting employees from SQLite:", error);
      return [];
    }
  };

  const saveVehicles = async (vehicles: OfflineVehicle[]): Promise<boolean> => {
    if (!db || !Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      // Clear existing vehicles
      await db.run("DELETE FROM offline_vehicles;");

      // Insert all vehicles
      for (const vehicle of vehicles) {
        await db.run(
          "INSERT INTO offline_vehicles (id, placa, marca, modelo) VALUES (?, ?, ?, ?);",
          [vehicle.id, vehicle.placa, vehicle.marca, vehicle.modelo]
        );
      }

      console.log(`${vehicles.length} vehicles saved to local database`);
      return true;
    } catch (error) {
      console.error("Error saving vehicles to SQLite:", error);
      return false;
    }
  };

  const getVehicles = async (): Promise<OfflineVehicle[]> => {
    if (!db || !Capacitor.isNativePlatform()) {
      return [];
    }

    try {
      const result = await db.query("SELECT * FROM offline_vehicles;");
      return result.values || [];
    } catch (error) {
      console.error("Error getting vehicles from SQLite:", error);
      return [];
    }
  };

  return {
    isReady,
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

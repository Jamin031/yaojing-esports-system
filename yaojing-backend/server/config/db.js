import mysql from "mysql2/promise";
import { AppError } from "../utils/appError.js";

let pool;

export function createPool() {
  if (pool) {
    return pool;
  }

  pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "yaojing_saas",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    charset: "utf8mb4"
  });

  return pool;
}

export async function query(sql, params = []) {
  if (!pool) {
    createPool();
  }

  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function getConnection() {
  if (!pool) {
    createPool();
  }
  return pool.getConnection();
}

export function requireStoreId(storeId) {
  if (!storeId) {
    throw new AppError("Store context is required", 400);
  }
}

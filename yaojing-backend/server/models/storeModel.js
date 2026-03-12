import { query } from "../config/db.js";

export async function createStore(data) {
  const sql = `
    INSERT INTO stores (name, subdomain, commission_rate)
    VALUES (?, ?, ?)
  `;
  const result = await query(sql, [data.name, data.subdomain, data.commission_rate]);
  return { id: result.insertId, ...data };
}

export async function listStores() {
  const sql = `
    SELECT id, name, subdomain, commission_rate, created_at
    FROM stores
    WHERE is_deleted = 0
    ORDER BY id DESC
  `;
  return query(sql);
}

export async function updateStore(id, data) {
  const sql = `
    UPDATE stores
    SET name = ?, subdomain = ?, commission_rate = ?
    WHERE id = ? AND is_deleted = 0
  `;
  return query(sql, [data.name, data.subdomain, data.commission_rate, id]);
}

export async function findStoreBySubdomain(subdomain) {
  const sql = `
    SELECT id, name, subdomain, commission_rate
    FROM stores
    WHERE subdomain = ? AND is_deleted = 0
    LIMIT 1
  `;
  const rows = await query(sql, [subdomain]);
  return rows[0] || null;
}

export async function findStoreById(id) {
  const sql = `
    SELECT id, name, subdomain, commission_rate
    FROM stores
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `;
  const rows = await query(sql, [id]);
  return rows[0] || null;
}


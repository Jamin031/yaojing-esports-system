import { query } from "../config/db.js";

export async function listPackages({ role, storeId }) {
  if (role === "super_admin" || role === "admin") {
    return query(
      `
      SELECT id, store_id, game_type, service_type, title, description, price, duration, status, created_at
      FROM packages
      WHERE is_deleted = 0
      ORDER BY id DESC
      `
    );
  }

  return query(
    `
    SELECT id, store_id, game_type, service_type, title, description, price, duration, status, created_at
    FROM packages
    WHERE store_id = ? AND is_deleted = 0
    ORDER BY id DESC
    `,
    [storeId]
  );
}

export async function listActivePackagesByStore(storeId) {
  return query(
    `
    SELECT id, store_id, game_type, service_type, title, description, price, duration, status, created_at
    FROM packages
    WHERE store_id = ? AND status = 'active' AND is_deleted = 0
    ORDER BY id DESC
    `,
    [storeId]
  );
}

export async function createPackage(data) {
  const sql = `
    INSERT INTO packages (store_id, game_type, service_type, title, description, price, duration, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await query(sql, [
    data.store_id,
    data.game_type,
    data.service_type,
    data.title,
    data.description,
    data.price,
    data.duration,
    data.status
  ]);
  return { id: result.insertId, ...data };
}

export async function updatePackage(id, data) {
  const sql = `
    UPDATE packages
    SET game_type = ?, service_type = ?, title = ?, description = ?, price = ?, duration = ?, status = ?
    WHERE id = ? AND store_id = ? AND is_deleted = 0
  `;
  return query(sql, [
    data.game_type,
    data.service_type,
    data.title,
    data.description,
    data.price,
    data.duration,
    data.status,
    id,
    data.store_id
  ]);
}

export async function softDeletePackage(id, storeId) {
  const sql = `
    UPDATE packages
    SET is_deleted = 1
    WHERE id = ? AND store_id = ? AND is_deleted = 0
  `;
  return query(sql, [id, storeId]);
}

export async function findPackageById(id) {
  const sql = `
    SELECT id, store_id, game_type, service_type, title, description, price, duration, status
    FROM packages
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `;
  const rows = await query(sql, [id]);
  return rows[0] || null;
}

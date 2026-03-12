import { query } from "../config/db.js";

export async function listPlayers({ role, storeId }) {
  if (role === "super_admin" || role === "admin") {
    return query(
      `
      SELECT id, store_id, nickname, gender, game_type, price_per_hour, status, created_at
      FROM players
      WHERE is_deleted = 0
      ORDER BY id DESC
      `
    );
  }

  return query(
    `
    SELECT id, store_id, nickname, gender, game_type, price_per_hour, status, created_at
    FROM players
    WHERE store_id = ? AND is_deleted = 0
    ORDER BY id DESC
    `,
    [storeId]
  );
}

export async function listPublicPlayersByStore(storeId) {
  return query(
    `
    SELECT id, store_id, nickname, gender, game_type, price_per_hour, status, created_at
    FROM players
    WHERE store_id = ? AND status IN ('idle', 'busy') AND is_deleted = 0
    ORDER BY id DESC
    `,
    [storeId]
  );
}

export async function createPlayer(data) {
  const sql = `
    INSERT INTO players (store_id, nickname, gender, game_type, price_per_hour, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const result = await query(sql, [
    data.store_id,
    data.nickname,
    data.gender,
    data.game_type,
    data.price_per_hour,
    data.status
  ]);
  return { id: result.insertId, ...data };
}

export async function updatePlayer(id, data) {
  const sql = `
    UPDATE players
    SET nickname = ?, gender = ?, game_type = ?, price_per_hour = ?, status = ?
    WHERE id = ? AND store_id = ? AND is_deleted = 0
  `;
  return query(sql, [
    data.nickname,
    data.gender,
    data.game_type,
    data.price_per_hour,
    data.status,
    id,
    data.store_id
  ]);
}

export async function softDeletePlayer(id, storeId) {
  const sql = `
    UPDATE players
    SET is_deleted = 1
    WHERE id = ? AND store_id = ? AND is_deleted = 0
  `;
  return query(sql, [id, storeId]);
}

export async function setPlayerStatus(playerId, storeId, status) {
  const sql = `
    UPDATE players
    SET status = ?
    WHERE id = ? AND store_id = ? AND is_deleted = 0
  `;
  return query(sql, [status, playerId, storeId]);
}

export async function findPlayerById(id) {
  const sql = `
    SELECT id, store_id, nickname, status
    FROM players
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `;
  const rows = await query(sql, [id]);
  return rows[0] || null;
}

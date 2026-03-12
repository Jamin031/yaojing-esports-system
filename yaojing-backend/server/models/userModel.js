import { query } from "../config/db.js";

export async function findUserByUsername(username) {
  const sql = `
    SELECT id, username, password, role, store_id
    FROM users
    WHERE username = ? AND is_deleted = 0
    LIMIT 1
  `;
  const rows = await query(sql, [username]);
  return rows[0] || null;
}


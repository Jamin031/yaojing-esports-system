import { query } from "../config/db.js";

export async function createOrder(data) {
  const sql = `
    INSERT INTO orders
    (order_no, store_id, package_id, player_id, customer_contact, status, total_price, commission_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await query(sql, [
    data.order_no,
    data.store_id,
    data.package_id,
    data.player_id || null,
    data.customer_contact,
    data.status,
    data.total_price,
    data.commission_amount
  ]);
  return { id: result.insertId, ...data };
}

export async function listOrdersByRole({ role, storeId }) {
  if (role === "super_admin" || role === "admin") {
    return query(
      `
      SELECT id, order_no, store_id, package_id, player_id, customer_contact, status, total_price, commission_amount, created_at, updated_at
      FROM orders
      WHERE is_deleted = 0
      ORDER BY id DESC
      `
    );
  }

  return query(
    `
    SELECT id, order_no, store_id, package_id, player_id, customer_contact, status, total_price, commission_amount, created_at, updated_at
    FROM orders
    WHERE store_id = ? AND status IN ('confirmed', 'completed') AND is_deleted = 0
    ORDER BY id DESC
    `,
    [storeId]
  );
}

export async function findOrderById(id) {
  const sql = `
    SELECT id, order_no, store_id, package_id, player_id, customer_contact, status, total_price, commission_amount
    FROM orders
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `;
  const rows = await query(sql, [id]);
  return rows[0] || null;
}

export async function confirmOrder(id, commissionAmount) {
  const sql = `
    UPDATE orders
    SET status = 'confirmed', commission_amount = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending' AND is_deleted = 0
  `;
  return query(sql, [commissionAmount, id]);
}

export async function completeOrder(id) {
  const sql = `
    UPDATE orders
    SET status = 'completed', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'confirmed' AND is_deleted = 0
  `;
  return query(sql, [id]);
}


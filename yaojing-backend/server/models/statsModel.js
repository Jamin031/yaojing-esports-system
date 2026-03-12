import { query } from "../config/db.js";

export async function getSuperAdminOverview() {
  const [ordersAgg] = await query(
    `
    SELECT
      COUNT(*) AS total_orders,
      COALESCE(SUM(CASE WHEN status IN ('confirmed', 'completed') THEN total_price ELSE 0 END), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN status IN ('confirmed', 'completed') THEN commission_amount ELSE 0 END), 0) AS total_commission
    FROM orders
    WHERE is_deleted = 0
    `
  );

  const revenueByStore = await query(
    `
    SELECT s.id AS store_id, s.name AS store_name,
      COALESCE(SUM(CASE WHEN o.status IN ('confirmed', 'completed') THEN o.total_price ELSE 0 END), 0) AS revenue
    FROM stores s
    LEFT JOIN orders o ON o.store_id = s.id AND o.is_deleted = 0
    WHERE s.is_deleted = 0
    GROUP BY s.id, s.name
    ORDER BY revenue DESC
    `
  );

  return { ordersAgg, revenueByStore };
}

export async function getStoreOwnerOverview(storeId) {
  const [agg] = await query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('confirmed', 'completed') THEN total_price ELSE 0 END), 0) AS store_revenue,
      COALESCE(SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed_orders,
      COALESCE(SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END), 0) AS unfinished_orders
    FROM orders
    WHERE store_id = ? AND is_deleted = 0
    `,
    [storeId]
  );

  const [idlePlayers] = await query(
    `
    SELECT COUNT(*) AS idle_players
    FROM players
    WHERE store_id = ? AND status = 'idle' AND is_deleted = 0
    `,
    [storeId]
  );

  return { agg, idlePlayers };
}


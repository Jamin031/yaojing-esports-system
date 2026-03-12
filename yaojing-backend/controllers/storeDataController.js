const { query } = require('../config/db');
const { hasRole, hasPagePermission, hasScopePermission, VIEW_SCOPE_KEYS } = require('../middleware/permissions');
const { ok, fail } = require('../utils/http');

function hourLabel(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return '-';
  return `${String(h).padStart(2, '0')}:00`;
}

async function listStoreData(req, res) {
  const user = req.user;
  if (!hasPagePermission(user, 'store_data:view')) {
    return fail(res, 'Forbidden', 403);
  }

  const isStoreOwner = hasRole(user, 'store_owner');
  const filters = ['s.is_deleted = 0'];
  const params = {};

  if (isStoreOwner) {
    if (!hasScopePermission(user, VIEW_SCOPE_KEYS.STATS_SELF_STORE)) {
      return fail(res, 'Forbidden', 403);
    }
    if (!user.store_id) {
      return fail(res, 'Store owner is not bound to a store', 400);
    }
    filters.push('s.id = :scope_store_id');
    params.scope_store_id = Number(user.store_id);
  } else if (req.query.store_id) {
    filters.push('s.id = :store_id');
    params.store_id = Number(req.query.store_id);
  }

  const where = filters.join(' AND ');

  const list = await query(
    `SELECT
      s.id AS store_id,
      s.name AS store_name,
      COALESCE(SUM(CASE WHEN o.is_deleted = 0 AND o.status = 'completed' AND DATE(o.created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_order_count,
      COALESCE(SUM(CASE WHEN o.is_deleted = 0 AND o.status = 'completed' AND DATE(o.created_at) = CURDATE() THEN COALESCE(o.revised_amount, o.order_amount) ELSE 0 END), 0) AS today_income,
      COALESCE(SUM(CASE WHEN o.is_deleted = 0 AND o.status = 'completed' AND DATE_FORMAT(o.created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN COALESCE(o.revised_amount, o.order_amount) ELSE 0 END), 0) AS month_income
     FROM stores s
     LEFT JOIN orders o ON o.store_id = s.id
     WHERE ${where}
     GROUP BY s.id, s.name
     ORDER BY s.id DESC`,
    params
  );

  for (const row of list) {
    const peakRows = await query(
       `SELECT HOUR(created_at) AS peak_hour, COUNT(*) AS total
       FROM orders
       WHERE is_deleted = 0
         AND status = 'completed'
         AND store_id = :store_id
         AND DATE(created_at) = CURDATE()
       GROUP BY HOUR(created_at)
       ORDER BY total DESC, peak_hour DESC
       LIMIT 1`,
      { store_id: Number(row.store_id) }
    );

    row.peak_time = peakRows.length ? hourLabel(peakRows[0].peak_hour) : '-';
  }

  return ok(res, { list, total: list.length }, 'store data fetched');
}

module.exports = {
  listStoreData,
};

const { query } = require('../config/db');
const { hasRole, hasPagePermission, hasScopePermission, VIEW_SCOPE_KEYS } = require('../middleware/permissions');
const { buildPagination, ok, fail } = require('../utils/http');

function isStoreOwner(user) {
  return hasRole(user, 'store_owner');
}

function canViewStats(user) {
  const hasStatsPageAccess = hasPagePermission(user, 'stats:view') || hasPagePermission(user, 'dashboard:view');
  if (!hasStatsPageAccess) {
    return false;
  }
  if (!isStoreOwner(user)) {
    return true;
  }
  return hasScopePermission(user, VIEW_SCOPE_KEYS.STATS_SELF_STORE);
}

function canViewAllStoreRanking(user) {
  if (!isStoreOwner(user)) {
    return true;
  }
  return hasScopePermission(user, VIEW_SCOPE_KEYS.STATS_ALL_RANKING);
}

function canViewAllStoreSensitiveAmount(user) {
  if (!isStoreOwner(user)) {
    return true;
  }
  return hasScopePermission(user, VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT);
}

function buildOfflineScope(user) {
  const params = {};
  let where = 'o.is_deleted = 0';

  if (isStoreOwner(user)) {
    where += ' AND o.store_id = :scope_store_id';
    params.scope_store_id = Number(user.store_id);
  }

  return { where, params };
}

function buildOnlineScope(user) {
  const params = {};
  let where = 'oo.is_deleted = 0';

  if (isStoreOwner(user)) {
    where += ' AND oo.store_id = :scope_store_id';
    params.scope_store_id = Number(user.store_id);
  }

  return { where, params };
}

function buildScopedFilter(user, alias) {
  if (!isStoreOwner(user)) {
    return { filter: '', params: {} };
  }
  return {
    filter: ` AND ${alias}.store_id = :scope_store_id`,
    params: { scope_store_id: Number(user.store_id) },
  };
}

async function buildStoreRankingList() {
  const rows = await query(
    `SELECT
      s.id AS store_id,
      s.name AS store_name,
      COALESCE(offline.offline_income, 0) AS offline_income,
      COALESCE(online.online_income, 0) AS online_income
     FROM stores s
     LEFT JOIN (
       SELECT
         o.store_id,
         COALESCE(SUM(CASE WHEN o.is_deleted = 0 AND o.status = 'completed' THEN COALESCE(o.revised_amount, o.order_amount) ELSE 0 END), 0) AS offline_income
       FROM orders o
       GROUP BY o.store_id
     ) offline ON offline.store_id = s.id
     LEFT JOIN (
       SELECT
         oo.store_id,
         COALESCE(SUM(CASE WHEN oo.is_deleted = 0 AND oo.status = 'completed' THEN oo.order_amount ELSE 0 END), 0) AS online_income
       FROM online_orders oo
       GROUP BY oo.store_id
     ) online ON online.store_id = s.id
     WHERE s.is_deleted = 0
     ORDER BY (COALESCE(offline.offline_income, 0) + COALESCE(online.online_income, 0)) DESC, s.id ASC`
  );

  const ranked = rows.map((item, index) => {
    const offlineIncome = Number(item.offline_income || 0);
    const onlineIncome = Number(item.online_income || 0);
    const totalIncome = money(offlineIncome + onlineIncome);
    return {
      store_id: Number(item.store_id),
      store_name: item.store_name,
      offline_income: offlineIncome,
      online_income: onlineIncome,
      total_income: totalIncome,
      income: totalIncome,
      rank: index + 1,
    };
  });

  return ranked;
}

function applyStoreRankingVisibility(user, list = []) {
  if (!isStoreOwner(user)) {
    return list;
  }

  const ownStoreId = Number(user.store_id || 0);
  const visibleList = canViewAllStoreRanking(user)
    ? list
    : list.filter((item) => Number(item.store_id) === ownStoreId);
  const canViewSensitiveForAllStores = canViewAllStoreSensitiveAmount(user);

  return visibleList.map((item) => {
    const isOwnStore = Number(item.store_id) === ownStoreId;
    if (canViewSensitiveForAllStores || isOwnStore) {
      return item;
    }

    return {
      ...item,
      offline_income: null,
      online_income: null,
      total_income: null,
      income: null,
    };
  });
}

async function loadPlayShopUtilization(user) {
  const { filter, params } = buildScopedFilter(user, 'o');
  const rows = await query(
    `SELECT
      ps.id AS play_shop_id,
      ps.name AS play_shop_name,
      COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.is_deleted = 0 THEN 1 ELSE 0 END), 0) AS total_orders,
      COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.is_deleted = 0 AND o.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_orders,
      COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.is_deleted = 0 AND o.status IN ('pending_contact', 'processing', 'problem') THEN 1 ELSE 0 END), 0) AS active_orders,
      COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.is_deleted = 0 AND o.status = 'completed' THEN COALESCE(o.revised_amount, o.order_amount) ELSE 0 END), 0) AS completed_income
     FROM play_shops ps
     LEFT JOIN orders o ON o.play_shop_id = ps.id${filter}
     WHERE ps.is_deleted = 0
     GROUP BY ps.id, ps.name
     ORDER BY ps.id DESC`,
    params
  );

  const list = rows.map((item) => {
    const totalOrders = Number(item.total_orders || 0);
    const activeOrders = Number(item.active_orders || 0);
    const completedOrders = Number(item.completed_orders || 0);
    const completedIncome = Number(item.completed_income || 0);
    const utilizationRate = totalOrders > 0 ? Number((activeOrders / totalOrders).toFixed(4)) : 0;
    return {
      play_shop_id: Number(item.play_shop_id),
      play_shop_name: item.play_shop_name,
      total_orders: totalOrders,
      completed_orders: completedOrders,
      active_orders: activeOrders,
      completed_income: completedIncome,
      utilization_rate: utilizationRate,
      utilization_percent: Number((utilizationRate * 100).toFixed(2)),
    };
  });

  const totalPlayShops = list.length;
  const activePlayShops = list.filter((item) => item.active_orders > 0).length;
  const overallRate = totalPlayShops > 0 ? Number((activePlayShops / totalPlayShops).toFixed(4)) : 0;

  return {
    summary: {
      total_play_shops: totalPlayShops,
      active_play_shops: activePlayShops,
      overall_utilization_rate: overallRate,
      overall_utilization_percent: Number((overallRate * 100).toFixed(2)),
    },
    list,
  };
}

async function loadOnlineVsOfflineSummary(user) {
  const onlineStoreFilter = `(LOWER(COALESCE(s.domain_prefix, '')) = 'online' OR LOWER(COALESCE(s.subdomain, '')) = 'online')`;
  const { filter: orderScopeFilter, params: orderScopeParams } = buildScopedFilter(user, 'o');
  const { where: onlineWhere, params: onlineParams } = buildOnlineScope(user);

  const [offlineRows, onlineRows] = await Promise.all([
    query(
      `SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(COALESCE(o.revised_amount, o.order_amount)), 0) AS total_income
       FROM orders o
       LEFT JOIN stores s ON s.id = o.store_id
       WHERE o.is_deleted = 0
         AND o.status = 'completed'
         ${orderScopeFilter}
         AND (s.id IS NULL OR NOT ${onlineStoreFilter})`,
      orderScopeParams
    ),
    query(
      `SELECT
        COALESCE(SUM(segment_orders), 0) AS total_orders,
        COALESCE(SUM(segment_income), 0) AS total_income
       FROM (
         SELECT
           COUNT(*) AS segment_orders,
           COALESCE(SUM(COALESCE(o.revised_amount, o.order_amount)), 0) AS segment_income
         FROM orders o
         LEFT JOIN stores s ON s.id = o.store_id
         WHERE o.is_deleted = 0
           AND o.status = 'completed'
           ${orderScopeFilter}
           AND ${onlineStoreFilter}
         UNION ALL
         SELECT
           COUNT(*) AS segment_orders,
           COALESCE(SUM(oo.order_amount), 0) AS segment_income
         FROM online_orders oo
         WHERE ${onlineWhere}
           AND oo.status = 'completed'
       ) merged`,
      {
        ...orderScopeParams,
        ...onlineParams,
      }
    ),
  ]);

  const offlineOrders = Number(offlineRows[0]?.total_orders || 0);
  const onlineOrders = Number(onlineRows[0]?.total_orders || 0);
  const offlineIncome = Number(offlineRows[0]?.total_income || 0);
  const onlineIncome = Number(onlineRows[0]?.total_income || 0);

  return {
    offline_orders: offlineOrders,
    online_orders: onlineOrders,
    combined_orders: offlineOrders + onlineOrders,
    offline_income: offlineIncome,
    online_income: onlineIncome,
    combined_income: money(offlineIncome + onlineIncome),
  };
}

async function getOverview(req, res) {
  const user = req.user;
  if (!canViewStats(user)) {
    return fail(res, 'Forbidden', 403);
  }
  if (isStoreOwner(user) && !user.store_id) {
    return fail(res, 'Store owner is not bound to a store', 400);
  }

  const { where: offlineWhere, params: offlineParams } = buildOfflineScope(user);
  const { where: onlineWhere, params: onlineParams } = buildOnlineScope(user);

  const [offlineTotalRows, offlineCompletedRows, offlineProblemRows, offlinePendingRows] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM orders o WHERE ${offlineWhere}`, offlineParams),
    query(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(COALESCE(o.revised_amount, o.order_amount)), 0) AS amount,
        COALESCE(SUM(o.store_commission), 0) AS store_commission,
        COALESCE(SUM(o.platform_commission), 0) AS platform_commission,
        COALESCE(SUM(o.play_shop_commission), 0) AS play_shop_commission
       FROM orders o
       WHERE ${offlineWhere} AND o.status = 'completed'`,
      offlineParams
    ),
    query(`SELECT COUNT(*) AS total FROM orders o WHERE ${offlineWhere} AND o.status = 'problem'`, offlineParams),
    query(
      `SELECT COUNT(*) AS total
       FROM orders o
       WHERE ${offlineWhere} AND o.status IN ('pending_contact', 'processing')`,
      offlineParams
    ),
  ]);

  const [onlineTotalRows, onlineCompletedRows, onlinePendingRows] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM online_orders oo WHERE ${onlineWhere}`, onlineParams),
    query(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(oo.order_amount), 0) AS amount,
        COALESCE(SUM(oo.platform_commission), 0) AS platform_commission
       FROM online_orders oo
       WHERE ${onlineWhere} AND oo.status = 'completed'`,
      onlineParams
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM online_orders oo
       WHERE ${onlineWhere} AND oo.status IN ('pending_contact', 'processing')`,
      onlineParams
    ),
  ]);

  const [todayRows, monthRows] = await Promise.all([
    query(
      `SELECT
        COALESCE(SUM(value_amount), 0) AS amount,
        COALESCE(SUM(value_orders), 0) AS total
       FROM (
          SELECT
            SUM(CASE WHEN o.status = 'completed' THEN COALESCE(o.revised_amount, o.order_amount) ELSE 0 END) AS value_amount,
            SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS value_orders
          FROM orders o
          WHERE ${offlineWhere} AND DATE(o.created_at) = CURDATE()
          UNION ALL
          SELECT
            SUM(CASE WHEN oo.status = 'completed' THEN oo.order_amount ELSE 0 END) AS value_amount,
            SUM(CASE WHEN oo.status = 'completed' THEN 1 ELSE 0 END) AS value_orders
          FROM online_orders oo
          WHERE ${onlineWhere} AND DATE(oo.created_at) = CURDATE()
       ) t`,
      {
        ...offlineParams,
        ...onlineParams,
      }
    ),
    query(
      `SELECT
        COALESCE(SUM(value_amount), 0) AS amount
       FROM (
         SELECT SUM(CASE WHEN o.status = 'completed' THEN COALESCE(o.revised_amount, o.order_amount) ELSE 0 END) AS value_amount
         FROM orders o
         WHERE ${offlineWhere}
           AND DATE_FORMAT(o.created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
         UNION ALL
         SELECT SUM(CASE WHEN oo.status = 'completed' THEN oo.order_amount ELSE 0 END) AS value_amount
         FROM online_orders oo
         WHERE ${onlineWhere}
           AND DATE_FORMAT(oo.created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       ) t`,
      {
        ...offlineParams,
        ...onlineParams,
      }
    ),
  ]);

  const [peakRows, peakCompareRows, playShopUtilization, fullStoreRanking, onlineOfflineSummary] = await Promise.all([
    query(
    `SELECT
      hour_value,
      SUM(total_count) AS total_count
     FROM (
       SELECT HOUR(o.created_at) AS hour_value, SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS total_count
       FROM orders o
       WHERE ${offlineWhere}
         AND DATE(o.created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY HOUR(o.created_at)
       UNION ALL
       SELECT HOUR(oo.created_at) AS hour_value, SUM(CASE WHEN oo.status = 'completed' THEN 1 ELSE 0 END) AS total_count
       FROM online_orders oo
       WHERE ${onlineWhere}
         AND DATE(oo.created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY HOUR(oo.created_at)
     ) merged
     GROUP BY hour_value
     ORDER BY total_count DESC, hour_value DESC
     LIMIT 10`,
    {
      ...offlineParams,
      ...onlineParams,
    }
  ),
    query(
      `SELECT
        hour_value,
        SUM(offline_count) AS offline_count,
        SUM(online_count) AS online_count
       FROM (
         SELECT
           HOUR(o.created_at) AS hour_value,
           SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS offline_count,
           0 AS online_count
         FROM orders o
         WHERE ${offlineWhere}
           AND DATE(o.created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY HOUR(o.created_at)
         UNION ALL
         SELECT
           HOUR(oo.created_at) AS hour_value,
           0 AS offline_count,
           SUM(CASE WHEN oo.status = 'completed' THEN 1 ELSE 0 END) AS online_count
         FROM online_orders oo
         WHERE ${onlineWhere}
           AND DATE(oo.created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY HOUR(oo.created_at)
       ) merged
       GROUP BY hour_value
       ORDER BY hour_value ASC`,
      {
        ...offlineParams,
        ...onlineParams,
      }
    ),
    loadPlayShopUtilization(user),
    buildStoreRankingList(),
    loadOnlineVsOfflineSummary(user),
  ]);

  const storeRanking = applyStoreRankingVisibility(user, fullStoreRanking);

  const offlineIncome = Number(onlineOfflineSummary.offline_income || 0);
  const onlineIncome = Number(onlineOfflineSummary.online_income || 0);
  const offlineCompletedOrders = Number(onlineOfflineSummary.offline_orders || 0);
  const onlineCompletedOrders = Number(onlineOfflineSummary.online_orders || 0);
  const effectiveOrders = Number(onlineOfflineSummary.combined_orders || 0);
  const rawTotalOrders = Number(offlineTotalRows[0]?.total || 0) + Number(onlineTotalRows[0]?.total || 0);
  const combinedIncome = Number(onlineOfflineSummary.combined_income || 0);
  const totalStoreShare = Number(offlineCompletedRows[0]?.store_commission || 0);
  const totalPlatformShare =
    Number(offlineCompletedRows[0]?.platform_commission || 0) +
    Number(onlineCompletedRows[0]?.platform_commission || 0);
  const totalShopShare = Number(offlineCompletedRows[0]?.play_shop_commission || 0);
  const ownStoreRank = fullStoreRanking.find((item) => Number(item.store_id) === Number(user.store_id || 0));
  const storeRank = isStoreOwner(user) ? Number(ownStoreRank?.rank || 0) || null : null;
  const playStoreUtilizationList = playShopUtilization.list.map((item) => ({
    play_shop_id: item.play_shop_id,
    play_shop_name: item.play_shop_name,
    name: item.play_shop_name,
    total_orders: item.total_orders,
    completed_orders: item.completed_orders,
    active_orders: item.active_orders,
    completed_income: item.completed_income,
    utilization_rate: item.utilization_rate,
    utilization_percent: item.utilization_percent,
    count: item.active_orders,
    value: item.active_orders,
    usage: item.active_orders,
    utilization: item.utilization_percent,
  }));
  const peakHours = peakRows.map((item) => ({
    hour: `${String(item.hour_value).padStart(2, '0')}:00`,
    count: Number(item.total_count || 0),
  }));
  const peakCompare = peakCompareRows.map((item) => ({
    hour: `${String(item.hour_value).padStart(2, '0')}:00`,
    offline_count: Number(item.offline_count || 0),
    online_count: Number(item.online_count || 0),
  }));

  return ok(
    res,
    {
      total_orders: effectiveOrders,
      completed_orders: effectiveOrders,
      completed_amount: combinedIncome,
      problem_orders: Number(offlineProblemRows[0]?.total || 0),
      pending_orders: Number(offlinePendingRows[0]?.total || 0) + Number(onlinePendingRows[0]?.total || 0),
      total_store_share: totalStoreShare,
      total_platform_share: totalPlatformShare,
      total_shop_share: totalShopShare,
      total_commission: totalPlatformShare,
      own_total_share: isStoreOwner(user) ? totalStoreShare : 0,
      today_order_count: Number(todayRows[0]?.total || 0),
      today_income: Number(todayRows[0]?.amount || 0),
      month_income: Number(monthRows[0]?.amount || 0),
      offline_orders: offlineCompletedOrders,
      online_orders: onlineCompletedOrders,
      combined_orders: effectiveOrders,
      offline_income: offlineIncome,
      online_income: onlineIncome,
      combined_income: combinedIncome,
      effective_orders: effectiveOrders,
      raw_total_orders: rawTotalOrders,
      income_compare: {
        online_income: onlineIncome,
        offline_income: offlineIncome,
        total_income: combinedIncome,
        online_order_count: onlineCompletedOrders,
        offline_order_count: offlineCompletedOrders,
        total_order_count: effectiveOrders,
      },
      store_rank: storeRank,
      store_ranking: storeRanking,
      play_shop_utilization: playShopUtilization,
      play_store_utilization: playStoreUtilizationList,
      peak_hours: peakHours,
      own_peak_hours: peakHours,
      peak_compare: peakCompare,
    },
    'overview fetched'
  );
}

async function getPeakHours(req, res) {
  const user = req.user;
  if (!canViewStats(user)) {
    return fail(res, 'Forbidden', 403);
  }
  if (isStoreOwner(user) && !user.store_id) {
    return fail(res, 'Store owner is not bound to a store', 400);
  }

  const { page, pageSize, limit, offset } = buildPagination(req.query, 20, 100);
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
  const { where: offlineWhere, params: offlineParams } = buildOfflineScope(user);
  const { where: onlineWhere, params: onlineParams } = buildOnlineScope(user);

  const totalRows = await query(
    `SELECT COUNT(*) AS total
     FROM (
       SELECT
         DATE(o.created_at) AS stat_date,
         HOUR(o.created_at) AS stat_hour
       FROM orders o
       WHERE ${offlineWhere}
         AND o.status = 'completed'
         AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       GROUP BY DATE(o.created_at), HOUR(o.created_at)
       UNION
       SELECT
         DATE(oo.created_at) AS stat_date,
         HOUR(oo.created_at) AS stat_hour
       FROM online_orders oo
       WHERE ${onlineWhere}
         AND oo.status = 'completed'
         AND oo.created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
       GROUP BY DATE(oo.created_at), HOUR(oo.created_at)
     ) buckets`,
    {
      days,
      ...offlineParams,
      ...onlineParams,
    }
  );

  const list = await query(
    `SELECT
      DATE_FORMAT(base.stat_date, '%Y-%m-%d') AS stat_date,
      base.stat_hour,
      base.offline_orders,
      base.online_orders,
      base.total_orders,
      base.offline_amount,
      base.online_amount,
      base.total_amount
     FROM (
       SELECT
         stat_date,
         stat_hour,
         SUM(offline_orders) AS offline_orders,
         SUM(online_orders) AS online_orders,
         SUM(total_orders) AS total_orders,
         SUM(offline_amount) AS offline_amount,
         SUM(online_amount) AS online_amount,
         SUM(total_amount) AS total_amount
       FROM (
         SELECT
            DATE(o.created_at) AS stat_date,
            HOUR(o.created_at) AS stat_hour,
            COUNT(*) AS offline_orders,
            0 AS online_orders,
            COUNT(*) AS total_orders,
            COALESCE(SUM(COALESCE(o.revised_amount, o.order_amount)), 0) AS offline_amount,
            0 AS online_amount,
            COALESCE(SUM(COALESCE(o.revised_amount, o.order_amount)), 0) AS total_amount
           FROM orders o
          WHERE ${offlineWhere}
            AND o.status = 'completed'
            AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
          GROUP BY DATE(o.created_at), HOUR(o.created_at)
          UNION ALL
          SELECT
            DATE(oo.created_at) AS stat_date,
            HOUR(oo.created_at) AS stat_hour,
            0 AS offline_orders,
            COUNT(*) AS online_orders,
            COUNT(*) AS total_orders,
            0 AS offline_amount,
            COALESCE(SUM(oo.order_amount), 0) AS online_amount,
            COALESCE(SUM(oo.order_amount), 0) AS total_amount
          FROM online_orders oo
          WHERE ${onlineWhere}
            AND oo.status = 'completed'
            AND oo.created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
          GROUP BY DATE(oo.created_at), HOUR(oo.created_at)
        ) merged
       GROUP BY stat_date, stat_hour
     ) base
     ORDER BY base.total_amount DESC, base.total_orders DESC, base.stat_date DESC, base.stat_hour DESC
     LIMIT ${limit} OFFSET ${offset}`,
    {
      days,
      ...offlineParams,
      ...onlineParams,
    }
  );

  return ok(
    res,
    {
      list,
      total: Number(totalRows[0]?.total || 0),
      page,
      pageSize,
      days,
    },
    'peak hours fetched'
  );
}

async function getStoreRanking(req, res) {
  const user = req.user;
  if (!canViewStats(user)) {
    return fail(res, 'Forbidden', 403);
  }
  const { page, pageSize, limit, offset } = buildPagination(req.query, 20, 200);
  const fullStoreRanking = await buildStoreRankingList();
  const list = applyStoreRankingVisibility(user, fullStoreRanking);

  const total = list.length;
  const paged = list.slice(offset, offset + limit);

  return ok(
    res,
    {
      list: paged,
      total,
      page,
      pageSize,
    },
    'store ranking fetched'
  );
}

async function getPlayShopUtilization(req, res) {
  const user = req.user;
  if (!canViewStats(user)) {
    return fail(res, 'Forbidden', 403);
  }
  if (isStoreOwner(user) && !user.store_id) {
    return fail(res, 'Store owner is not bound to a store', 400);
  }

  const data = await loadPlayShopUtilization(user);
  return ok(res, data, 'play shop utilization fetched');
}

async function getOnlineVsOffline(req, res) {
  const user = req.user;
  if (!canViewStats(user)) {
    return fail(res, 'Forbidden', 403);
  }
  if (isStoreOwner(user) && !user.store_id) {
    return fail(res, 'Store owner is not bound to a store', 400);
  }

  const summary = await loadOnlineVsOfflineSummary(user);

  return ok(
    res,
    {
      offline_orders: summary.offline_orders,
      online_orders: summary.online_orders,
      combined_orders: summary.combined_orders,
      offline_income: summary.offline_income,
      online_income: summary.online_income,
      combined_income: summary.combined_income,
    },
    'online vs offline fetched'
  );
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

module.exports = {
  getOverview,
  getPeakHours,
  getStoreRanking,
  getPlayShopUtilization,
  getOnlineVsOffline,
};

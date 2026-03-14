const { query, transaction } = require('../config/db');
const {
  hasAnyRole,
  hasRole,
  hasFieldPermission,
  hasPagePermission,
  hasScopePermission,
  VIEW_SCOPE_KEYS,
} = require('../middleware/permissions');
const { buildPagination, ok, fail } = require('../utils/http');
const { writeOperationLog } = require('../utils/operationLog');

const ADMIN_ORDER_NOTIFICATION_TYPES_SQL = `'order_created','online_order_created'`;
const STORE_OWNER_ORDER_NOTIFICATION_TYPES_SQL = `'order_completed','problem_order_completed'`;

function parsePositiveInt(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  return id;
}

function buildOrderLocator(row = {}) {
  const orderId = parsePositiveInt(row.order_id);
  const orderType = String(
    row.order_type || (String(row.type || '').startsWith('online_') ? 'online_order' : 'order')
  );
  const orderApiPath = orderId
    ? orderType === 'online_order'
      ? `/api/online-orders/${orderId}`
      : `/api/orders/${orderId}`
    : null;

  return {
    order_id: orderId,
    order_type: orderType,
    order_api_path: orderApiPath,
  };
}

function withOrderLocator(row = {}) {
  return {
    ...row,
    ...buildOrderLocator(row),
  };
}

function applyNotificationFieldPermissions(user, row) {
  if (!row || !user) {
    return row;
  }

  const next = { ...row };
  const canViewSensitiveDetail = hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS);

  if (
    !hasFieldPermission(user, 'orders:contact') ||
    !hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT) ||
    !canViewSensitiveDetail
  ) {
    next.source_contact = null;
    next.contact = null;
  }
  if (hasRole(user, 'store_owner') && Number(next.is_anonymous || 0) === 1) {
    next.source_contact = null;
    next.contact = null;
  }
  if (!hasFieldPermission(user, 'orders:info')) {
    next.source_order_info = null;
    next.order_info = null;
  }
  if (!hasFieldPermission(user, 'orders:source_store')) {
    next.store_id = null;
    next.source_store_name = null;
    next.source_store = null;
  }
  if (!hasFieldPermission(user, 'orders:amount') || !canViewSensitiveDetail) {
    next.source_amount = null;
    next.amount = null;
    next.revised_amount = null;
  }
  if (!hasFieldPermission(user, 'orders:problem_remark')) {
    next.problem_remark = null;
    next.remark = null;
  }
  if (!hasFieldPermission(user, 'orders:created_at')) {
    next.source_order_time = null;
    next.order_time = null;
    next.created_at = null;
    next.notified_at = null;
  }

  return next;
}

function canReadNotifications(user) {
  if (!hasAnyRole(user, ['super_admin', 'admin', 'customer_service', 'store_owner'])) {
    return false;
  }

  return hasPagePermission(user, 'notifications:view');
}

function canReadOrderNotifications(user) {
  return canReadNotifications(user) && hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE);
}

function buildNotificationScope(user, options = {}) {
  const reminderOnly = options.reminderOnly === true;
  const filters = ['1=1'];
  const params = {};

  if (hasAnyRole(user, ['super_admin', 'admin', 'customer_service'])) {
    if (reminderOnly) {
      filters.push(`n.type IN (${ADMIN_ORDER_NOTIFICATION_TYPES_SQL})`);
      filters.push(`(
        (n.type LIKE 'online_%' AND (oo.id IS NULL OR oo.is_deleted = 0))
        OR
        (n.type NOT LIKE 'online_%' AND (o.id IS NULL OR o.is_deleted = 0))
      )`);
    }
    return { ok: true, filters, params };
  }

  if (hasRole(user, 'store_owner')) {
    if (reminderOnly && !canReadOrderNotifications(user)) {
      filters.push('1=0');
      return { ok: true, filters, params };
    }

    const scopeStoreId = Number(user.store_id || 0);
    if (!scopeStoreId) {
      return { ok: false, statusCode: 400, error: '网吧老板未绑定门店' };
    }

    filters.push('COALESCE(n.store_id, o.store_id, oo.store_id) = :scope_store_id');
    filters.push(`n.type IN (${STORE_OWNER_ORDER_NOTIFICATION_TYPES_SQL})`);
    params.scope_store_id = scopeStoreId;
    return { ok: true, filters, params };
  }

  return { ok: false, statusCode: 403, error: '无权限' };
}

function buildNotificationInClause(ids = [], keyPrefix = 'id') {
  const params = {};
  const placeholders = ids.map((id, index) => {
    const key = `${keyPrefix}_${index}`;
    params[key] = Number(id);
    return `:${key}`;
  });

  return {
    placeholders: placeholders.join(','),
    params,
  };
}

function normalizeNotificationIds(body = {}) {
  const candidates = [
    body.ids,
    body.notification_ids,
    body.notificationIds,
    body.notify_ids,
    body.notifyIds,
    body.id ? [body.id] : null,
    body.notification_id ? [body.notification_id] : null,
    body.notificationId ? [body.notificationId] : null,
    body.notify_id ? [body.notify_id] : null,
    body.notifyId ? [body.notifyId] : null,
  ];

  const merged = [];
  candidates.forEach((list) => {
    if (Array.isArray(list)) {
      merged.push(...list);
    }
  });

  return Array.from(
    new Set(
      merged
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  );
}

function normalizeOrderIds(body = {}) {
  const candidates = [
    body.order_ids,
    body.orderIds,
    body.orders,
    body.order_id ? [body.order_id] : null,
    body.orderId ? [body.orderId] : null,
  ];

  const merged = [];
  candidates.forEach((list) => {
    if (Array.isArray(list)) {
      merged.push(...list);
    }
  });

  return Array.from(
    new Set(
      merged
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  );
}

async function listNotifications(req, res) {
  if (!canReadNotifications(req.user)) {
    return fail(res, '无权限', 403);
  }

  const { page, pageSize, limit, offset } = buildPagination(req.query, 20, 100);
  const unreadOnly = String(req.query.unread || '') === '1';

  const scope = buildNotificationScope(req.user, { reminderOnly: false });
  if (!scope.ok) {
    return fail(res, scope.error, scope.statusCode || 403);
  }

  const params = {
    user_id: Number(req.user.id),
    ...scope.params,
  };
  const filters = [...scope.filters];
  if (unreadOnly) {
    filters.push('nr.user_id IS NULL');
  }

  const where = filters.join(' AND ');

  const totalRows = await query(
    `SELECT COUNT(*) AS total
     FROM notifications n
     LEFT JOIN orders o ON o.id = n.order_id AND n.type NOT LIKE 'online_%'
     LEFT JOIN online_orders oo ON oo.id = n.order_id AND n.type LIKE 'online_%'
     LEFT JOIN notification_reads nr
       ON nr.user_id = :user_id AND nr.order_id = n.order_id
     WHERE ${where}`,
    params
  );

  const list = await query(
    `SELECT
      n.id,
      n.id AS notification_id,
      n.type,
      n.title,
      n.content,
      n.order_id,
      CASE WHEN n.type LIKE 'online_%' THEN 'online_order' ELSE 'order' END AS order_type,
      COALESCE(n.store_id, o.store_id, oo.store_id) AS store_id,
      COALESCE(n.source_store_name, s.name, so.name) AS source_store_name,
      COALESCE(n.source_store_name, s.name, so.name) AS source_store,
      COALESCE(n.source_contact, o.contact, oo.contact) AS source_contact,
      COALESCE(n.source_contact, o.contact, oo.contact) AS contact,
      CASE
        WHEN o.id IS NOT NULL THEN o.is_anonymous
        ELSE 0
      END AS is_anonymous,
      COALESCE(n.source_order_info, o.order_info, oo.order_info) AS source_order_info,
      COALESCE(n.source_order_info, o.order_info, oo.order_info) AS order_info,
      COALESCE(
        CASE
          WHEN o.id IS NOT NULL THEN COALESCE(o.revised_amount, o.order_amount)
          WHEN oo.id IS NOT NULL THEN oo.order_amount
          ELSE NULL
        END,
        n.source_amount
      ) AS source_amount,
      COALESCE(
        CASE
          WHEN o.id IS NOT NULL THEN COALESCE(o.revised_amount, o.order_amount)
          WHEN oo.id IS NOT NULL THEN oo.order_amount
          ELSE NULL
        END,
        n.source_amount
      ) AS amount,
      CASE
        WHEN o.id IS NOT NULL THEN o.revised_amount
        ELSE NULL
      END AS revised_amount,
      CASE
        WHEN o.id IS NOT NULL THEN o.problem_remark
        ELSE NULL
      END AS problem_remark,
      CASE
        WHEN o.id IS NOT NULL THEN o.problem_remark
        ELSE NULL
      END AS remark,
      COALESCE(n.source_order_time, o.created_at, oo.created_at) AS source_order_time,
      COALESCE(n.source_order_time, o.created_at, oo.created_at) AS order_time,
      n.created_at,
      CASE
        WHEN n.order_id IS NOT NULL AND nr.user_id IS NOT NULL THEN 1
        ELSE 0
      END AS is_read,
      nr.read_at
     FROM notifications n
     LEFT JOIN orders o ON o.id = n.order_id AND n.type NOT LIKE 'online_%'
     LEFT JOIN online_orders oo ON oo.id = n.order_id AND n.type LIKE 'online_%'
     LEFT JOIN stores s ON s.id = COALESCE(n.store_id, o.store_id)
     LEFT JOIN stores so ON so.id = oo.store_id
     LEFT JOIN notification_reads nr
       ON nr.user_id = :user_id AND nr.order_id = n.order_id
     WHERE ${where}
     ORDER BY n.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return ok(
    res,
    {
      list: list.map((item) => applyNotificationFieldPermissions(req.user, withOrderLocator(item))),
      total: Number(totalRows[0]?.total || 0),
      page,
      pageSize,
    },
    '通知列表获取成功'
  );
}

async function markNotificationsRead(req, res) {
  if (!canReadOrderNotifications(req.user)) {
    return fail(res, '无权限', 403);
  }

  const scope = buildNotificationScope(req.user, { reminderOnly: true });
  if (!scope.ok) {
    return fail(res, scope.error, scope.statusCode || 403);
  }

  const body = req.body || {};
  const orderIds = normalizeOrderIds(body);
  const notificationIds = normalizeNotificationIds(body);
  const isReadAllRequest = /read-all/i.test(String(req.path || '')) || String(body.all || '') === '1';

  if (!isReadAllRequest && orderIds.length === 0 && notificationIds.length === 0) {
    return fail(res, '必须提供 order_id', 400);
  }

  const userId = Number(req.user.id);
  let readOrderIds = [];
  let readTargets = [];
  await transaction(async (conn) => {
    const filters = [...scope.filters];
    const params = { ...scope.params };

    filters.push('n.order_id IS NOT NULL');

    if (orderIds.length) {
      const inClause = buildNotificationInClause(orderIds, 'order_id');
      filters.push(`n.order_id IN (${inClause.placeholders})`);
      Object.assign(params, inClause.params);
    } else if (notificationIds.length) {
      const inClause = buildNotificationInClause(notificationIds, 'notification_id');
      filters.push(`n.id IN (${inClause.placeholders})`);
      Object.assign(params, inClause.params);
    }

    const [rows] = await conn.execute(
      `SELECT
        MIN(n.id) AS anchor_notification_id,
        n.order_id,
        CASE
          WHEN MAX(CASE WHEN n.type LIKE 'online_%' THEN 1 ELSE 0 END) > 0 THEN 'online_order'
          ELSE 'order'
        END AS order_type
       FROM notifications n
       LEFT JOIN orders o ON o.id = n.order_id AND n.type NOT LIKE 'online_%'
       LEFT JOIN online_orders oo ON oo.id = n.order_id AND n.type LIKE 'online_%'
       WHERE ${filters.join(' AND ')}
       GROUP BY n.order_id`,
      params
    );

    readOrderIds = rows
      .map((item) => Number(item.order_id))
      .filter((item) => Number.isFinite(item) && item > 0);
    readTargets = rows
      .map((item) => withOrderLocator(item))
      .filter((item) => Number.isFinite(Number(item.order_id)) && Number(item.order_id) > 0);

    for (const item of rows) {
      const orderId = Number(item.order_id);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        continue;
      }
      const anchorNotificationId = Number(item.anchor_notification_id || orderId);
      await conn.execute(
        `INSERT IGNORE INTO notification_reads (notification_id, user_id, order_id, read_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [anchorNotificationId, userId, orderId]
      );
    }
  });

  await writeOperationLog(req, {
    action: 'notifications.read',
    detail: `标记提醒已读：${readOrderIds.length}条订单提醒`,
    target_type: 'order',
    target_id: readOrderIds.join(','),
    after: { order_ids: readOrderIds, targets: readTargets },
  });

  return ok(res, { order_ids: readOrderIds, targets: readTargets }, '提醒已标记为已读');
}

async function listOrderNotifications(req, res) {
  if (!canReadOrderNotifications(req.user)) {
    return fail(res, '无权限', 403);
  }

  const scope = buildNotificationScope(req.user, { reminderOnly: true });
  if (!scope.ok) {
    return fail(res, scope.error, scope.statusCode || 403);
  }

  const { page, pageSize, limit, offset } = buildPagination(req.query, 20, 100);

  const params = {
    user_id: Number(req.user.id),
    ...scope.params,
  };
  const filters = [...scope.filters, 'nr.user_id IS NULL'];
  filters.push('n.order_id IS NOT NULL');
  const where = filters.join(' AND ');

  const totalRows = await query(
    `SELECT COUNT(*) AS total
     FROM notifications n
     LEFT JOIN orders o ON o.id = n.order_id AND n.type NOT LIKE 'online_%'
     LEFT JOIN online_orders oo ON oo.id = n.order_id AND n.type LIKE 'online_%'
     LEFT JOIN notification_reads nr
       ON nr.user_id = :user_id AND nr.order_id = n.order_id
     WHERE ${where}`,
    params
  );

  const list = await query(
    `SELECT
      n.id AS id,
      n.id AS notification_id,
      n.order_id,
      CASE WHEN n.type LIKE 'online_%' THEN 'online_order' ELSE 'order' END AS order_type,
      n.type,
      COALESCE(n.store_id, o.store_id, oo.store_id) AS store_id,
      COALESCE(n.source_store_name, s.name, so.name) AS source_store_name,
      COALESCE(n.source_store_name, s.name, so.name) AS source_store,
      COALESCE(n.source_contact, o.contact, oo.contact) AS source_contact,
      COALESCE(n.source_contact, o.contact, oo.contact) AS contact,
      CASE
        WHEN o.id IS NOT NULL THEN o.is_anonymous
        ELSE 0
      END AS is_anonymous,
      COALESCE(n.source_order_info, o.order_info, oo.order_info) AS source_order_info,
      COALESCE(n.source_order_info, o.order_info, oo.order_info) AS order_info,
      COALESCE(
        CASE
          WHEN o.id IS NOT NULL THEN COALESCE(o.revised_amount, o.order_amount)
          WHEN oo.id IS NOT NULL THEN oo.order_amount
          ELSE NULL
        END,
        n.source_amount
      ) AS source_amount,
      COALESCE(
        CASE
          WHEN o.id IS NOT NULL THEN COALESCE(o.revised_amount, o.order_amount)
          WHEN oo.id IS NOT NULL THEN oo.order_amount
          ELSE NULL
        END,
        n.source_amount
      ) AS amount,
      CASE
        WHEN o.id IS NOT NULL THEN o.revised_amount
        ELSE NULL
      END AS revised_amount,
      CASE
        WHEN o.id IS NOT NULL THEN o.problem_remark
        ELSE NULL
      END AS problem_remark,
      CASE
        WHEN o.id IS NOT NULL THEN o.problem_remark
        ELSE NULL
      END AS remark,
      COALESCE(n.source_order_time, o.created_at, oo.created_at, n.created_at) AS order_time,
      n.created_at AS created_at,
      n.created_at AS notified_at
     FROM notifications n
     LEFT JOIN orders o ON o.id = n.order_id AND n.type NOT LIKE 'online_%'
     LEFT JOIN online_orders oo ON oo.id = n.order_id AND n.type LIKE 'online_%'
     LEFT JOIN stores s ON s.id = COALESCE(n.store_id, o.store_id)
     LEFT JOIN stores so ON so.id = oo.store_id
     LEFT JOIN notification_reads nr
       ON nr.user_id = :user_id AND nr.order_id = n.order_id
     WHERE ${where}
     ORDER BY COALESCE(n.source_order_time, n.created_at) DESC, n.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return ok(
    res,
    {
      list: list.map((item) => applyNotificationFieldPermissions(req.user, withOrderLocator(item))),
      total: Number(totalRows[0]?.total || 0),
      page,
      pageSize,
    },
    '订单提醒获取成功'
  );
}

module.exports = {
  listNotifications,
  markNotificationsRead,
  listOrderNotifications,
};

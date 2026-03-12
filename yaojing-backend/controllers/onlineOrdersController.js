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
const {
  STORE_SOURCE_NOT_FOUND_MESSAGE,
  resolveStore,
} = require('../utils/storeResolver');

const DEFAULT_PLATFORM_RATE = Number(process.env.DEFAULT_PLATFORM_RATE || 0.05);
const ORDER_STATUSES = ['pending_contact', 'processing', 'problem', 'completed', 'cancelled'];

function normalizeStatus(status) {
  const raw = String(status || '').trim();
  if (!raw) {
    return '';
  }
  if (raw === 'pending') {
    return 'pending_contact';
  }
  if (raw === 'confirmed') {
    return 'completed';
  }
  return raw;
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function makeOrderNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `ONL${yyyy}${mm}${dd}${hh}${mi}${ss}${ms}${rand}`;
}

function canReadOnlineOrders(user) {
  return (
    hasAnyRole(user, ['super_admin', 'admin', 'store_owner', 'customer_service', 'finance']) &&
    hasPagePermission(user, 'online_user_orders:view')
  );
}

function canCreateOnlineOrders(user) {
  return hasAnyRole(user, ['super_admin', 'admin', 'customer_service']);
}

function applyOnlineOrderFieldPermissions(user, order) {
  if (!order || !user) {
    return order;
  }

  const row = { ...order };
  const canViewSensitiveDetail = hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS);

  if (
    !hasFieldPermission(user, 'orders:contact') ||
    !hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT) ||
    !canViewSensitiveDetail
  ) {
    row.contact = null;
  }
  if (!hasFieldPermission(user, 'orders:info')) {
    row.order_info = null;
  }
  if (!hasFieldPermission(user, 'orders:source_store')) {
    row.store_id = null;
    row.store_name = null;
  }
  if (!hasFieldPermission(user, 'orders:amount')) {
    row.order_amount = null;
  }
  if (!hasFieldPermission(user, 'orders:platform_commission')) {
    row.platform_commission = null;
  }
  if (!hasFieldPermission(user, 'orders:status')) {
    row.status = null;
  }
  if (!hasFieldPermission(user, 'orders:created_at')) {
    row.created_at = null;
    row.updated_at = null;
  }
  if (!hasFieldPermission(user, 'orders:deleted_status')) {
    row.is_deleted = null;
  }

  return row;
}

async function listOnlineOrders(req, res) {
  if (!canReadOnlineOrders(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const { page, pageSize, limit, offset } = buildPagination(req.query, 20, 100);
  const { keyword, status, start_time, end_time, store_id } = req.query;

  const filters = ['oo.is_deleted = 0'];
  const params = {};

  if (hasRole(req.user, 'store_owner')) {
    if (!hasScopePermission(req.user, VIEW_SCOPE_KEYS.ORDERS_SELF_STORE)) {
      return fail(res, 'Forbidden', 403);
    }
    if (!req.user.store_id) {
      return fail(res, 'Store owner is not bound to a store', 400);
    }
    filters.push('oo.store_id = :scope_store_id');
    params.scope_store_id = Number(req.user.store_id);
  } else if (store_id) {
    filters.push('oo.store_id = :store_id');
    params.store_id = Number(store_id);
  }

  if (status) {
    const normalized = normalizeStatus(status);
    if (!ORDER_STATUSES.includes(normalized)) {
      return fail(res, 'Invalid status', 400);
    }
    filters.push('oo.status = :status');
    params.status = normalized;
  }

  if (keyword) {
    filters.push('(oo.order_no LIKE :keyword OR oo.contact LIKE :keyword OR oo.order_info LIKE :keyword OR s.name LIKE :keyword)');
    params.keyword = `%${String(keyword)}%`;
  }

  if (start_time) {
    filters.push('oo.created_at >= :start_time');
    params.start_time = start_time;
  }

  if (end_time) {
    filters.push('oo.created_at <= :end_time');
    params.end_time = end_time;
  }

  const where = filters.join(' AND ');
  const totalRows = await query(
    `SELECT COUNT(*) AS total
     FROM online_orders oo
     LEFT JOIN stores s ON s.id = oo.store_id
     WHERE ${where}`,
    params
  );

  const list = await query(
    `SELECT
      oo.id,
      oo.order_no,
      oo.store_id,
      s.name AS store_name,
      oo.contact,
      oo.order_info,
      oo.order_amount,
      oo.status,
      oo.platform_rate,
      oo.platform_commission,
      oo.created_by,
      oo.created_at,
      oo.updated_at
     FROM online_orders oo
     LEFT JOIN stores s ON s.id = oo.store_id
     WHERE ${where}
     ORDER BY oo.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return ok(
    res,
    {
      list: list.map((item) => applyOnlineOrderFieldPermissions(req.user, item)),
      total: Number(totalRows[0]?.total || 0),
      page,
      pageSize,
    },
    'online orders fetched'
  );
}

async function createOnlineOrder(req, res) {
  if (req.user && !canCreateOnlineOrders(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const resolvedStore = await resolveStore(req);
  if (!resolvedStore.ok || !resolvedStore.store) {
    return fail(res, resolvedStore.error || STORE_SOURCE_NOT_FOUND_MESSAGE, 400);
  }
  const store = resolvedStore.store;

  const contact = String(req.body?.contact || req.body?.customer_contact || '').trim();
  const orderInfo = String(req.body?.order_info || req.body?.package_name || 'online-order').trim();
  const amount = Number(req.body?.order_amount);
  const status = normalizeStatus(req.body?.status || 'pending_contact');
  const platformRate = Number.isFinite(Number(req.body?.platform_rate))
    ? Number(req.body.platform_rate)
    : DEFAULT_PLATFORM_RATE;

  if (!contact || !orderInfo || !Number.isFinite(amount) || amount <= 0) {
    return fail(res, 'Missing required fields', 400);
  }
  if (!ORDER_STATUSES.includes(status)) {
    return fail(res, 'Invalid status', 400);
  }

  let insertedId = 0;
  await transaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO online_orders
       (order_no, store_id, contact, order_info, order_amount, status, platform_rate, platform_commission, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        makeOrderNo(),
        Number(store.id),
        contact,
        orderInfo,
        amount,
        status,
        platformRate,
        money(amount * platformRate),
        req.user?.id ? Number(req.user.id) : null,
      ]
    );
    insertedId = Number(result.insertId);

    await conn.execute(
      `INSERT INTO notifications
      (
        type,
        title,
        content,
        order_id,
        store_id,
        source_store_name,
        source_contact,
        source_order_info,
        source_amount,
        source_order_time
      )
      VALUES ('online_order_created', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'new online order',
        `online order ${insertedId} created`,
        insertedId,
        Number(store.id),
        store.name || null,
        contact,
        orderInfo,
        money(amount),
        new Date(),
      ]
    );
  });

  const rows = await query(
    `SELECT
      oo.id,
      oo.order_no,
      oo.store_id,
      s.name AS store_name,
      oo.contact,
      oo.order_info,
      oo.order_amount,
      oo.status,
      oo.platform_rate,
      oo.platform_commission,
      oo.created_by,
      oo.created_at,
      oo.updated_at
     FROM online_orders oo
     LEFT JOIN stores s ON s.id = oo.store_id
     WHERE oo.id = :id
     LIMIT 1`,
    { id: insertedId }
  );
  const row = rows[0] || null;

  await writeOperationLog(req, {
    action: 'online_orders.create',
    detail: `新增线上订单 ${row?.order_no || insertedId}`,
    target_type: 'online_order',
    target_id: insertedId,
    after: row,
  });

  return ok(res, applyOnlineOrderFieldPermissions(req.user, row), 'online order created');
}

module.exports = {
  listOnlineOrders,
  createOnlineOrder,
};


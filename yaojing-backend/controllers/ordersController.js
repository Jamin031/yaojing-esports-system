const { query, transaction } = require('../config/db');
const {
  hasAnyRole,
  hasRole,
  hasPagePermission,
  hasButtonPermission,
  hasFieldPermission,
  hasScopePermission,
  VIEW_SCOPE_KEYS,
} = require('../middleware/permissions');
const { buildPagination, ok, fail } = require('../utils/http');
const { getClientIp, writeOperationLog } = require('../utils/operationLog');
const {
  STORE_SOURCE_NOT_FOUND_MESSAGE,
  resolveStore,
  isOnlineStore,
} = require('../utils/storeResolver');

const DEFAULT_PLATFORM_RATE = Number(process.env.DEFAULT_PLATFORM_RATE || 0.05);
const ORDER_STATUSES = ['pending_contact', 'processing', 'problem', 'completed', 'cancelled'];
const STORE_OWNER_VISIBLE_STATUSES = ['problem', 'completed'];
const ORDER_ACCESS_ROLES = Object.freeze(['super_admin', 'admin', 'customer_service', 'finance', 'store_owner']);
const ANONYMOUS_IDENTITY_VISIBLE_ROLES = Object.freeze(['super_admin', 'admin', 'finance', 'customer_service']);
const ANONYMOUS_IDENTITY_VISIBLE_ROLE_SET = new Set(ANONYMOUS_IDENTITY_VISIBLE_ROLES);
const LEGACY_STATUS_MAP = {
  pending: 'pending_contact',
  confirmed: 'completed',
};
const TRUTHY_SET = new Set(['1', 'true', 'yes', 'y', 'on']);
const ORDER_REMARK_INPUT_KEYS = Object.freeze([
  'order_remark',
  'customer_order_remark',
  'customer_remark',
  'remark',
  'customer_note',
  'note',
  'customer_order_note',
  'order_note',
]);
const EXPLICIT_ORDER_REMARK_INPUT_KEYS = Object.freeze([
  'order_remark',
  'customer_order_remark',
  'customer_remark',
  'customer_order_note',
  'order_note',
]);

function normalizeStatus(status) {
  const raw = String(status || '').trim();
  if (!raw) {
    return '';
  }
  return LEGACY_STATUS_MAP[raw] || raw;
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parsePositiveInt(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  return id;
}

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target || {}, key);
}

function pickBodyValueByKeys(body = {}, keys = []) {
  for (const key of keys) {
    if (hasOwn(body, key)) {
      return body[key];
    }
  }
  return undefined;
}

function normalizeNullableString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeAnonymousFlag(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value == null) {
    return 0;
  }
  if (typeof value === 'number') {
    return Number(value) ? 1 : 0;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return 0;
  }
  return TRUTHY_SET.has(text) ? 1 : 0;
}

function makeOrderNo(prefix = 'WB') {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}${yyyy}${mm}${dd}${hh}${mi}${ss}${ms}${rand}`;
}

function buildShares(orderAmount, storeRate, platformRate, playShopRate) {
  const amount = toNumber(orderAmount, 0);
  const sRate = toNumber(storeRate, 0);
  const pRate = toNumber(platformRate, DEFAULT_PLATFORM_RATE);
  const psRate = toNumber(playShopRate, 0);

  const storeCommission = money(amount * sRate);
  const platformCommission = money(amount * pRate);
  const playShopCommission = money(amount * psRate);

  return {
    store_commission: storeCommission,
    platform_commission: platformCommission,
    play_shop_commission: playShopCommission,
    store_share: storeCommission,
    platform_share: platformCommission,
    shop_share: playShopCommission,
    play_shop_share: playShopCommission,
    west_share: platformCommission,
  };
}

function parseOrderIds(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  );
}

function canReadAllOrders(user) {
  return hasAnyRole(user, ['super_admin', 'admin', 'customer_service', 'finance']);
}

function canReadSelfStoreOrders(user) {
  return hasScopePermission(user, VIEW_SCOPE_KEYS.ORDERS_SELF_STORE);
}

function canViewOrderDetailSensitiveFields(user, view = 'detail') {
  const normalizedView = String(view || 'detail').toLowerCase();
  if (normalizedView !== 'detail') {
    return true;
  }
  return hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS);
}

function canViewCustomerContact(user) {
  return hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT);
}

function canViewCustomerNickname(user) {
  return hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME);
}

function canViewCustomerOrderRemark(user) {
  return hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK);
}

function canViewStoreCommission(user) {
  return hasScopePermission(user, VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION);
}

function getPrimaryRole(user) {
  if (!user) {
    return '';
  }
  return String(user.role || (Array.isArray(user.roles) ? user.roles[0] : '') || '').trim();
}

function canCreateOrder(user) {
  if (!user) {
    return true;
  }

  return (
    canOperateOrders(user) &&
    hasAnyRole(user, ['super_admin', 'admin', 'customer_service']) &&
    hasButtonPermission(user, 'orders:create')
  );
}

function canOperateOrders(user) {
  return hasFieldPermission(user, 'orders:operations');
}

function canManageOrderFlow(user) {
  return (
    canOperateOrders(user) &&
    hasAnyRole(user, ['super_admin', 'admin']) &&
    hasButtonPermission(user, 'orders:change_status')
  );
}

function canEditProblem(user) {
  return (
    canOperateOrders(user) &&
    hasAnyRole(user, ['super_admin', 'admin']) &&
    hasButtonPermission(user, 'orders:problem_save')
  );
}

function canEditOrderRemark(user) {
  return (
    hasAnyRole(user, ['super_admin', 'admin', 'customer_service', 'finance', 'store_owner']) &&
    hasButtonPermission(user, 'orders:edit_remark')
  );
}

function canCompleteProblem(user) {
  return canManageOrderFlow(user) && hasButtonPermission(user, 'orders:problem_complete');
}

function canWithdrawProblem(user) {
  return canManageOrderFlow(user) && hasButtonPermission(user, 'orders:problem_withdraw');
}

function canAssignPlayShop(user) {
  return (
    canOperateOrders(user) &&
    hasAnyRole(user, ['super_admin', 'admin']) &&
    hasButtonPermission(user, 'orders:assign_play_store')
  );
}

function canDeleteOrder(user) {
  return (
    canOperateOrders(user) &&
    hasAnyRole(user, ['super_admin', 'admin']) &&
    hasButtonPermission(user, 'orders:delete')
  );
}

function canRestoreOrder(user) {
  return (
    canOperateOrders(user) &&
    hasAnyRole(user, ['super_admin', 'admin']) &&
    hasButtonPermission(user, 'orders:restore')
  );
}

function canBatchUpdateStatus(user) {
  return canManageOrderFlow(user) && hasButtonPermission(user, 'orders:batch_status');
}

function canBatchDeleteOrder(user) {
  return canDeleteOrder(user) && hasButtonPermission(user, 'orders:batch_delete');
}

function canUpdateAmount(user) {
  return canEditProblem(user);
}

function revisedAmountOrNull(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return money(num);
}

function settlementAmount(orderAmount, revisedAmount) {
  return revisedAmountOrNull(revisedAmount) ?? money(toNumber(orderAmount, 0));
}

function settlementAmountFromOrder(order = {}) {
  return settlementAmount(order.order_amount, order.revised_amount);
}

function parseIncomingRevisedAmount(body = {}, fallbackValue = null) {
  const hasRevisedAmount = hasOwn(body, 'revised_amount');
  const hasOrderAmount = hasOwn(body, 'order_amount');
  const raw = hasRevisedAmount ? body.revised_amount : hasOrderAmount ? body.order_amount : fallbackValue;
  return revisedAmountOrNull(raw) ?? revisedAmountOrNull(fallbackValue);
}

function pickIncomingOrderRemark(body = {}, fallbackValue = null) {
  const raw = pickBodyValueByKeys(body, ORDER_REMARK_INPUT_KEYS);
  if (typeof raw === 'undefined') {
    return normalizeNullableString(fallbackValue);
  }
  return normalizeNullableString(raw);
}

function pickExplicitOrderRemark(body = {}, fallbackValue = null) {
  const raw = pickBodyValueByKeys(body, EXPLICIT_ORDER_REMARK_INPUT_KEYS);
  if (typeof raw === 'undefined') {
    return normalizeNullableString(fallbackValue);
  }
  return normalizeNullableString(raw);
}

function pickIncomingProblemRemark(body = {}, fallbackValue = null) {
  const hasProblemRemark = hasOwn(body, 'problem_remark');
  const hasProblemReason = hasOwn(body, 'problem_reason');
  if (!hasProblemRemark && !hasProblemReason) {
    return normalizeNullableString(fallbackValue);
  }
  const raw = hasProblemRemark ? body.problem_remark : body.problem_reason;
  return normalizeNullableString(raw);
}

function pickIncomingCustomerNickname(body = {}, fallbackValue = null) {
  const hasCustomerNickname = hasOwn(body, 'customer_nickname');
  const hasNickname = hasOwn(body, 'nickname');
  const hasCustomerName = hasOwn(body, 'customer_name');
  if (!hasCustomerNickname && !hasNickname && !hasCustomerName) {
    return normalizeNullableString(fallbackValue);
  }
  const raw = hasCustomerNickname ? body.customer_nickname : hasNickname ? body.nickname : body.customer_name;
  return normalizeNullableString(raw);
}

function normalizeOrderRow(order) {
  if (!order) {
    return null;
  }

  const contact = normalizeNullableString(order.contact ?? order.customer_contact);
  const customerNickname = normalizeNullableString(order.customer_nickname ?? order.nickname ?? order.customer_name);
  const orderRemark = normalizeNullableString(order.order_remark ?? order.customer_order_remark);
  const problemRemark = normalizeNullableString(order.problem_remark ?? order.problem_reason);

  return {
    ...order,
    contact,
    customer_contact: contact,
    customer_nickname: customerNickname,
    customer_remark: orderRemark,
    customer_order_remark: orderRemark,
    order_remark: orderRemark,
    remark: orderRemark,
    note: orderRemark,
    problem_order_remark: problemRemark,
    problem_remark: problemRemark,
    is_anonymous: normalizeAnonymousFlag(order.is_anonymous),
    settlement_amount: settlementAmountFromOrder(order),
    amount: settlementAmountFromOrder(order),
  };
}

function toOrderListView(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    order_no: row.order_no,
    store_id: row.store_id,
    store_name: row.store_name,
    order_amount: row.order_amount,
    revised_amount: row.revised_amount,
    settlement_amount: row.settlement_amount,
    customer_nickname: row.customer_nickname,
    customer_contact: row.customer_contact,
    contact: row.contact,
    order_info: row.order_info,
    customer_remark: row.customer_remark,
    customer_order_remark: row.customer_order_remark,
    order_remark: row.order_remark,
    remark: row.remark,
    note: row.note,
    problem_order_remark: row.problem_order_remark,
    problem_remark: row.problem_remark,
    store_rate: row.store_rate,
    store_share: row.store_share,
    store_commission: row.store_commission,
    platform_rate: row.platform_rate,
    platform_share: row.platform_share,
    platform_commission: row.platform_commission,
    west_share: row.west_share,
    shop_id: row.shop_id,
    shop_rate: row.shop_rate,
    shop_share: row.shop_share,
    play_shop_id: row.play_shop_id,
    play_shop_rate: row.play_shop_rate,
    play_shop_share: row.play_shop_share,
    play_shop_commission: row.play_shop_commission,
    play_shop_name: row.play_shop_name,
    amount: row.amount,
    status: row.status,
    created_by: row.created_by,
    confirmed_by: row.confirmed_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_anonymous: row.is_anonymous,
    is_effective: row.is_effective,
    is_deleted: row.is_deleted,
    operation_allowed: row.operation_allowed,
  };
}

function canViewAnonymousIdentity(user, row) {
  if (Number(row?.is_anonymous) !== 1) {
    return true;
  }
  const role = getPrimaryRole(user);
  if (role === 'store_owner') {
    return false;
  }
  return ANONYMOUS_IDENTITY_VISIBLE_ROLE_SET.has(role);
}

function applyOrderFieldPermissions(user, order, options = {}) {
  if (!order) {
    return null;
  }

  const view = String(options.view || 'detail').toLowerCase();
  const row = normalizeOrderRow(order);

  if (!user) {
    return view === 'list' ? toOrderListView(row) : row;
  }

  const isAnonymous = Number(row.is_anonymous) === 1;
  const canViewAnonymousSensitiveFields = canViewAnonymousIdentity(user, row);
  const canViewSensitiveDetail = canViewOrderDetailSensitiveFields(user, view);

  const shouldHideContactByPermission =
    (!hasFieldPermission(user, 'orders:contact') ||
      !canViewCustomerContact(user) ||
      !canViewSensitiveDetail) &&
    !(isAnonymous && canViewAnonymousSensitiveFields);
  const shouldHideContactByAnonymousRule = isAnonymous && !canViewAnonymousSensitiveFields;
  if (shouldHideContactByPermission || shouldHideContactByAnonymousRule) {
    row.contact = null;
    row.customer_contact = null;
  }

  const shouldHideNicknameByPermission =
    (!hasFieldPermission(user, 'orders:customer_nickname') ||
      !canViewCustomerNickname(user) ||
      !canViewSensitiveDetail) &&
    !(isAnonymous && canViewAnonymousSensitiveFields);
  const shouldHideNicknameByAnonymousRule = isAnonymous && !canViewAnonymousSensitiveFields;
  if (shouldHideNicknameByPermission || shouldHideNicknameByAnonymousRule) {
    row.customer_nickname = null;
  }
  if (!hasFieldPermission(user, 'orders:info')) {
    row.order_info = null;
  }
  if (!hasFieldPermission(user, 'orders:amount')) {
    row.order_amount = null;
    row.revised_amount = null;
    row.settlement_amount = null;
    row.amount = null;
  }
  const shouldHideCustomerOrderRemarkByPermission =
    !hasFieldPermission(user, 'orders:order_remark') ||
    !canViewCustomerOrderRemark(user) ||
    !canViewSensitiveDetail;
  if (shouldHideCustomerOrderRemarkByPermission) {
    row.customer_remark = null;
    row.customer_order_remark = null;
    row.order_remark = null;
    row.remark = null;
    row.note = null;
  }
  if (!hasFieldPermission(user, 'orders:problem_remark')) {
    row.problem_order_remark = null;
    row.problem_remark = null;
  }
  if (!hasFieldPermission(user, 'orders:source_store')) {
    row.store_id = null;
    row.store_name = null;
  }
  if (!hasFieldPermission(user, 'orders:assigned_play_shop')) {
    row.shop_id = null;
    row.shop_rate = null;
    row.play_shop_id = null;
    row.play_shop_rate = null;
    row.play_shop_name = null;
  }
  if (!hasFieldPermission(user, 'orders:store_commission') || !canViewStoreCommission(user)) {
    row.store_share = null;
    row.store_commission = null;
  }
  if (!hasFieldPermission(user, 'orders:play_shop_commission')) {
    row.shop_share = null;
    row.play_shop_share = null;
    row.play_shop_commission = null;
  }
  if (!hasFieldPermission(user, 'orders:platform_commission')) {
    row.platform_share = null;
    row.platform_commission = null;
    row.west_share = null;
  }
  if (!hasFieldPermission(user, 'orders:created_at')) {
    row.created_at = null;
    row.updated_at = null;
  }
  if (!hasFieldPermission(user, 'orders:status')) {
    row.status = null;
    row.is_effective = null;
  }
  if (!hasFieldPermission(user, 'orders:deleted_status')) {
    row.is_deleted = null;
  }

  row.operation_allowed = canOperateOrders(user);

  return view === 'list' ? toOrderListView(row) : row;
}

function pickPlayShopId(body = {}) {
  if (typeof body.play_shop_id !== 'undefined') {
    return body.play_shop_id;
  }
  if (typeof body.play_store_id !== 'undefined') {
    return body.play_store_id;
  }
  if (typeof body.shop_id !== 'undefined') {
    return body.shop_id;
  }
  return null;
}

async function getStoreById(storeId, conn = null) {
  const id = Number(storeId);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const executor = conn || { execute: (sql, params) => query(sql, params).then((rows) => [rows]) };
  const [rows] = await executor.execute(
    `SELECT id, name, commission_rate
     FROM stores
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getPlayShopById(shopId, conn = null) {
  const id = Number(shopId);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const executor = conn || { execute: (sql, params) => query(sql, params).then((rows) => [rows]) };
  const [rows] = await executor.execute(
    `SELECT id, name, commission_rate
     FROM play_shops
     WHERE id = ? AND is_deleted = 0
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function fetchOrderById(id) {
  const rows = await query(
    `SELECT
      o.id,
      o.order_no,
      o.store_id,
      s.name AS store_name,
      COALESCE(NULLIF(o.contact, ''), o.customer_contact) AS contact,
      COALESCE(NULLIF(o.contact, ''), o.customer_contact) AS customer_contact,
      o.customer_nickname,
      o.order_info,
      o.order_remark,
      o.order_amount,
      o.status,
      o.is_effective,
      o.is_deleted,
      o.store_rate,
      o.store_share,
      o.store_commission,
      o.platform_rate,
      o.platform_share,
      o.platform_commission,
      o.west_share,
      o.shop_id,
      o.shop_rate,
      o.shop_share,
      o.play_shop_id,
      o.play_shop_rate,
      o.play_shop_share,
      o.play_shop_commission,
      p.name AS play_shop_name,
      o.revised_amount,
      o.problem_remark,
      o.is_anonymous,
      o.created_by,
      o.confirmed_by,
      o.created_at,
      o.updated_at
     FROM orders o
     LEFT JOIN stores s ON s.id = o.store_id
     LEFT JOIN play_shops p ON p.id = o.play_shop_id
     WHERE o.id = :id
     LIMIT 1`,
    { id: Number(id) }
  );

  return rows[0] || null;
}

async function upsertProblemOrder(orderId, orderAmount, revisedAmount, problemRemark, userId, conn) {
  await conn.execute(
    `INSERT INTO problem_orders
      (order_id, order_amount, revised_amount, status, reason, problem_remark, reported_by)
     VALUES (?, ?, ?, 'open', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      order_amount = VALUES(order_amount),
      revised_amount = VALUES(revised_amount),
      status = 'open',
      reason = VALUES(reason),
      problem_remark = VALUES(problem_remark),
      reported_by = VALUES(reported_by),
      updated_at = CURRENT_TIMESTAMP`,
    [
      Number(orderId),
      money(orderAmount),
      revisedAmount == null ? null : money(revisedAmount),
      String(problemRemark || ''),
      String(problemRemark || ''),
      userId ? Number(userId) : null,
    ]
  );
}

async function resolveProblemOrder(orderId, userId, conn) {
  await conn.execute(
    `UPDATE problem_orders
     SET status = 'resolved',
         resolved_by = ?,
         resolved_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE order_id = ? AND status = 'open'`,
    [userId ? Number(userId) : null, Number(orderId)]
  );
}

async function createNotification(title, content, orderId, storeId, conn = null, options = {}) {
  const payload = {
    type: String(options.type || 'order_created'),
    title: String(title || ''),
    content: String(content || ''),
    order_id: orderId ? Number(orderId) : null,
    store_id: storeId ? Number(storeId) : null,
    source_store_name: options.source_store_name ? String(options.source_store_name) : null,
    source_contact: options.source_contact ? String(options.source_contact) : null,
    source_order_info: options.source_order_info ? String(options.source_order_info) : null,
    source_amount: Number.isFinite(Number(options.source_amount)) ? money(options.source_amount) : null,
    source_order_time: options.source_order_time || null,
  };

  if (conn) {
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.type,
        payload.title,
        payload.content,
        payload.order_id,
        payload.store_id,
        payload.source_store_name,
        payload.source_contact,
        payload.source_order_info,
        payload.source_amount,
        payload.source_order_time,
      ]
    );
    return;
  }

  await query(
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
    VALUES
    (
      :type,
      :title,
      :content,
      :order_id,
      :store_id,
      :source_store_name,
      :source_contact,
      :source_order_info,
      :source_amount,
      :source_order_time
    )`,
    payload
  );
}

function buildCompletedNotificationType(previousStatus) {
  return String(previousStatus) === 'problem' ? 'problem_order_completed' : 'order_completed';
}

function buildCompletedNotificationTitle(previousStatus) {
  return String(previousStatus) === 'problem' ? '问题订单已完成' : '订单已完成';
}

function canReadOrder(user, order) {
  if (canReadAllOrders(user)) {
    return true;
  }
  if (hasRole(user, 'store_owner')) {
    if (!canReadSelfStoreOrders(user)) {
      return false;
    }
    return (
      Number(order.store_id) === Number(user.store_id) &&
      STORE_OWNER_VISIBLE_STATUSES.includes(String(order.status)) &&
      Number(order.is_deleted) === 0
    );
  }
  return false;
}

function isOrderRole(user) {
  return hasAnyRole(user, ORDER_ACCESS_ROLES);
}

function buildOrderListPayload({ list = [], total = 0, page = 1, pageSize = 20, locate = null, locatedOrder = null } = {}) {
  return {
    list,
    total: Number(total || 0),
    page,
    pageSize,
    locate,
    located_order: locatedOrder,
  };
}

function normalizeOrderPayload(body = {}) {
  const isFrontendPayload = Boolean(body.package_id && (body.customer_contact || body.contact));
  const contact = isFrontendPayload ? body.customer_contact || body.contact : body.contact || body.customer_contact;
  const orderInfo = isFrontendPayload
    ? body.package_name || body.order_info || `package:${body.package_id}`
    : body.order_info;

  return {
    store_id: body.store_id,
    contact: normalizeNullableString(contact),
    customer_nickname: pickIncomingCustomerNickname(body, null),
    order_info: String(orderInfo || '').trim(),
    order_amount: Number(body.order_amount),
    status: normalizeStatus(body.status || 'pending_contact'),
    play_shop_id: pickPlayShopId(body),
    revised_amount: typeof body.revised_amount === 'undefined' ? null : Number(body.revised_amount),
    order_remark: pickIncomingOrderRemark(body, null),
    problem_remark: pickIncomingProblemRemark(body, null),
    is_anonymous: normalizeAnonymousFlag(body.is_anonymous ?? body.anonymous),
  };
}

async function listOrders(req, res) {
  const user = req.user;
  const { page, pageSize, limit, offset } = buildPagination(req.query, 20, 100);
  const {
    keyword,
    status,
    store_id,
    play_shop_id,
    play_store_id,
    order_no,
    start_time,
    end_time,
    include_deleted,
  } = req.query;
  const orderIdRaw = req.query.order_id;
  const locateOrderIdRaw = req.query.locate_order_id ?? req.query.highlight_order_id;
  const locateOnly = ['1', 'true', 'yes'].includes(
    String(req.query.locate_only ?? req.query.locateOnly ?? '').trim().toLowerCase()
  );
  const parsedOrderId = typeof orderIdRaw === 'undefined' ? null : parsePositiveInt(orderIdRaw);
  const parsedLocateOrderId =
    typeof locateOrderIdRaw === 'undefined' ? null : parsePositiveInt(locateOrderIdRaw);
  const locateOrderId = locateOnly ? parsedOrderId || parsedLocateOrderId : parsedLocateOrderId;
  const recycleOnly = String(include_deleted || '') === '1';
  const keywordText = normalizeNullableString(keyword);

  if (!isOrderRole(user)) {
    return fail(res, 'No permission', 403);
  }

  const buildEmptyResponse = () =>
    ok(
      res,
      buildOrderListPayload({
        list: [],
        total: 0,
        page,
        pageSize,
      }),
      'Order list fetched'
    );

  if (!hasPagePermission(user, 'orders:view')) {
    return buildEmptyResponse();
  }

  if (typeof orderIdRaw !== 'undefined' && !parsedOrderId) {
    return fail(res, 'order_id parameter is invalid', 400);
  }
  if (typeof locateOrderIdRaw !== 'undefined' && !parsedLocateOrderId) {
    return fail(res, 'locate_order_id parameter is invalid', 400);
  }

  if (recycleOnly && !hasPagePermission(user, 'recycle_orders:view')) {
    return buildEmptyResponse();
  }

  const canViewProblemOrders = hasPagePermission(user, 'problem_orders:view');
  const filters = ['1=1'];
  const params = {};

  if (hasRole(user, 'store_owner')) {
    if (!user.store_id) {
      return fail(res, 'store_owner must bind store_id', 400);
    }
    if (!canReadSelfStoreOrders(user)) {
      return buildEmptyResponse();
    }
    filters.push('o.store_id = :scope_store_id');
    params.scope_store_id = Number(user.store_id);
    if (canViewProblemOrders) {
      filters.push(`o.status IN ('problem', 'completed')`);
    } else {
      filters.push(`o.status = 'completed'`);
    }
  } else if (canReadAllOrders(user)) {
    if (!canViewProblemOrders) {
      filters.push(`o.status <> 'problem'`);
    }
  } else {
    return fail(res, 'No permission', 403);
  }

  filters.push(recycleOnly ? 'o.is_deleted = 1' : 'o.is_deleted = 0');

  if (store_id && canReadAllOrders(user)) {
    filters.push('o.store_id = :store_id');
    params.store_id = Number(store_id);
  }

  const normalizedPlayShopId = play_shop_id ?? play_store_id;
  if (normalizedPlayShopId) {
    filters.push('o.play_shop_id = :play_shop_id');
    params.play_shop_id = Number(normalizedPlayShopId);
  }

  if (parsedOrderId && !locateOnly) {
    filters.push('o.id = :order_id');
    params.order_id = parsedOrderId;
  }

  if (order_no) {
    filters.push('o.order_no = :order_no');
    params.order_no = String(order_no).trim();
  }

  if (status) {
    const normalized = normalizeStatus(status);
    if (!ORDER_STATUSES.includes(normalized)) {
      return fail(res, 'status parameter is invalid', 400);
    }
    if (normalized === 'problem' && !canViewProblemOrders) {
      return buildEmptyResponse();
    }
    if (hasRole(user, 'store_owner') && !STORE_OWNER_VISIBLE_STATUSES.includes(normalized)) {
      return buildEmptyResponse();
    }
    filters.push('o.status = :status');
    params.status = normalized;
  }

  if (keywordText) {
    filters.push(`(
      o.order_no LIKE :keyword
      OR COALESCE(NULLIF(o.contact, ''), o.customer_contact) LIKE :keyword
      OR o.customer_nickname LIKE :keyword
      OR o.order_info LIKE :keyword
      OR o.order_remark LIKE :keyword
      OR s.name LIKE :keyword
      OR p.name LIKE :keyword
    )`);
    params.keyword = `%${keywordText}%`;
  }

  if (start_time) {
    filters.push('o.created_at >= :start_time');
    params.start_time = start_time;
  }

  if (end_time) {
    filters.push('o.created_at <= :end_time');
    params.end_time = end_time;
  }

  const where = filters.join(' AND ');
  if (locateOnly && locateOrderId) {
    const target = await fetchOrderById(locateOrderId);
    const canLocate =
      Boolean(target) &&
      canReadOrder(user, target) &&
      !(String(target.status) === 'problem' && !canViewProblemOrders);

    const locate = {
      order_id: locateOrderId,
      found: Boolean(target),
      visible: canLocate,
    };
    const locatedOrder = canLocate ? applyOrderFieldPermissions(user, target, { view: 'list' }) : null;

    return ok(
      res,
      buildOrderListPayload({
        list: locatedOrder ? [locatedOrder] : [],
        total: locatedOrder ? 1 : 0,
        page,
        pageSize,
        locate,
        locatedOrder,
      }),
      'Order list fetched'
    );
  }

  const countFrom = keywordText
    ? `FROM orders o LEFT JOIN stores s ON s.id = o.store_id LEFT JOIN play_shops p ON p.id = o.play_shop_id`
    : `FROM orders o`;
  const totalRows = await query(`SELECT COUNT(*) AS total ${countFrom} WHERE ${where}`, params);
  const list = await query(
    `SELECT
      o.id,
      o.order_no,
      o.store_id,
      s.name AS store_name,
      COALESCE(NULLIF(o.contact, ''), o.customer_contact) AS contact,
      COALESCE(NULLIF(o.contact, ''), o.customer_contact) AS customer_contact,
      o.customer_nickname,
      o.order_info,
      o.order_remark,
      o.problem_remark,
      o.order_amount,
      o.revised_amount,
      COALESCE(o.revised_amount, o.order_amount) AS amount,
      o.status,
      o.is_anonymous,
      o.is_effective,
      o.is_deleted,
      o.store_rate,
      o.store_share,
      o.store_commission,
      o.platform_rate,
      o.platform_share,
      o.platform_commission,
      o.west_share,
      o.shop_id,
      o.shop_rate,
      o.shop_share,
      o.play_shop_id,
      o.play_shop_rate,
      o.play_shop_share,
      o.play_shop_commission,
      p.name AS play_shop_name,
      o.created_by,
      o.confirmed_by,
      o.created_at,
      o.updated_at
     FROM orders o
     LEFT JOIN stores s ON s.id = o.store_id
     LEFT JOIN play_shops p ON p.id = o.play_shop_id
     WHERE ${where}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  let locatedOrder = null;
  let locate = null;
  if (locateOrderId) {
    const target = await fetchOrderById(locateOrderId);
    const canLocate =
      Boolean(target) &&
      canReadOrder(user, target) &&
      !(String(target.status) === 'problem' && !canViewProblemOrders);

    locate = {
      order_id: locateOrderId,
      found: Boolean(target),
      visible: canLocate,
    };

    if (canLocate) {
      locatedOrder = applyOrderFieldPermissions(user, target, { view: 'list' });
    }
  }

  return ok(
    res,
    buildOrderListPayload({
      list: list.map((item) => applyOrderFieldPermissions(user, item, { view: 'list' })),
      total: Number(totalRows[0]?.total || 0),
      page,
      pageSize,
      locate,
      locatedOrder,
    }),
    'Order list fetched'
  );
}
async function getOrderById(req, res) {
  const user = req.user;
  if (!hasPagePermission(user, 'orders:view')) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const order = await fetchOrderById(id);
  if (!order) {
    return fail(res, '订单不存在', 404);
  }

  if (!canReadOrder(user, order)) {
    return fail(res, '无权限', 403);
  }
  if (String(order.status) === 'problem' && !hasPagePermission(user, 'problem_orders:view')) {
    return fail(res, '无权限', 403);
  }

  return ok(res, applyOrderFieldPermissions(user, order), '订单详情获取成功');
}

async function createOrder(req, res) {
  if (req.user && !canCreateOrder(req.user)) {
    return fail(res, '无权限', 403);
  }

  const payload = normalizeOrderPayload(req.body || {});
  if (!payload.contact || !payload.order_info || !Number.isFinite(payload.order_amount) || payload.order_amount <= 0) {
    return fail(res, '缺少必填字段', 400);
  }

  const status = 'pending_contact';
  const resolvedStore = await resolveStore(req);
  if (!resolvedStore.ok || !resolvedStore.store) {
    return fail(res, resolvedStore.error || STORE_SOURCE_NOT_FOUND_MESSAGE, 400);
  }
  const store = resolvedStore.store;

  const platformRate = Number.isFinite(Number(req.body?.platform_rate)) ? Number(req.body.platform_rate) : DEFAULT_PLATFORM_RATE;

  const playShop = await getPlayShopById(payload.play_shop_id);
  const storeRate = toNumber(store.commission_rate, 0);
  const playShopRate = toNumber(playShop?.commission_rate, 0);
  const amountForShare = status === 'completed' ? settlementAmount(payload.order_amount, payload.revised_amount) : payload.order_amount;
  const shares = buildShares(amountForShare, storeRate, platformRate, playShopRate);
  const isOnlineSource = isOnlineStore(store);

  let insertedId = 0;
  await transaction(async (conn) => {
    const [result] = await conn.execute(
      `INSERT INTO orders
      (
        order_no,
        store_id,
        contact,
        customer_contact,
        customer_nickname,
        order_info,
        order_amount,
        status,
        store_rate,
        store_share,
        store_commission,
        platform_rate,
        platform_share,
        platform_commission,
        west_share,
        shop_id,
        shop_rate,
        shop_share,
        play_shop_id,
        play_shop_rate,
        play_shop_share,
        play_shop_commission,
        revised_amount,
        order_remark,
        problem_remark,
        is_anonymous,
        is_effective,
        created_by
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        makeOrderNo(isOnlineSource ? 'ONL' : 'WB'),
        Number(store.id),
        payload.contact,
        payload.contact,
        payload.customer_nickname,
        payload.order_info,
        payload.order_amount,
        status,
        storeRate,
        shares.store_share,
        shares.store_commission,
        platformRate,
        shares.platform_share,
        shares.platform_commission,
        shares.west_share,
        playShop ? Number(playShop.id) : null,
        playShopRate,
        shares.shop_share,
        playShop ? Number(playShop.id) : null,
        playShopRate,
        shares.play_shop_share,
        shares.play_shop_commission,
        payload.revised_amount == null ? null : money(payload.revised_amount),
        payload.order_remark,
        payload.problem_remark || null,
        payload.is_anonymous,
        status === 'completed' ? 1 : 0,
        req.user?.id ? Number(req.user.id) : null,
      ]
    );

    insertedId = Number(result.insertId);

    if (status === 'problem') {
      await upsertProblemOrder(
        insertedId,
        payload.order_amount,
        payload.revised_amount,
        payload.problem_remark,
        req.user?.id,
        conn
      );
    }

    await createNotification('新订单提醒', `订单${insertedId}已创建，状态：${status}`, insertedId, Number(store.id), conn, {
      type: isOnlineSource ? 'online_order_created' : 'order_created',
      source_store_name: store.name,
      source_contact: payload.is_anonymous ? null : payload.contact,
      source_order_info: payload.order_info,
      source_amount: settlementAmount(payload.order_amount, payload.revised_amount),
      source_order_time: new Date(),
    });
  });

  const row = await fetchOrderById(insertedId);

  await writeOperationLog(req, {
    action: 'orders.create',
    detail: `新增订单 ${row?.order_no || insertedId}`,
    target_type: 'order',
    target_id: insertedId,
    after: row,
  });

  return ok(res, applyOrderFieldPermissions(req.user, row), '订单创建成功');
}

async function updateOrderStatus(req, res) {
  if (!canManageOrderFlow(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const targetStatus = normalizeStatus(req.body?.status);
  if (!ORDER_STATUSES.includes(targetStatus)) {
    return fail(res, '状态参数无效', 400);
  }

  const target = await fetchOrderById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, '订单不存在', 404);
  }

  const before = { ...target };
  const incomingRevised = parseIncomingRevisedAmount(req.body || {}, target.revised_amount);
  const incomingProblemRemark = pickIncomingProblemRemark(req.body || {}, target.problem_remark);
  const incomingOrderRemark = pickExplicitOrderRemark(req.body || {}, target.order_remark);
  const hasAnonymousFlag = hasOwn(req.body, 'is_anonymous') || hasOwn(req.body, 'anonymous');
  const incomingAnonymous = hasAnonymousFlag
    ? normalizeAnonymousFlag(req.body?.is_anonymous ?? req.body?.anonymous)
    : normalizeAnonymousFlag(target.is_anonymous);

  await transaction(async (conn) => {
    const nextRevised = incomingRevised;
    const nextProblemRemark = incomingProblemRemark;
    const nextOrderRemark = incomingOrderRemark;

    if (targetStatus === 'completed') {
      const nextAmount = settlementAmount(target.order_amount, nextRevised);
      const shares = buildShares(nextAmount, target.store_rate, target.platform_rate, target.play_shop_rate);
      await conn.execute(
        `UPDATE orders
         SET status = ?,
             is_effective = 1,
             confirmed_by = ?,
             store_share = ?,
             store_commission = ?,
             platform_share = ?,
             platform_commission = ?,
             west_share = ?,
             shop_share = ?,
             play_shop_share = ?,
             play_shop_commission = ?,
             revised_amount = ?,
             order_remark = ?,
             problem_remark = ?,
             is_anonymous = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          targetStatus,
          Number(req.user.id),
          shares.store_share,
          shares.store_commission,
          shares.platform_share,
          shares.platform_commission,
          shares.west_share,
          shares.shop_share,
          shares.play_shop_share,
          shares.play_shop_commission,
          nextRevised,
          nextOrderRemark,
          nextProblemRemark,
          incomingAnonymous,
          id,
        ]
      );
      await resolveProblemOrder(id, req.user.id, conn);
      return;
    }

    await conn.execute(
      `UPDATE orders
       SET status = ?,
           is_effective = 0,
           confirmed_by = NULL,
           revised_amount = ?,
           order_remark = ?,
           problem_remark = ?,
           is_anonymous = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [targetStatus, nextRevised, nextOrderRemark, nextProblemRemark, incomingAnonymous, id]
    );

    if (targetStatus === 'problem') {
      await upsertProblemOrder(
        id,
        toNumber(target.order_amount, 0),
        nextRevised,
        nextProblemRemark,
        req.user?.id,
        conn
      );
    } else {
      await resolveProblemOrder(id, req.user?.id, conn);
    }
  });

  const row = await fetchOrderById(id);
  if (targetStatus === 'completed' && String(before.status) !== 'completed') {
    const completedType = buildCompletedNotificationType(before.status);
    const completedTitle = buildCompletedNotificationTitle(before.status);
    await createNotification(completedTitle, `订单${id}已完成`, id, Number(row?.store_id || before.store_id), null, {
      type: completedType,
      source_store_name: row?.store_name || before.store_name || null,
      source_contact: normalizeAnonymousFlag(row?.is_anonymous ?? before.is_anonymous)
        ? null
        : row?.contact || before.contact || null,
      source_order_info: row?.order_info || before.order_info || null,
      source_amount: settlementAmount(row?.order_amount ?? before.order_amount, row?.revised_amount ?? before.revised_amount),
      source_order_time: row?.created_at || before.created_at || new Date(),
    });
  }

  const statusAction =
    String(before.status) === 'problem' && targetStatus === 'completed'
      ? 'orders.problem_complete'
      : 'orders.update_status';

  await writeOperationLog(req, {
    action: statusAction,
    detail:
      statusAction === 'orders.problem_complete'
        ? `完成问题订单：订单${id}`
        : `修改订单状态：订单${id} ${before.status} -> ${targetStatus}`,
    target_type: 'order',
    target_id: id,
    before,
    after: row,
  });

  return ok(res, applyOrderFieldPermissions(req.user, row), '订单状态更新成功');
}

async function updateOrderAmount(req, res) {
  if (!canUpdateAmount(req.user)) {
    return fail(res, '无权限', 403);
  }

  req.body = {
    ...(req.body || {}),
    revised_amount: req.body?.order_amount,
    order_remark:
      req.body?.order_remark ??
      req.body?.customer_order_remark ??
      req.body?.customer_remark ??
      req.body?.customer_order_note ??
      req.body?.order_note,
    problem_remark: req.body?.problem_remark ?? req.body?.problem_reason,
  };
  return updateProblemOrder(req, res);
}

async function updateOrderRemark(req, res) {
  if (!canEditOrderRemark(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const body = req.body || {};
  const hasRemark =
    hasOwn(body, 'order_remark') ||
    hasOwn(body, 'customer_order_remark') ||
    hasOwn(body, 'customer_remark') ||
    hasOwn(body, 'remark') ||
    hasOwn(body, 'customer_note') ||
    hasOwn(body, 'note') ||
    hasOwn(body, 'customer_order_note') ||
    hasOwn(body, 'order_note');
  const hasCustomerNickname = hasOwn(body, 'customer_nickname') || hasOwn(body, 'nickname') || hasOwn(body, 'customer_name');
  const hasAnonymousFlag = hasOwn(body, 'is_anonymous') || hasOwn(body, 'anonymous');

  if (!hasRemark && !hasCustomerNickname && !hasAnonymousFlag) {
    return fail(res, '必须提供 order_remark、customer_nickname 或 is_anonymous', 400);
  }

  const target = await fetchOrderById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, '订单不存在', 404);
  }
  if (!canReadOrder(req.user, target)) {
    return fail(res, '无权限', 403);
  }

  const nextOrderRemark = hasRemark
    ? pickIncomingOrderRemark(body, target.order_remark)
    : normalizeNullableString(target.order_remark);
  const nextCustomerNickname = hasCustomerNickname
    ? pickIncomingCustomerNickname(body, target.customer_nickname)
    : normalizeNullableString(target.customer_nickname);
  const nextIsAnonymous = hasAnonymousFlag
    ? normalizeAnonymousFlag(body.is_anonymous ?? body.anonymous)
    : normalizeAnonymousFlag(target.is_anonymous);

  await query(
    `UPDATE orders
     SET order_remark = :order_remark,
         customer_nickname = :customer_nickname,
         is_anonymous = :is_anonymous,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    {
      id,
      order_remark: nextOrderRemark,
      customer_nickname: nextCustomerNickname,
      is_anonymous: nextIsAnonymous,
    }
  );

  const row = await fetchOrderById(id);
  await writeOperationLog(req, {
    action: 'orders.update_remark',
    detail: `更新订单备注：订单${id}`,
    target_type: 'order',
    target_id: id,
    before: target,
    after: row,
  });

  return ok(res, applyOrderFieldPermissions(req.user, row), '订单备注更新成功');
}

async function updateProblemOrder(req, res) {
  if (!canEditProblem(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const body = req.body || {};
  const hasRevisedAmount =
    Object.prototype.hasOwnProperty.call(body, 'revised_amount') ||
    Object.prototype.hasOwnProperty.call(body, 'order_amount');
  const hasProblemRemark = hasOwn(body, 'problem_remark') || hasOwn(body, 'problem_reason');
  const hasAnonymousFlag = hasOwn(body, 'is_anonymous') || hasOwn(body, 'anonymous');

  const target = await fetchOrderById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, '订单不存在', 404);
  }

  if (String(target.status) !== 'problem') {
    return fail(res, '仅问题订单可修改修正信息', 400);
  }

  if (!hasRevisedAmount && !hasProblemRemark && !hasAnonymousFlag) {
    return ok(res, applyOrderFieldPermissions(req.user, target), '问题订单未发生变更');
  }

  let revisedAmount = revisedAmountOrNull(target.revised_amount);
  if (hasRevisedAmount) {
    const revisedRaw = body.revised_amount ?? body.order_amount;
    if (revisedRaw === '' || revisedRaw === null) {
      revisedAmount = null;
    } else {
      const parsed = revisedAmountOrNull(revisedRaw);
      if (parsed == null) {
        return fail(res, 'revised_amount 参数无效', 400);
      }
      revisedAmount = parsed;
    }
  }

  let problemRemark = normalizeNullableString(target.problem_remark);
  if (hasProblemRemark) {
    problemRemark = pickIncomingProblemRemark(body, target.problem_remark);
  }
  const anonymousFlag = hasAnonymousFlag
    ? normalizeAnonymousFlag(body.is_anonymous ?? body.anonymous)
    : normalizeAnonymousFlag(target.is_anonymous);

  const before = { ...target };
  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE orders
       SET revised_amount = ?,
           problem_remark = ?,
           is_anonymous = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [revisedAmount, problemRemark, anonymousFlag, id]
    );

    await upsertProblemOrder(
      id,
      toNumber(target.order_amount, 0),
      revisedAmount,
      problemRemark,
      req.user?.id,
      conn
    );
  });

  const row = await fetchOrderById(id);

  await writeOperationLog(req, {
    action: 'orders.update_problem',
    detail: `保存问题订单修改：订单${id}`,
    target_type: 'order',
    target_id: id,
    before,
    after: row,
  });

  return ok(res, applyOrderFieldPermissions(req.user, row), '问题订单更新成功');
}

async function completeProblemOrder(req, res) {
  if (!canCompleteProblem(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const target = await fetchOrderById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, '订单不存在', 404);
  }
  if (String(target.status) !== 'problem') {
    return fail(res, '仅问题订单可通过此接口完成', 400);
  }

  req.body = { ...(req.body || {}), status: 'completed' };
  return updateOrderStatus(req, res);
}

async function withdrawProblemOrder(req, res) {
  if (!canWithdrawProblem(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const fallbackStatus = normalizeStatus(req.body?.status || 'pending_contact');
  if (!['pending_contact', 'processing'].includes(fallbackStatus)) {
    return fail(res, '撤回状态参数无效', 400);
  }

  const target = await fetchOrderById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, '订单不存在', 404);
  }
  if (!['problem', 'completed'].includes(String(target.status))) {
    return fail(res, '仅问题订单或已完成订单可撤回', 400);
  }

  const before = { ...target };
  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE orders
       SET status = ?,
           is_effective = 0,
           confirmed_by = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [fallbackStatus, id]
    );
    await resolveProblemOrder(id, req.user?.id, conn);
  });

  const row = await fetchOrderById(id);
  await createNotification('问题订单已撤回', `问题订单${id}已撤回`, id, Number(row?.store_id || target.store_id), null, {
    type: 'problem_order_withdrawn',
    source_store_name: row?.store_name || target.store_name || null,
    source_contact: normalizeAnonymousFlag(row?.is_anonymous ?? target.is_anonymous)
      ? null
      : row?.contact || target.contact || null,
    source_order_info: row?.order_info || target.order_info || null,
    source_amount: settlementAmount(row?.order_amount ?? target.order_amount, row?.revised_amount ?? target.revised_amount),
    source_order_time: row?.created_at || target.created_at || new Date(),
  });

  await writeOperationLog(req, {
    action: 'orders.problem_withdraw',
    detail: `撤回订单：订单${id} -> ${fallbackStatus}`,
    target_type: 'order',
    target_id: id,
    before,
    after: row,
  });

  return ok(res, applyOrderFieldPermissions(req.user, row), '问题订单撤回成功');
}

async function assignShop(req, res) {
  if (!canAssignPlayShop(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const shopRawId = pickPlayShopId(req.body || {});
  if (typeof shopRawId === 'undefined') {
    return fail(res, '必须提供 play_shop_id', 400);
  }

  const target = await fetchOrderById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, '订单不存在', 404);
  }
  const before = { ...target };

  const unassign = shopRawId === null || String(shopRawId).trim() === '';
  let playShop = null;
  if (!unassign) {
    playShop = await getPlayShopById(shopRawId);
    if (!playShop) {
      return fail(res, '陪玩店不存在', 404);
    }
  }

  const playShopRate = toNumber(playShop?.commission_rate, 0);
  const amountForCalc = settlementAmountFromOrder(target);
  const shares = buildShares(amountForCalc, target.store_rate, target.platform_rate, playShopRate);

  await query(
    `UPDATE orders
     SET shop_id = :shop_id,
         shop_rate = :shop_rate,
         shop_share = :shop_share,
         play_shop_id = :play_shop_id,
         play_shop_rate = :play_shop_rate,
         play_shop_share = :play_shop_share,
         store_commission = :store_commission,
         platform_commission = :platform_commission,
         play_shop_commission = :play_shop_commission,
         store_share = :store_share,
         platform_share = :platform_share,
         west_share = :west_share,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    {
      id,
      shop_id: playShop ? Number(playShop.id) : null,
      shop_rate: playShopRate,
      shop_share: shares.shop_share,
      play_shop_id: playShop ? Number(playShop.id) : null,
      play_shop_rate: playShopRate,
      play_shop_share: shares.play_shop_share,
      store_commission: shares.store_commission,
      platform_commission: shares.platform_commission,
      play_shop_commission: shares.play_shop_commission,
      store_share: shares.store_share,
      platform_share: shares.platform_share,
      west_share: shares.west_share,
    }
  );

  const row = await fetchOrderById(id);
  await writeOperationLog(req, {
    action: 'orders.assign_play_shop',
    detail: `派单陪玩店：订单${id} -> ${playShop ? playShop.name || playShop.id : '未分配'}`,
    target_type: 'order',
    target_id: id,
    before,
    after: row,
  });

  return ok(res, applyOrderFieldPermissions(req.user, row), '陪玩店分配成功');
}

async function assignPlayShop(req, res) {
  return assignShop(req, res);
}

async function recycleOrder(req, res) {
  if (!canDeleteOrder(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const target = await fetchOrderById(id);
  if (!target) {
    return fail(res, '订单不存在', 404);
  }
  if (Number(target.is_deleted) === 1) {
    return fail(res, '订单已删除', 400);
  }

  await transaction(async (conn) => {
    const [existsRows] = await conn.execute(
      `SELECT id FROM recycle_orders WHERE order_id = ? AND is_restored = 0 LIMIT 1`,
      [id]
    );
    if (!existsRows.length) {
      await conn.execute(
        `INSERT INTO recycle_orders (order_id, snapshot_json, recycled_by, recycled_ip)
         VALUES (?, ?, ?, ?)`,
        [id, JSON.stringify(target), req.user?.id ? Number(req.user.id) : null, getClientIp(req)]
      );
    }

    await conn.execute(
      `UPDATE orders
       SET is_deleted = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );
  });

  const row = await fetchOrderById(id);
  await writeOperationLog(req, {
    action: 'orders.delete',
    detail: `删除订单：订单${id}`,
    target_type: 'order',
    target_id: id,
    before: target,
    after: row,
  });

  return ok(res, { order_id: id }, '订单删除成功');
}

async function restoreOrder(req, res) {
  if (!canRestoreOrder(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const target = await fetchOrderById(id);
  if (!target) {
    return fail(res, '订单不存在', 404);
  }

  const recycleRows = await query(
    `SELECT id
     FROM recycle_orders
     WHERE order_id = :order_id AND is_restored = 0
     ORDER BY id DESC
     LIMIT 1`,
    { order_id: id }
  );
  if (!recycleRows.length) {
    return fail(res, '回收记录不存在', 404);
  }

  const recycleId = Number(recycleRows[0].id);
  await transaction(async (conn) => {
    await conn.execute(`UPDATE orders SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    await conn.execute(
      `UPDATE recycle_orders
       SET is_restored = 1,
           restored_by = ?,
           restored_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user?.id ? Number(req.user.id) : null, recycleId]
    );
  });

  const row = await fetchOrderById(id);
  await writeOperationLog(req, {
    action: 'orders.restore',
    detail: `恢复订单：订单${id}`,
    target_type: 'order',
    target_id: id,
    before: target,
    after: row,
  });

  return ok(res, applyOrderFieldPermissions(req.user, row), '订单恢复成功');
}

async function permanentDeleteOrder(req, res) {
  if (!canDeleteOrder(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const target = await fetchOrderById(id);
  if (!target) {
    return fail(res, '订单不存在', 404);
  }

  await transaction(async (conn) => {
    await conn.execute(`DELETE FROM problem_orders WHERE order_id = ?`, [id]);
    await conn.execute(`DELETE FROM recycle_orders WHERE order_id = ?`, [id]);
    await conn.execute(`DELETE FROM order_limits WHERE order_id = ?`, [id]);
    await conn.execute(`DELETE FROM orders WHERE id = ?`, [id]);
  });

  await writeOperationLog(req, {
    action: 'orders.permanent_delete',
    detail: `永久删除订单：订单${id}`,
    target_type: 'order',
    target_id: id,
    before: target,
    after: null,
  });

  return ok(res, { order_id: id }, '订单永久删除成功');
}

async function confirmOrder(req, res) {
  req.body = { ...(req.body || {}), status: 'completed' };
  return updateOrderStatus(req, res);
}

async function deleteOrder(req, res) {
  return recycleOrder(req, res);
}

async function updateOrderEffective(req, res) {
  if (!hasRole(req.user, 'super_admin') || !canOperateOrders(req.user)) {
    return fail(res, '无权限', 403);
  }

  const id = Number(req.params.id);
  const target = await fetchOrderById(id);
  if (!target) {
    return fail(res, '订单不存在', 404);
  }

  await query(
    `UPDATE orders
     SET is_effective = :is_effective,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    {
      id,
      is_effective: Number(req.body?.is_effective) ? 1 : 0,
    }
  );

  const row = await fetchOrderById(id);
  await writeOperationLog(req, {
    action: 'orders.update_effective',
    detail: `修改订单生效状态：订单${id} -> ${Number(req.body?.is_effective) ? '生效' : '失效'}`,
    target_type: 'order',
    target_id: id,
    before: target,
    after: row,
  });

  return ok(res, applyOrderFieldPermissions(req.user, row), '订单生效状态更新成功');
}

async function batchUpdateOrderStatus(req, res) {
  if (!canBatchUpdateStatus(req.user)) {
    return fail(res, '无权限', 403);
  }

  const orderIds = parseOrderIds(req.body?.order_ids);
  const targetStatus = normalizeStatus(req.body?.status);
  if (!orderIds.length) {
    return fail(res, '必须提供 order_ids', 400);
  }
  if (!ORDER_STATUSES.includes(targetStatus)) {
    return fail(res, '状态参数无效', 400);
  }

  const hasBatchOrderRemark =
    hasOwn(req.body, 'order_remark') ||
    hasOwn(req.body, 'customer_order_remark') ||
    hasOwn(req.body, 'customer_remark') ||
    hasOwn(req.body, 'customer_order_note') ||
    hasOwn(req.body, 'order_note');
  const batchOrderRemark = pickExplicitOrderRemark(req.body || {}, null);
  const batchProblemRemark = pickIncomingProblemRemark(req.body || {}, null);
  const updatedIds = [];
  await transaction(async (conn) => {
    for (const id of orderIds) {
      const [rows] = await conn.execute(
        `SELECT
          id,
          status,
          store_id,
          contact,
          order_info,
          order_amount,
          revised_amount,
          order_remark,
          problem_remark,
          is_anonymous,
          store_rate,
          platform_rate,
          play_shop_rate,
          created_at,
          is_deleted
         FROM orders
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      if (!rows.length || Number(rows[0].is_deleted) === 1) {
        continue;
      }

      const previousStatus = String(rows[0].status || '');
      const nextRevised = revisedAmountOrNull(rows[0].revised_amount);
      const nextProblemRemark = batchProblemRemark || normalizeNullableString(rows[0].problem_remark);
      const nextOrderRemark = hasBatchOrderRemark
        ? batchOrderRemark
        : normalizeNullableString(rows[0].order_remark);
      const amount = settlementAmount(rows[0].order_amount, nextRevised);
      const shares = buildShares(amount, rows[0].store_rate, rows[0].platform_rate, rows[0].play_shop_rate);

      if (targetStatus === 'completed') {
        await conn.execute(
          `UPDATE orders
           SET status = ?,
               is_effective = 1,
               confirmed_by = ?,
               store_share = ?,
               store_commission = ?,
               platform_share = ?,
               platform_commission = ?,
               west_share = ?,
               shop_share = ?,
               play_shop_share = ?,
               play_shop_commission = ?,
               revised_amount = ?,
               order_remark = ?,
               problem_remark = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            targetStatus,
            Number(req.user.id),
            shares.store_share,
            shares.store_commission,
            shares.platform_share,
            shares.platform_commission,
            shares.west_share,
            shares.shop_share,
            shares.play_shop_share,
            shares.play_shop_commission,
            nextRevised,
            nextOrderRemark,
            nextProblemRemark,
            id,
          ]
        );
      } else {
        await conn.execute(
          `UPDATE orders
           SET status = ?,
               is_effective = 0,
               confirmed_by = NULL,
               revised_amount = ?,
               order_remark = ?,
               problem_remark = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [targetStatus, nextRevised, nextOrderRemark, nextProblemRemark, id]
        );
      }

      if (targetStatus === 'problem') {
        await upsertProblemOrder(
          id,
          toNumber(rows[0].order_amount, 0),
          nextRevised,
          nextProblemRemark,
          req.user?.id,
          conn
        );
      } else {
        await resolveProblemOrder(id, req.user?.id, conn);
      }

      if (targetStatus === 'completed' && previousStatus !== 'completed') {
        const store = await getStoreById(rows[0].store_id, conn);
        const completedType = buildCompletedNotificationType(previousStatus);
        const completedTitle = buildCompletedNotificationTitle(previousStatus);
        await createNotification(completedTitle, `订单${id}已完成`, id, Number(rows[0].store_id || 0), conn, {
          type: completedType,
          source_store_name: store?.name || null,
          source_contact: normalizeAnonymousFlag(rows[0].is_anonymous) ? null : rows[0].contact || null,
          source_order_info: rows[0].order_info || null,
          source_amount: amount,
          source_order_time: rows[0].created_at || new Date(),
        });
      }

      updatedIds.push(id);
    }
  });

  await writeOperationLog(req, {
    action: 'orders.batch_status',
    detail: `批量修改订单状态：${updatedIds.length}条 -> ${targetStatus}`,
    target_type: 'order',
    target_id: updatedIds.join(','),
    after: {
      order_ids: updatedIds,
      status: targetStatus,
    },
  });

  return ok(res, { order_ids: updatedIds, status: targetStatus }, '批量状态更新成功');
}

async function batchDeleteOrders(req, res) {
  if (!canBatchDeleteOrder(req.user)) {
    return fail(res, '无权限', 403);
  }

  const orderIds = parseOrderIds(req.body?.order_ids);
  if (!orderIds.length) {
    return fail(res, '必须提供 order_ids', 400);
  }

  const deletedIds = [];
  await transaction(async (conn) => {
    for (const id of orderIds) {
      const [orderRows] = await conn.execute(`SELECT * FROM orders WHERE id = ? LIMIT 1`, [id]);
      if (!orderRows.length || Number(orderRows[0].is_deleted) === 1) {
        continue;
      }

      const [existsRows] = await conn.execute(
        `SELECT id FROM recycle_orders WHERE order_id = ? AND is_restored = 0 LIMIT 1`,
        [id]
      );
      if (!existsRows.length) {
        await conn.execute(
          `INSERT INTO recycle_orders (order_id, snapshot_json, recycled_by, recycled_ip)
           VALUES (?, ?, ?, ?)`,
          [id, JSON.stringify(orderRows[0]), req.user?.id ? Number(req.user.id) : null, getClientIp(req)]
        );
      }

      await conn.execute(`UPDATE orders SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
      deletedIds.push(id);
    }
  });

  await writeOperationLog(req, {
    action: 'orders.batch_delete',
    detail: `批量删除订单：${deletedIds.length}条`,
    target_type: 'order',
    target_id: deletedIds.join(','),
    after: { order_ids: deletedIds },
  });

  return ok(res, { order_ids: deletedIds }, '批量删除成功');
}

module.exports = {
  ORDER_STATUSES,
  listOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  batchUpdateOrderStatus,
  batchDeleteOrders,
  updateOrderAmount,
  updateOrderRemark,
  updateProblemOrder,
  completeProblemOrder,
  withdrawProblemOrder,
  confirmOrder,
  assignPlayShop,
  assignShop,
  recycleOrder,
  restoreOrder,
  permanentDeleteOrder,
  deleteOrder,
  updateOrderEffective,
};



require('dotenv').config();

const axios = require('axios');
const { query, getPool } = require('../config/db');
const { VIEW_SCOPE_KEYS } = require('../utils/permissionMatrix');

const BASE_URL = `http://127.0.0.1:${Number(process.env.PORT || 3000)}`;
const httpClient = axios.create({ baseURL: BASE_URL, timeout: 10000 });

function uniq(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean)));
}

function clonePermissions(permissions = {}) {
  return {
    menus: uniq(permissions.menus),
    pages: uniq(permissions.pages),
    buttons: uniq(permissions.buttons),
    fields: uniq(permissions.fields),
    scopes: uniq(permissions.scopes),
  };
}

function mergePermissions(base, additions = {}) {
  const next = clonePermissions(base);
  Object.entries(additions).forEach(([scope, values]) => {
    if (!Array.isArray(next[scope])) {
      return;
    }
    next[scope] = uniq([...next[scope], ...(Array.isArray(values) ? values : [])]);
  });
  return next;
}

function removePermissions(base, removals = {}) {
  const next = clonePermissions(base);
  Object.entries(removals).forEach(([scope, values]) => {
    if (!Array.isArray(next[scope])) {
      return;
    }
    const removeSet = new Set((Array.isArray(values) ? values : []).map((item) => String(item || '').trim()));
    next[scope] = next[scope].filter((item) => !removeSet.has(item));
  });
  return next;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(username, password) {
  const res = await httpClient.post('/api/auth/login', { username, password });
  return {
    token: res.data?.data?.token,
    userInfo: res.data?.data?.userInfo,
  };
}

async function run() {
  let superToken = '';
  let ownerUserId = 0;
  let originalPermissions = null;

  try {
    const superLogin = await login('superadmin_demo', 'ChangeMe123!');
    superToken = String(superLogin.token || '');

    const usersRes = await httpClient.get('/api/permissions/users', {
      headers: authHeader(superToken),
    });
    const owner =
      (usersRes.data?.data?.list || []).find((item) => String(item.username) === 'store_owner_demo') ||
      (usersRes.data?.data?.list || []).find((item) => String(item.role) === 'store_owner');
    if (!owner?.id) {
      throw new Error('store_owner user not found');
    }
    ownerUserId = Number(owner.id);

    const ownerPermissionRes = await httpClient.get(`/api/permissions/users/${ownerUserId}/permissions`, {
      headers: authHeader(superToken),
    });
    originalPermissions = clonePermissions(ownerPermissionRes.data?.data?.permissions || {});

    const workingPermissions = removePermissions(
      mergePermissions(originalPermissions, {
        pages: ['orders:view', 'problem_orders:view', 'store_data:view', 'stats:view', 'notifications:view'],
        fields: ['orders:store_commission', 'orders:contact', 'orders:customer_nickname'],
        scopes: [
          VIEW_SCOPE_KEYS.ORDERS_SELF_STORE,
          VIEW_SCOPE_KEYS.STATS_SELF_STORE,
          VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
          VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
          VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
          VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
          VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
          VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
        ],
      }),
      {
        scopes: [VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT],
      }
    );

    await httpClient.put(
      `/api/permissions/users/${ownerUserId}/permissions`,
      { permissions: workingPermissions },
      { headers: authHeader(superToken) }
    );

    const ownerLogin = await login('store_owner_demo', 'ChangeMe123!');
    const ownerToken = String(ownerLogin.token || '');
    const ownerStoreId = Number(ownerLogin.userInfo?.store_id || 0);

    const orderRows = await query(
      `SELECT o.id, s.name AS store_name, o.contact, o.order_info, COALESCE(o.revised_amount, o.order_amount) AS amount, o.created_at
       FROM orders o
       LEFT JOIN stores s ON s.id = o.store_id
       WHERE o.store_id = :store_id AND o.status = 'completed' AND o.is_deleted = 0
       ORDER BY o.id DESC
       LIMIT 1`,
      { store_id: ownerStoreId }
    );
    const targetOrder = orderRows[0];
    if (!targetOrder?.id) {
      throw new Error('completed order not found for owner store');
    }

    await query(
      `INSERT INTO notifications
      (type, title, content, order_id, store_id, source_store_name, source_contact, source_order_info, source_amount, source_order_time)
      VALUES
      ('order_completed', 'permission-check', 'permission-check', :order_id, :store_id, :source_store_name, :source_contact, :source_order_info, :source_amount, :source_order_time)`,
      {
        order_id: Number(targetOrder.id),
        store_id: ownerStoreId,
        source_store_name: targetOrder.store_name || null,
        source_contact: targetOrder.contact || null,
        source_order_info: targetOrder.order_info || null,
        source_amount: Number(targetOrder.amount || 0),
        source_order_time: targetOrder.created_at || new Date(),
      }
    );
    await query(
      `DELETE FROM notification_reads WHERE user_id = :user_id AND order_id = :order_id`,
      {
        user_id: ownerUserId,
        order_id: Number(targetOrder.id),
      }
    );

    const results = {};

    const reminderRes = await httpClient.get('/api/notifications/orders', {
      headers: authHeader(ownerToken),
      params: { pageSize: 100 },
    });
    const reminderList = reminderRes.data?.data?.list || [];
    results.scenario_1_reminder_sound_permission_effective = reminderList.some(
      (item) => Number(item.order_id) === Number(targetOrder.id)
    );

    const orderDetailRes = await httpClient.get(`/api/orders/${targetOrder.id}`, {
      headers: authHeader(ownerToken),
    });
    const detail = orderDetailRes.data?.data || {};
    results.scenario_2_store_commission_visible_when_granted = detail.store_commission !== null;

    const storeDataRes = await httpClient.get('/api/store-data', {
      headers: authHeader(ownerToken),
    });
    const storeDataList = storeDataRes.data?.data?.list || [];
    results.scenario_3_store_data_page_access_with_own_scope =
      storeDataList.length > 0 && storeDataList.every((row) => Number(row.store_id) === ownerStoreId);

    const statsOverviewRes = await httpClient.get('/api/stats/overview', {
      headers: authHeader(ownerToken),
    });
    const overview = statsOverviewRes.data?.data || {};
    results.scenario_4_stats_page_access_with_own_scope = overview.store_ranking != null;

    const rankingRes = await httpClient.get('/api/stats/store-ranking', {
      headers: authHeader(ownerToken),
      params: { pageSize: 200 },
    });
    const rankingList = rankingRes.data?.data?.list || [];
    results.scenario_5_store_owner_can_view_all_rankings = rankingList.some(
      (row) => Number(row.store_id) !== ownerStoreId
    );

    results.scenario_6_store_owner_cannot_view_all_sensitive_amount = rankingList
      .filter((row) => Number(row.store_id) !== ownerStoreId)
      .every((row) => row.total_income == null && row.offline_income == null && row.online_income == null);

    const revokedCommissionPermissions = removePermissions(workingPermissions, {
      fields: ['orders:store_commission'],
      scopes: [VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION],
    });

    await httpClient.put(
      `/api/permissions/users/${ownerUserId}/permissions`,
      { permissions: revokedCommissionPermissions },
      { headers: authHeader(superToken) }
    );

    const orderAfterRevokeRes = await httpClient.get(`/api/orders/${targetOrder.id}`, {
      headers: authHeader(ownerToken),
    });
    results.scenario_7_permission_change_effective_immediately =
      orderAfterRevokeRes.data?.data?.store_commission === null;

    const ownerRelogin = await login('store_owner_demo', 'ChangeMe123!');
    const refreshedToken = String(ownerRelogin.token || '');
    const orderAfterRefreshRes = await httpClient.get(`/api/orders/${targetOrder.id}`, {
      headers: authHeader(refreshedToken),
    });
    results.scenario_8_permission_state_correct_after_refresh =
      orderAfterRefreshRes.data?.data?.store_commission === null;

    const passed = Object.values(results).every(Boolean);

    console.log(
      JSON.stringify(
        {
          base_url: BASE_URL,
          owner_user_id: ownerUserId,
          owner_store_id: ownerStoreId,
          verified_order_id: Number(targetOrder.id),
          results,
          passed,
        },
        null,
        2
      )
    );
  } finally {
    if (superToken && ownerUserId && originalPermissions) {
      try {
        await httpClient.put(
          `/api/permissions/users/${ownerUserId}/permissions`,
          { permissions: originalPermissions },
          { headers: authHeader(superToken) }
        );
      } catch (error) {
        console.error('restore_failed', error?.response?.data || error?.message || error);
      }
    }
    try {
      await getPool().end();
    } catch {
      // ignore pool close errors
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error?.response?.data || error?.message || error);
    process.exit(1);
  });

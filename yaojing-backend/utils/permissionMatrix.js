const UI_PERMISSION_SCOPES = ['menus', 'pages', 'buttons', 'fields', 'scopes'];
const EMPTY_UI_PERMISSIONS = Object.freeze({
  menus: Object.freeze([]),
  pages: Object.freeze([]),
  buttons: Object.freeze([]),
  fields: Object.freeze([]),
  scopes: Object.freeze([]),
});

const VIEW_SCOPE_KEYS = Object.freeze({
  ORDERS_SELF_STORE: 'scope:orders.self_store_orders.view',
  STATS_SELF_STORE: 'scope:stats.self_store_stats.view',
  STATS_ALL_RANKING: 'scope:stats.store_ranking_all.view',
  STATS_ALL_SENSITIVE_AMOUNT: 'scope:stats.all_store_sensitive_amount.view',
  ORDER_DETAIL_SENSITIVE_FIELDS: 'scope:orders.detail_sensitive_fields.view',
  ORDER_ALERTS_RECEIVE: 'scope:notifications.order_alerts.receive',
  ORDER_CUSTOMER_CONTACT: 'scope:orders.customer_contact.view',
  ORDER_CUSTOMER_NICKNAME: 'scope:orders.customer_nickname.view',
  ORDER_CUSTOMER_REMARK: 'scope:orders.order_remark.view',
  ORDER_STORE_COMMISSION: 'scope:orders.store_commission.view',
});

const VIEW_SCOPE_ALIAS_KEYS = Object.freeze([
  'scopes',
  'views',
  'view_scopes',
  'view_permissions',
  'views_permissions',
  'scope_permissions',
  'scopes_permissions',
  'data_scope_permissions',
  'viewScopes',
  'viewPermissions',
  'scopePermissions',
  'scopesPermissions',
  'dataScopePermissions',
]);

const LEGACY_VIEW_SCOPE_KEY_MAP = Object.freeze({
  'view:store_data:self': VIEW_SCOPE_KEYS.STATS_SELF_STORE,
  'view:store_data:own': VIEW_SCOPE_KEYS.STATS_SELF_STORE,
  'view:stats:self': VIEW_SCOPE_KEYS.STATS_SELF_STORE,
  'view:stats:own': VIEW_SCOPE_KEYS.STATS_SELF_STORE,
  'view:ranking:all_stores': VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
  'view:ranking:all': VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
  'view:stats:ranking_all': VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
  'view:amount:all_stores_sensitive': VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT,
  'view:amount:all_sensitive': VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT,
  'view:stats:all_amount': VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT,
  'view:orders:detail_sensitive_fields': VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
  'view:orders:sensitive_fields': VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
  'view:order_detail:sensitive_fields': VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
  'view:notifications:receive_audio': VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
  'view:notifications:audio': VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
  'view:notifications:view': VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
  'notifications:receive_audio': VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
  'notifications:audio': VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
  'notifications:view': VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
  'orders:notify_audio': VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
  'view:customer:contact': VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
  'view:orders:customer_contact': VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
  'view:customer:nickname': VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
  'view:orders:customer_nickname': VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
  'view:customer:order_remark': VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK,
  'view:orders:customer_order_remark': VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK,
  'view:orders:store_share': VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
  'view:orders:store_share_field': VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
  'view:store:share': VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
});

const PERMISSION_SCHEMAS = {
  menus: [
    { key: 'menu:dashboard', name: '仪表盘菜单' },
    { key: 'menu:orders', name: '订单管理菜单' },
    { key: 'menu:problem_orders', name: '问题订单菜单' },
    { key: 'menu:recycle_orders', name: '回收订单菜单' },
    { key: 'menu:online_user_orders', name: '线上用户订单菜单' },
    { key: 'menu:store_data', name: '网吧数据菜单' },
    { key: 'menu:stores', name: '网吧管理菜单' },
    { key: 'menu:play_stores', name: '陪玩店维护菜单' },
    { key: 'menu:users', name: '用户管理菜单' },
    { key: 'menu:permissions', name: '权限管理菜单' },
    { key: 'menu:operation_logs', name: '操作日志菜单' },
    { key: 'menu:stats', name: '统计分析菜单' },
  ],
  pages: [
    { key: 'dashboard:view', name: '仪表盘页面' },
    { key: 'orders:view', name: '订单管理页面' },
    { key: 'problem_orders:view', name: '问题订单页面' },
    { key: 'recycle_orders:view', name: '回收订单页面' },
    { key: 'online_user_orders:view', name: '线上用户订单页面' },
    { key: 'store_data:view', name: '网吧数据页面' },
    { key: 'stores:view', name: '网吧管理页面' },
    { key: 'play_stores:view', name: '陪玩店维护页面' },
    { key: 'page.device_management.view', name: '设备管理页面' },
    { key: 'users:view', name: '用户管理页面' },
    { key: 'permissions:view', name: '权限管理页面' },
    { key: 'operation_logs:view', name: '操作日志页面' },
    { key: 'stats:view', name: '统计分析页面' },
    { key: 'notifications:view', name: '消息提醒页面' },
  ],
  buttons: [
    { key: 'orders:create', name: '订单-新增' },
    { key: 'orders:batch_status', name: '订单-批量改状态' },
    { key: 'orders:batch_delete', name: '订单-批量删除' },
    { key: 'orders:change_status', name: '订单-改单状态' },
    { key: 'orders:edit_remark', name: '订单-编辑备注' },
    { key: 'orders:problem_save', name: '问题订单-保存修改' },
    { key: 'orders:problem_complete', name: '问题订单-订单完成' },
    { key: 'orders:problem_withdraw', name: '问题订单-撤回' },
    { key: 'orders:delete', name: '订单-删除' },
    { key: 'orders:restore', name: '订单-恢复' },
    { key: 'orders:assign_play_store', name: '订单-派单陪玩店' },
    { key: 'api.device_management.block', name: '设备管理-手动拉黑' },
    { key: 'api.device_management.unblock', name: '设备管理-解除封禁' },
    { key: 'play_store:manage', name: '陪玩店-维护' },
    { key: 'permissions:manage_users', name: '权限-个人权限管理' },
    { key: 'permissions:manage_templates', name: '权限-默认模板管理' },
  ],
  fields: [
    { key: 'orders:contact', name: '订单-联系方式字段' },
    { key: 'orders:customer_nickname', name: '订单-客户昵称字段' },
    { key: 'orders:info', name: '订单-订单信息字段' },
    { key: 'orders:source_store', name: '订单-来源网吧字段' },
    { key: 'orders:amount', name: '订单-订单金额字段' },
    { key: 'orders:order_remark', name: '订单-客户订单备注字段' },
    { key: 'orders:problem_remark', name: '订单-问题订单备注字段' },
    { key: 'orders:store_commission', name: '订单-网吧分成字段' },
    { key: 'orders:play_shop_commission', name: '订单-陪玩店分成字段' },
    { key: 'orders:platform_commission', name: '订单-平台分成字段' },
    { key: 'orders:assigned_play_shop', name: '订单-派单陪玩店字段' },
    { key: 'orders:created_at', name: '订单-下单时间字段' },
    { key: 'orders:status', name: '订单-订单状态字段' },
    { key: 'orders:deleted_status', name: '订单-删除状态字段' },
    { key: 'orders:operations', name: '订单-操作能力字段' },
  ],
  scopes: [
    { key: VIEW_SCOPE_KEYS.ORDERS_SELF_STORE, name: '查看自己网吧订单数据' },
    { key: VIEW_SCOPE_KEYS.STATS_SELF_STORE, name: '查看自己网吧统计数据' },
    { key: VIEW_SCOPE_KEYS.STATS_ALL_RANKING, name: '查看全部网吧排名' },
    { key: VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT, name: '查看全部网吧敏感金额' },
    { key: VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS, name: '查看订单详情敏感字段' },
    { key: VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE, name: '查看订单提醒/接收提醒提示音' },
    { key: VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT, name: '查看客户联系方式' },
    { key: VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME, name: '查看客户昵称' },
    { key: VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK, name: '查看客户订单备注' },
    { key: VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION, name: '查看网吧分成字段' },
  ],
};

const ROLE_TEMPLATE_OVERRIDES = Object.create(null);

function uniq(arr) {
  return Array.from(new Set(arr));
}

function allKeys(scope) {
  return PERMISSION_SCHEMAS[scope].map((item) => item.key);
}

function cloneUiPermissions(input = EMPTY_UI_PERMISSIONS) {
  return {
    menus: Array.isArray(input.menus) ? [...input.menus] : [],
    pages: Array.isArray(input.pages) ? [...input.pages] : [],
    buttons: Array.isArray(input.buttons) ? [...input.buttons] : [],
    fields: Array.isArray(input.fields) ? [...input.fields] : [],
    scopes: Array.isArray(input.scopes) ? [...input.scopes] : [],
  };
}

const ROLE_DEFAULTS = {
  super_admin: {
    menus: allKeys('menus'),
    pages: allKeys('pages'),
    buttons: allKeys('buttons'),
    fields: allKeys('fields'),
    scopes: allKeys('scopes'),
  },
  admin: {
    menus: [
      'menu:dashboard',
      'menu:orders',
      'menu:problem_orders',
      'menu:recycle_orders',
      'menu:online_user_orders',
      'menu:store_data',
      'menu:play_stores',
      'menu:operation_logs',
      'menu:stats',
    ],
    pages: [
      'dashboard:view',
      'orders:view',
      'problem_orders:view',
      'recycle_orders:view',
      'online_user_orders:view',
      'store_data:view',
      'stores:view',
      'play_stores:view',
      'page.device_management.view',
      'users:view',
      'stats:view',
      'notifications:view',
    ],
    buttons: [
      'orders:create',
      'orders:batch_status',
      'orders:change_status',
      'orders:edit_remark',
      'orders:problem_save',
      'orders:problem_complete',
      'orders:problem_withdraw',
      'orders:assign_play_store',
      'api.device_management.block',
      'api.device_management.unblock',
    ],
    fields: [
      'orders:contact',
      'orders:customer_nickname',
      'orders:info',
      'orders:source_store',
      'orders:amount',
      'orders:order_remark',
      'orders:problem_remark',
      'orders:store_commission',
      'orders:play_shop_commission',
      'orders:platform_commission',
      'orders:assigned_play_shop',
      'orders:created_at',
      'orders:status',
      'orders:deleted_status',
      'orders:operations',
    ],
    scopes: allKeys('scopes'),
  },
  store_owner: {
    menus: ['menu:dashboard', 'menu:orders', 'menu:problem_orders', 'menu:store_data', 'menu:stats'],
    pages: ['dashboard:view', 'orders:view', 'problem_orders:view', 'store_data:view', 'stats:view', 'notifications:view'],
    buttons: [],
    fields: [
      'orders:contact',
      'orders:customer_nickname',
      'orders:info',
      'orders:source_store',
      'orders:amount',
      'orders:problem_remark',
      'orders:store_commission',
      'orders:assigned_play_shop',
      'orders:created_at',
      'orders:status',
    ],
    scopes: [
      VIEW_SCOPE_KEYS.ORDERS_SELF_STORE,
      VIEW_SCOPE_KEYS.STATS_SELF_STORE,
      VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
      VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
      VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
      VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
    ],
  },
  customer_service: {
    menus: ['menu:orders', 'menu:problem_orders'],
    pages: ['orders:view', 'problem_orders:view', 'page.device_management.view', 'notifications:view'],
    buttons: [
      'orders:change_status',
      'orders:edit_remark',
      'orders:problem_save',
      'orders:problem_complete',
      'api.device_management.block',
      'api.device_management.unblock',
    ],
    fields: [
      'orders:contact',
      'orders:customer_nickname',
      'orders:info',
      'orders:source_store',
      'orders:amount',
      'orders:order_remark',
      'orders:problem_remark',
      'orders:created_at',
      'orders:status',
    ],
    scopes: [
      VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
      VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK,
    ],
  },
  finance: {
    menus: ['menu:dashboard', 'menu:orders', 'menu:store_data', 'menu:operation_logs', 'menu:stats'],
    pages: ['dashboard:view', 'orders:view', 'store_data:view', 'operation_logs:view', 'stats:view', 'notifications:view'],
    buttons: [],
    fields: [
      'orders:contact',
      'orders:customer_nickname',
      'orders:info',
      'orders:source_store',
      'orders:amount',
      'orders:order_remark',
      'orders:problem_remark',
      'orders:store_commission',
      'orders:play_shop_commission',
      'orders:platform_commission',
      'orders:assigned_play_shop',
      'orders:created_at',
      'orders:status',
      'orders:deleted_status',
    ],
    scopes: [
      VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
      VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
      VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
      VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK,
      VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
    ],
  },
};

const MENU_KEY_SET = new Set(allKeys('menus'));
const PAGE_KEY_SET = new Set(allKeys('pages'));
const BUTTON_KEY_SET = new Set(allKeys('buttons'));
const FIELD_KEY_SET = new Set(allKeys('fields'));
const SCOPES_KEY_SET = new Set(allKeys('scopes'));

function normalizeList(input, fallback = [], allowedSet = null) {
  const source = Array.isArray(input) ? input : fallback;
  return uniq(
    source
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter((item) => (allowedSet ? allowedSet.has(item) : true))
  );
}

function pickFirstArrayField(source, keys = []) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    return source[key];
  }

  return undefined;
}

function resolveScopeInput(source) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'scopes')) {
    return source.scopes;
  }

  return pickFirstArrayField(source, VIEW_SCOPE_ALIAS_KEYS);
}

function normalizeScopeKey(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const mapped = LEGACY_VIEW_SCOPE_KEY_MAP[raw.toLowerCase()];
  return mapped || raw;
}

function normalizeScopeList(input, fallback = []) {
  const source = Array.isArray(input) ? input : fallback;
  return uniq(
    source
      .map((item) => normalizeScopeKey(item))
      .filter(Boolean)
      .filter((item) => SCOPES_KEY_SET.has(item))
  );
}

function normalizeUiPermissions(input, fallback = EMPTY_UI_PERMISSIONS) {
  const source = input || {};
  const sourceScopes = resolveScopeInput(source);
  const fallbackScopes = resolveScopeInput(fallback);

  return {
    menus: normalizeList(source.menus, fallback.menus, MENU_KEY_SET),
    pages: normalizeList(source.pages, fallback.pages, PAGE_KEY_SET),
    buttons: normalizeList(source.buttons, fallback.buttons, BUTTON_KEY_SET),
    fields: normalizeList(source.fields, fallback.fields, FIELD_KEY_SET),
    scopes: normalizeScopeList(sourceScopes, Array.isArray(fallbackScopes) ? fallbackScopes : []),
  };
}

function withViewScopeAliases(permissions, fallback = EMPTY_UI_PERMISSIONS) {
  const normalized = normalizeUiPermissions(permissions, fallback);
  const scopes = [...normalized.scopes];

  return {
    ...normalized,
    views: [...scopes],
  };
}

function getBuiltInRoleDefaultUiPermissions(role) {
  const builtIn = ROLE_DEFAULTS[String(role || '').trim()];
  return cloneUiPermissions(builtIn || EMPTY_UI_PERMISSIONS);
}

function getRoleDefaultUiPermissions(role) {
  const roleCode = String(role || '').trim();
  if (!roleCode) {
    return cloneUiPermissions(EMPTY_UI_PERMISSIONS);
  }

  if (Object.prototype.hasOwnProperty.call(ROLE_TEMPLATE_OVERRIDES, roleCode)) {
    return cloneUiPermissions(ROLE_TEMPLATE_OVERRIDES[roleCode]);
  }

  return getBuiltInRoleDefaultUiPermissions(roleCode);
}

function resetRoleTemplateOverrides() {
  for (const key of Object.keys(ROLE_TEMPLATE_OVERRIDES)) {
    delete ROLE_TEMPLATE_OVERRIDES[key];
  }
}

function setRoleTemplateOverride(role, permissions) {
  const roleCode = String(role || '').trim();
  if (!roleCode) {
    return;
  }
  const fallback = getBuiltInRoleDefaultUiPermissions(roleCode);
  ROLE_TEMPLATE_OVERRIDES[roleCode] = normalizeUiPermissions(permissions, fallback);
}

function setRoleTemplateOverrides(templates = {}) {
  resetRoleTemplateOverrides();
  Object.entries(templates).forEach(([role, permissions]) => {
    setRoleTemplateOverride(role, permissions);
  });
}

module.exports = {
  UI_PERMISSION_SCOPES,
  EMPTY_UI_PERMISSIONS,
  VIEW_SCOPE_KEYS,
  VIEW_SCOPE_ALIAS_KEYS,
  PERMISSION_SCHEMAS,
  ROLE_DEFAULTS,
  getBuiltInRoleDefaultUiPermissions,
  getRoleDefaultUiPermissions,
  normalizeUiPermissions,
  withViewScopeAliases,
  setRoleTemplateOverride,
  setRoleTemplateOverrides,
  resetRoleTemplateOverrides,
};

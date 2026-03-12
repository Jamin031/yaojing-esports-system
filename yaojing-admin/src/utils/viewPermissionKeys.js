export const VIEW_SCOPE_KEYS = Object.freeze({
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

export const LEGACY_VIEW_SCOPE_KEY_MAP = Object.freeze({
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

function uniq(values) {
  return Array.from(new Set(values));
}

export function normalizeViewPermissionKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  const mapped = LEGACY_VIEW_SCOPE_KEY_MAP[raw.toLowerCase()];
  return mapped || raw;
}

export function normalizeViewPermissionKeys(keys) {
  const list = Array.isArray(keys) ? keys : [];
  return uniq(
    list
      .map((item) => normalizeViewPermissionKey(item))
      .filter(Boolean),
  );
}

export const STORE_DATA_SELF_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.STATS_SELF_STORE,
  'view:store_data:self',
  'view:store_data:own',
  'view:stats:self',
  'view:stats:own',
]);

export const STATS_SELF_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.STATS_SELF_STORE,
  'view:stats:self',
  'view:stats:own',
]);

export const ALL_STORE_RANKING_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.STATS_ALL_RANKING,
  'view:ranking:all_stores',
  'view:ranking:all',
  'view:stats:ranking_all',
]);

export const ALL_STORE_SENSITIVE_AMOUNT_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.STATS_ALL_SENSITIVE_AMOUNT,
  'view:amount:all_stores_sensitive',
  'view:amount:all_sensitive',
  'view:stats:all_amount',
]);

export const ORDER_DETAIL_SENSITIVE_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.ORDER_DETAIL_SENSITIVE_FIELDS,
  'view:orders:detail_sensitive_fields',
  'view:orders:sensitive_fields',
  'view:order_detail:sensitive_fields',
]);

export const NOTIFICATION_AUDIO_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.ORDER_ALERTS_RECEIVE,
  'view:notifications:receive_audio',
  'view:notifications:audio',
  'view:notifications:view',
  'notifications:receive_audio',
  'notifications:audio',
  'notifications:view',
  'orders:notify_audio',
]);

export const CUSTOMER_CONTACT_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.ORDER_CUSTOMER_CONTACT,
  'view:customer:contact',
  'view:orders:customer_contact',
]);

export const CUSTOMER_NICKNAME_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.ORDER_CUSTOMER_NICKNAME,
  'view:customer:nickname',
  'view:orders:customer_nickname',
]);

export const CUSTOMER_REMARK_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.ORDER_CUSTOMER_REMARK,
  'view:customer:order_remark',
  'view:orders:customer_order_remark',
]);

export const STORE_SHARE_FIELD_VIEW_KEYS = normalizeViewPermissionKeys([
  VIEW_SCOPE_KEYS.ORDER_STORE_COMMISSION,
  'view:orders:store_share',
  'view:orders:store_share_field',
  'view:store:share',
]);

export const DEFAULT_VIEW_PERMISSION_SCHEMAS = [
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
];

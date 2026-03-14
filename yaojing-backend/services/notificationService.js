const {
  normalizeSource,
  isValidSource,
  getAdminLiveTopic: getAdminLiveTopicFromNtfy,
  getOwnerFinishedTopic: getOwnerFinishedTopicFromNtfy,
  sendNtfyNotification,
  deleteNtfyNotification,
} = require('./ntfyService');

const TITLE_NEW_ORDER = '\u66dc\u7ade\u65b0\u8ba2\u5355\u63d0\u9192';
const TITLE_ORDER_FINISHED = '\u66dc\u7ade\u8ba2\u5355\u5b8c\u6210\u63d0\u9192';
const TITLE_ORDER_REVOKED = '\u66dc\u7ade\u8ba2\u5355\u72b6\u6001\u53d8\u66f4\u63d0\u9192';
const REVOKED_STATUS_TEXT = '\u5df2\u64a4\u9500\u5b8c\u6210';
const REVOKED_HINT_TEXT = '\u8bf7\u4ee5\u540e\u53f0\u6700\u65b0\u72b6\u6001\u4e3a\u51c6';

function normalizeText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `\u00a5${amount.toFixed(2)}` : '-';
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: process.env.NTFY_TIMEZONE || 'Asia/Shanghai',
  }).format(date);
}

function getAdminLiveTopic(source) {
  return getAdminLiveTopicFromNtfy(source);
}

function getOwnerFinishedTopic(source) {
  return getOwnerFinishedTopicFromNtfy(source);
}

function resolveNotificationSource(payload = {}) {
  return normalizeSource(
    pickFirstText(
      payload.source,
      payload.source_key,
      payload.sourceKey,
      payload.channel,
      payload.channel_key,
      payload.channelKey,
      payload.order?.source,
      payload.order?.source_key,
      payload.order?.sourceKey,
      payload.order?.channel,
      payload.order?.channel_key,
      payload.order?.channelKey,
      payload.order?.store_key,
      payload.order?.storeKey,
      payload.store?.source,
      payload.store?.source_key,
      payload.store?.sourceKey,
      payload.store?.store_key,
      payload.store?.storeKey,
      payload.store_key,
      payload.storeKey
    )
  );
}

function resolveOrderId(payload = {}) {
  const orderId = pickFirstDefined(payload.order?.id, payload.order_id, payload.orderId, payload.id);
  const numericOrderId = Number(orderId);
  return Number.isFinite(numericOrderId) && numericOrderId > 0 ? numericOrderId : null;
}

function resolveStoreName(payload = {}) {
  return normalizeText(
    pickFirstText(
      payload.store?.name,
      payload.order?.store_name,
      payload.order?.storeName,
      payload.store_name,
      payload.storeName
    )
  );
}

function resolveOrderNo(payload = {}) {
  const orderId = resolveOrderId(payload);
  return normalizeText(
    pickFirstText(payload.order?.order_no, payload.order?.orderNo, payload.order_no, payload.orderNo),
    orderId ? String(orderId) : '-'
  );
}

function resolveOrderAmount(payload = {}) {
  return pickFirstDefined(
    payload.order?.revised_amount,
    payload.order?.revisedAmount,
    payload.order?.amount,
    payload.order?.order_amount,
    payload.order?.orderAmount,
    payload.revised_amount,
    payload.revisedAmount,
    payload.amount,
    payload.order_amount,
    payload.orderAmount
  );
}

function resolveCreatedAt(payload = {}) {
  return pickFirstDefined(
    payload.order?.created_at,
    payload.order?.createdAt,
    payload.created_at,
    payload.createdAt,
    new Date()
  );
}

function resolveCompletedAt(payload = {}) {
  return pickFirstDefined(
    payload.completed_at,
    payload.completedAt,
    payload.order?.completed_at,
    payload.order?.completedAt,
    payload.order?.updated_at,
    payload.order?.updatedAt,
    payload.updated_at,
    payload.updatedAt,
    new Date()
  );
}

function resolveGameName(payload = {}) {
  return normalizeText(
    pickFirstText(payload.game_name, payload.gameName, payload.order?.game_name, payload.order?.gameName)
  );
}

function resolveServiceName(payload = {}) {
  return normalizeText(
    pickFirstText(
      payload.service_name,
      payload.serviceName,
      payload.order?.service_name,
      payload.order?.serviceName
    )
  );
}

function resolveOrderInfo(payload = {}) {
  return normalizeText(
    pickFirstText(payload.order?.order_info, payload.order?.orderInfo, payload.order_info, payload.orderInfo)
  );
}

function resolveCustomerNickname(payload = {}) {
  return normalizeText(
    pickFirstText(
      payload.order?.customer_nickname,
      payload.order?.customerNickname,
      payload.customer_nickname,
      payload.customerNickname
    )
  );
}

function resolveCustomerContact(payload = {}) {
  return normalizeText(
    pickFirstText(
      payload.order?.customer_contact,
      payload.order?.customerContact,
      payload.order?.contact,
      payload.contact,
      payload.customer_contact,
      payload.customerContact
    )
  );
}

function buildMessage(lines = []) {
  return lines.filter(Boolean).join('\n');
}

function buildSourceSkipLogContext(payload = {}) {
  return {
    order_id: resolveOrderId(payload),
    store_id: payload.order?.store_id || payload.store?.id || payload.store_id || null,
    source: payload.source || null,
    source_key: payload.source_key || payload.sourceKey || null,
    channel: payload.channel || payload.channelKey || null,
    order_store_key: payload.order?.store_key || payload.order?.storeKey || null,
    store_key:
      payload.store?.store_key || payload.store?.storeKey || payload.store_key || payload.storeKey || null,
  };
}

function getFinishedSequenceId(payload = {}) {
  const orderId = resolveOrderId(payload);
  return orderId ? `order-finished-${orderId}` : '';
}

function buildNewOrderMessage(payload = {}, source = '') {
  return buildMessage([
    `\u8ba2\u5355\u53f7\uff1a${resolveOrderNo(payload)}`,
    `\u6765\u6e90 source\uff1a${normalizeText(source)}`,
    `\u95e8\u5e97\u540d\u79f0\uff1a${resolveStoreName(payload)}`,
    `\u6e38\u620f\uff1a${resolveGameName(payload)}`,
    `\u670d\u52a1\u7c7b\u578b\uff1a${resolveServiceName(payload)}`,
    `\u8ba2\u5355\u4fe1\u606f\uff1a${resolveOrderInfo(payload)}`,
    `\u91d1\u989d\uff1a${formatMoney(resolveOrderAmount(payload))}`,
    `\u7528\u6237\u79f0\u547c\uff1a${resolveCustomerNickname(payload)}`,
    `\u8054\u7cfb\u65b9\u5f0f\uff1a${resolveCustomerContact(payload)}`,
    `\u521b\u5efa\u65f6\u95f4\uff1a${formatDateTime(resolveCreatedAt(payload))}`,
  ]);
}

function buildOrderFinishedMessage(payload = {}, source = '') {
  return buildMessage([
    `\u8ba2\u5355\u53f7\uff1a${resolveOrderNo(payload)}`,
    `\u6765\u6e90 source\uff1a${normalizeText(source)}`,
    `\u95e8\u5e97\u540d\u79f0\uff1a${resolveStoreName(payload)}`,
    `\u91d1\u989d\uff1a${formatMoney(resolveOrderAmount(payload))}`,
    `\u5b8c\u6210\u65f6\u95f4\uff1a${formatDateTime(resolveCompletedAt(payload))}`,
  ]);
}

function buildOrderRevokedMessage(payload = {}, source = '') {
  return buildMessage([
    `\u8ba2\u5355\u53f7\uff1a${resolveOrderNo(payload)}`,
    `\u6765\u6e90 source\uff1a${normalizeText(source)}`,
    `\u5f53\u524d\u72b6\u6001\uff1a${REVOKED_STATUS_TEXT}`,
    `\u63d0\u793a\uff1a${REVOKED_HINT_TEXT}`,
  ]);
}

async function notifyNewOrder(payload = {}) {
  try {
    const source = resolveNotificationSource(payload);
    if (!isValidSource(source)) {
      console.warn('[ntfy] skip new-order notification because source is missing or invalid', buildSourceSkipLogContext(payload));
      return { sent: false, skipped: true, reason: 'source_missing' };
    }

    return sendNtfyNotification({
      topic: getAdminLiveTopic(source),
      title: TITLE_NEW_ORDER,
      message: buildNewOrderMessage(payload, source),
      tags: ['rotating_light', 'shopping_cart'],
      priority: 'high',
    });
  } catch (error) {
    console.error('[ntfy] notifyNewOrder failed', {
      order_id: resolveOrderId(payload),
      message: error?.message || error,
    });
    return { sent: false, skipped: false, reason: 'unexpected_error' };
  }
}

async function notifyOrderFinished(payload = {}) {
  try {
    const source = resolveNotificationSource(payload);
    if (!isValidSource(source)) {
      console.warn('[ntfy] skip finished-order notification because source is missing or invalid', buildSourceSkipLogContext(payload));
      return { sent: false, skipped: true, reason: 'source_missing' };
    }

    const sequenceId = getFinishedSequenceId(payload);
    if (!sequenceId) {
      console.warn('[ntfy] skip finished-order notification because order_id is missing', buildSourceSkipLogContext(payload));
      return { sent: false, skipped: true, reason: 'order_id_missing' };
    }

    return sendNtfyNotification({
      topic: getOwnerFinishedTopic(source),
      title: TITLE_ORDER_FINISHED,
      message: buildOrderFinishedMessage(payload, source),
      tags: ['white_check_mark', 'moneybag'],
      priority: 'default',
      sequenceId,
    });
  } catch (error) {
    console.error('[ntfy] notifyOrderFinished failed', {
      order_id: resolveOrderId(payload),
      message: error?.message || error,
    });
    return { sent: false, skipped: false, reason: 'unexpected_error' };
  }
}

async function revokeFinishedNotification(payload = {}) {
  try {
    const source = resolveNotificationSource(payload);
    if (!isValidSource(source)) {
      console.warn('[ntfy] skip revoke finished notification because source is missing or invalid', buildSourceSkipLogContext(payload));
      return { revoked: false, skipped: true, reason: 'source_missing' };
    }

    const sequenceId = getFinishedSequenceId(payload);
    if (!sequenceId) {
      console.warn('[ntfy] skip revoke finished notification because order_id is missing', buildSourceSkipLogContext(payload));
      return { revoked: false, skipped: true, reason: 'order_id_missing' };
    }

    const topic = getOwnerFinishedTopic(source);
    const deleteResult = await deleteNtfyNotification({
      topic,
      sequenceId,
    });

    const correctionResult = await sendNtfyNotification({
      topic,
      title: TITLE_ORDER_REVOKED,
      message: buildOrderRevokedMessage(payload, source),
      tags: ['warning', 'information_source'],
      priority: 'high',
    });

    return {
      revoked: Boolean(deleteResult?.deleted),
      corrected: Boolean(correctionResult?.sent),
      skipped: false,
      topic,
      sequence_id: sequenceId,
      delete: deleteResult,
      correction: correctionResult,
    };
  } catch (error) {
    console.error('[ntfy] revokeFinishedNotification failed', {
      order_id: resolveOrderId(payload),
      message: error?.message || error,
    });
    return { revoked: false, skipped: false, reason: 'unexpected_error' };
  }
}

module.exports = {
  getAdminLiveTopic,
  getOwnerFinishedTopic,
  getFinishedSequenceId,
  resolveNotificationSource,
  notifyNewOrder,
  notifyOrderFinished,
  revokeFinishedNotification,
};

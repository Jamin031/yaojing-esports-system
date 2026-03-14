const {
  normalizeSource,
  isValidSource,
  getAdminLiveTopic,
  getOwnerFinishedTopic,
  sendNtfyNotification,
} = require('./ntfyService');

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
  return Number.isFinite(amount) ? `￥${amount.toFixed(2)}` : '-';
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
  return normalizeText(
    pickFirstText(payload.order?.order_no, payload.order?.orderNo, payload.order_no, payload.orderNo)
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
    pickFirstText(
      payload.order?.order_info,
      payload.order?.orderInfo,
      payload.order_info,
      payload.orderInfo
    )
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
    order_id: payload.order?.id || payload.order_id || null,
    store_id: payload.order?.store_id || payload.store?.id || payload.store_id || null,
    source: payload.source || null,
    source_key: payload.source_key || payload.sourceKey || null,
    channel: payload.channel || payload.channelKey || null,
    order_store_key: payload.order?.store_key || payload.order?.storeKey || null,
    store_key: payload.store?.store_key || payload.store?.storeKey || payload.store_key || payload.storeKey || null,
  };
}

async function notifyNewOrder(payload = {}) {
  try {
    const source = resolveNotificationSource(payload);
    if (!isValidSource(source)) {
      console.warn('[ntfy] skip new-order notification because source is missing or invalid', buildSourceSkipLogContext(payload));
      return { sent: false, skipped: true, reason: 'source_missing' };
    }

    const message = buildMessage([
      `订单号：${resolveOrderNo(payload)}`,
      `来源 source：${source}`,
      `门店名称：${resolveStoreName(payload)}`,
      `游戏：${resolveGameName(payload)}`,
      `服务类型：${resolveServiceName(payload)}`,
      `订单信息：${resolveOrderInfo(payload)}`,
      `金额：${formatMoney(resolveOrderAmount(payload))}`,
      `用户称呼：${resolveCustomerNickname(payload)}`,
      `联系方式：${resolveCustomerContact(payload)}`,
      `创建时间：${formatDateTime(resolveCreatedAt(payload))}`,
    ]);

    return sendNtfyNotification({
      topic: getAdminLiveTopic(source),
      title: '曜竞新订单提醒',
      message,
      tags: ['rotating_light', 'shopping_cart'],
      priority: 'high',
    });
  } catch (error) {
    console.error('[ntfy] notifyNewOrder failed', {
      order_id: payload.order?.id || payload.order_id || null,
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

    const message = buildMessage([
      `订单号：${resolveOrderNo(payload)}`,
      `来源 source：${source}`,
      `门店名称：${resolveStoreName(payload)}`,
      `金额：${formatMoney(resolveOrderAmount(payload))}`,
      `完成时间：${formatDateTime(resolveCompletedAt(payload))}`,
      '订单已完成，请关注收益/记录',
    ]);

    return sendNtfyNotification({
      topic: getOwnerFinishedTopic(source),
      title: '曜竞订单完成提醒',
      message,
      tags: ['white_check_mark', 'moneybag'],
      priority: 'default',
    });
  } catch (error) {
    console.error('[ntfy] notifyOrderFinished failed', {
      order_id: payload.order?.id || payload.order_id || null,
      message: error?.message || error,
    });
    return { sent: false, skipped: false, reason: 'unexpected_error' };
  }
}

module.exports = {
  resolveNotificationSource,
  notifyNewOrder,
  notifyOrderFinished,
};

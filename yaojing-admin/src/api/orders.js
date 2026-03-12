import request from '../utils/request';

export function getOrdersApi(params) {
  return request({
    url: '/orders',
    method: 'get',
    params,
  });
}

export function createOrderApi(data) {
  return request({
    url: '/orders',
    method: 'post',
    data,
  });
}

export function updateOrderStatusApi(orderId, status) {
  return request({
    url: `/orders/${orderId}/status`,
    method: 'patch',
    data: { status },
  });
}

export function updateOrderRemarkApi(orderId, remark) {
  const content = String(remark ?? '');
  return request({
    url: `/orders/${orderId}/remark`,
    method: 'patch',
    data: {
      remark: content,
      note: content,
      order_remark: content,
      order_note: content,
    },
  });
}

export function assignOrderPlayStoreApi(orderId, playStoreId) {
  return request({
    url: `/orders/${orderId}/assign-play-store`,
    method: 'patch',
    data: {
      play_store_id: playStoreId,
      play_shop_id: playStoreId,
      shop_id: playStoreId,
    },
  });
}

export function updateOrderEffectiveApi(orderId, isEffective) {
  return request({
    url: `/orders/${orderId}/effective`,
    method: 'patch',
    data: { is_effective: isEffective },
  });
}

export function deleteOrderApi(orderId) {
  return request({
    url: `/orders/${orderId}`,
    method: 'delete',
  });
}

export function restoreOrderApi(orderId) {
  return request({
    url: `/orders/${orderId}/restore`,
    method: 'patch',
  });
}

export function batchDeleteOrdersApi(orderIds) {
  return request({
    url: '/orders/batch-delete',
    method: 'post',
    data: { order_ids: orderIds },
  });
}

export function batchUpdateOrderStatusApi(orderIds, status) {
  return request({
    url: '/orders/batch-status',
    method: 'patch',
    data: { order_ids: orderIds, status },
  });
}

export function updateProblemOrderApi(orderId, payload) {
  return request({
    url: `/orders/${orderId}/problem`,
    method: 'patch',
    data: payload,
  });
}

export function completeProblemOrderApi(orderId, payload = {}) {
  return request({
    url: `/orders/${orderId}/problem/complete`,
    method: 'patch',
    data: payload,
  });
}

export function revokeProblemOrderApi(orderId, payload = {}) {
  return request({
    url: `/orders/${orderId}/problem/withdraw`,
    method: 'patch',
    data: payload,
  });
}

export function permanentDeleteOrderApi(orderId) {
  return request({
    url: `/orders/${orderId}/permanent`,
    method: 'delete',
  });
}

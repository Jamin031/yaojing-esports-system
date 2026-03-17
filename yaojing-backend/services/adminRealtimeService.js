const ADMIN_LIVE_SOCKET_ROLES = Object.freeze(['super_admin', 'admin', 'customer_service']);

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase();
}

function collectUserRoles(user = {}) {
  const roleSet = new Set();
  const primaryRole = normalizeRole(user.role);
  if (primaryRole) {
    roleSet.add(primaryRole);
  }

  if (Array.isArray(user.roles)) {
    user.roles.forEach((role) => {
      const normalizedRole = normalizeRole(role);
      if (normalizedRole) {
        roleSet.add(normalizedRole);
      }
    });
  }

  return Array.from(roleSet);
}

function joinSocketRooms(socket) {
  if (!socket?.user || typeof socket.join !== 'function') {
    return;
  }

  const user = socket.user;
  const userId = Number(user.user_id || user.id || 0);
  if (userId > 0) {
    socket.join(`user:${userId}`);
  }

  collectUserRoles(user).forEach((role) => {
    socket.join(`role:${role}`);
  });

  const storeId = Number(user.store_id || 0);
  if (storeId > 0) {
    socket.join(`store:${storeId}`);
  }
}

function emitToAdminRoles(io, eventName, payload = {}) {
  if (!io || typeof io.to !== 'function') {
    return { emitted: false, reason: 'io_missing' };
  }

  let broadcaster = io;
  ADMIN_LIVE_SOCKET_ROLES.forEach((role) => {
    broadcaster = broadcaster.to(`role:${role}`);
  });
  broadcaster.emit(eventName, payload);

  return { emitted: true };
}

function emitNewOrderCreated(io, payload = {}) {
  const orderId = Number(payload.order?.id || payload.order_id || 0);
  return emitToAdminRoles(io, 'order:new', {
    order_id: Number.isFinite(orderId) && orderId > 0 ? orderId : null,
    store_id: Number(payload.order?.store_id || payload.store_id || 0) || null,
    source: String(payload.source || payload.order?.store_key || '').trim() || null,
    device_id: String(payload.order?.device_id || payload.device_id || '').trim() || null,
    risk_score: Number(payload.order?.risk_score || payload.risk_score || 0) || 0,
    risk_level: String(payload.order?.risk_level || payload.risk_level || '').trim() || 'low',
    review_status: String(payload.order?.review_status || payload.review_status || '').trim() || 'normal',
    created_at: payload.order?.created_at || payload.created_at || new Date().toISOString(),
  });
}

function emitOrderRiskUpdated(io, payload = {}) {
  const orderId = Number(payload.order?.id || payload.order_id || 0);
  return emitToAdminRoles(io, 'order:risk-updated', {
    order_id: Number.isFinite(orderId) && orderId > 0 ? orderId : null,
    device_id: String(payload.order?.device_id || payload.device_id || '').trim() || null,
    risk_score: Number(payload.order?.risk_score || payload.risk_score || 0) || 0,
    risk_level: String(payload.order?.risk_level || payload.risk_level || '').trim() || 'low',
    review_status: String(payload.order?.review_status || payload.review_status || '').trim() || 'normal',
    status: String(payload.order?.status || payload.status || '').trim() || null,
    updated_at: payload.order?.updated_at || payload.updated_at || new Date().toISOString(),
  });
}

function emitDeviceRiskUpdated(io, payload = {}) {
  return emitToAdminRoles(io, 'device:risk-updated', {
    device_id: String(payload.device?.device_id || payload.device_id || '').trim() || null,
    source: String(payload.device?.source || payload.source || '').trim() || null,
    risk_score: Number(payload.device?.last_risk_score || payload.risk_score || 0) || 0,
    risk_level: String(payload.device?.last_risk_level || payload.risk_level || '').trim() || 'low',
    status: String(payload.device?.current_status || payload.status || '').trim() || 'normal',
    updated_at: payload.device?.updated_at || payload.updated_at || new Date().toISOString(),
  });
}

function emitUserPermissionUpdated(io, payload = {}) {
  if (!io || typeof io.to !== 'function') {
    return { emitted: false, reason: 'io_missing' };
  }

  const userId = Number(payload.user_id || payload.userId || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    return { emitted: false, reason: 'user_missing' };
  }

  io.to(`user:${userId}`).emit('permissions:updated', {
    user_id: userId,
    updated_at: new Date().toISOString(),
  });

  return { emitted: true };
}

function emitRolePermissionTemplateUpdated(io, payload = {}) {
  if (!io || typeof io.to !== 'function') {
    return { emitted: false, reason: 'io_missing' };
  }

  const role = normalizeRole(payload.role);
  if (!role) {
    return { emitted: false, reason: 'role_missing' };
  }

  io.to(`role:${role}`).emit('permissions:template-updated', {
    role,
    updated_at: new Date().toISOString(),
  });

  return { emitted: true };
}

module.exports = {
  ADMIN_LIVE_SOCKET_ROLES,
  emitDeviceRiskUpdated,
  emitRolePermissionTemplateUpdated,
  joinSocketRooms,
  emitNewOrderCreated,
  emitOrderRiskUpdated,
  emitUserPermissionUpdated,
};

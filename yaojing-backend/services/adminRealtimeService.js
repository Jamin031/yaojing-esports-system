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

function emitNewOrderCreated(io, payload = {}) {
  if (!io || typeof io.to !== 'function') {
    return { emitted: false, reason: 'io_missing' };
  }

  const orderId = Number(payload.order?.id || payload.order_id || 0);
  let broadcaster = io;
  ADMIN_LIVE_SOCKET_ROLES.forEach((role) => {
    broadcaster = broadcaster.to(`role:${role}`);
  });

  broadcaster.emit('order:new', {
    order_id: Number.isFinite(orderId) && orderId > 0 ? orderId : null,
    store_id: Number(payload.order?.store_id || payload.store_id || 0) || null,
    source: String(payload.source || payload.order?.store_key || '').trim() || null,
    created_at: payload.order?.created_at || payload.created_at || new Date().toISOString(),
  });

  return { emitted: true };
}

module.exports = {
  ADMIN_LIVE_SOCKET_ROLES,
  joinSocketRooms,
  emitNewOrderCreated,
};

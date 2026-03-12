const SUPER_ADMIN_SELF_PROTECTED_PERMISSION_KEYS = {
  menus: ['menu:permissions', 'menu:users', 'menu:stores', 'menu:orders'],
  pages: ['permissions:view', 'users:view', 'stores:view', 'orders:view'],
  buttons: ['permissions:manage_users', 'permissions:manage_templates', 'orders:change_status'],
  fields: ['orders:operations'],
};

function normalizeRole(value) {
  return String(value || '').trim();
}

function toId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function findMissingSelfProtectedKeys(permissions = {}) {
  const missing = [];

  for (const scope of Object.keys(SUPER_ADMIN_SELF_PROTECTED_PERMISSION_KEYS)) {
    const required = SUPER_ADMIN_SELF_PROTECTED_PERMISSION_KEYS[scope] || [];
    const granted = new Set(toArray(permissions[scope]).map((item) => String(item || '').trim()).filter(Boolean));
    for (const key of required) {
      if (!granted.has(key)) {
        missing.push(`${scope}.${key}`);
      }
    }
  }

  return missing;
}

function validateSuperAdminSelfPermissionUpdate({
  operatorUserId,
  targetUserId,
  currentRole,
  nextRole,
  permissions,
} = {}) {
  const operatorId = toId(operatorUserId);
  const targetId = toId(targetUserId);
  if (!operatorId || !targetId || operatorId !== targetId) {
    return { ok: true, missing: [] };
  }

  const current = normalizeRole(currentRole);
  const next = normalizeRole(nextRole || currentRole);
  const isSelfSuperAdmin = current === 'super_admin' || next === 'super_admin';
  if (!isSelfSuperAdmin) {
    return { ok: true, missing: [] };
  }

  if (next && next !== 'super_admin') {
    return {
      ok: false,
      reason: 'role_downgrade',
      missing: ['role.super_admin'],
    };
  }

  const missing = findMissingSelfProtectedKeys(permissions);
  if (missing.length) {
    return {
      ok: false,
      reason: 'missing_core_permissions',
      missing,
    };
  }

  return { ok: true, missing: [] };
}

module.exports = {
  SUPER_ADMIN_SELF_PROTECTED_PERMISSION_KEYS,
  findMissingSelfProtectedKeys,
  validateSuperAdminSelfPermissionUpdate,
};

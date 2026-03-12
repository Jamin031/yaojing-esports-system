const { parseJson } = require('../utils/access');
const { resolveUserUiPermissionState } = require('../utils/userPermissionProfile');
const { VIEW_SCOPE_KEYS } = require('../utils/permissionMatrix');

function hasRole(user, role) {
  if (!user) {
    return false;
  }
  const roleSet = new Set([
    ...(Array.isArray(user.roles) ? user.roles : []),
    user.role,
  ]);
  return roleSet.has(role);
}

function hasAnyRole(user, roles = []) {
  return roles.some((role) => hasRole(user, role));
}

function hasPermission(user, permissionCode) {
  if (!user || !permissionCode) {
    return false;
  }

  if (hasRole(user, 'super_admin')) {
    return true;
  }

  const codes = Array.isArray(user.permissions) ? user.permissions : [];
  if (codes.includes(permissionCode)) {
    return true;
  }

  const legacyPermissions = parseJson(user.admin_permissions, {});
  if (permissionCode === 'api.orders.update_status' && legacyPermissions.can_confirm_order) {
    return true;
  }

  return false;
}

function getPrimaryRole(user) {
  if (!user) {
    return '';
  }
  const roleFromLegacy = String(user.role || '').trim();
  if (roleFromLegacy) {
    return roleFromLegacy;
  }
  if (Array.isArray(user.roles)) {
    const roleFromArray = user.roles.find((item) => String(item || '').trim());
    return String(roleFromArray || '').trim();
  }
  return '';
}

function resolveUiPermissions(user) {
  if (!user) {
    return { menus: [], pages: [], buttons: [], fields: [], scopes: [] };
  }

  const role = getPrimaryRole(user);
  return resolveUserUiPermissionState(user.admin_permissions, role).effectivePermissions;
}

function hasPagePermission(user, pageKey) {
  if (!user || !pageKey) {
    return false;
  }

  if (hasRole(user, 'super_admin')) {
    return true;
  }

  const pages = resolveUiPermissions(user).pages;
  return pages.includes(pageKey);
}

function hasButtonPermission(user, buttonKey) {
  if (!user || !buttonKey) {
    return false;
  }

  if (hasRole(user, 'super_admin')) {
    return true;
  }

  const buttons = resolveUiPermissions(user).buttons;
  return buttons.includes(buttonKey);
}

function hasFieldPermission(user, fieldKey) {
  if (!user || !fieldKey) {
    return false;
  }

  if (hasRole(user, 'super_admin')) {
    return true;
  }

  const fields = resolveUiPermissions(user).fields;
  return fields.includes(fieldKey);
}

function hasScopePermission(user, scopeKey) {
  if (!user || !scopeKey) {
    return false;
  }

  if (hasRole(user, 'super_admin')) {
    return true;
  }

  const scopes = resolveUiPermissions(user).scopes;
  return scopes.includes(scopeKey);
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    }

    if (!hasAnyRole(req.user, roles)) {
      return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
    }

    next();
  };
}

function requirePermission(...permissionCodes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    }

    if (!permissionCodes.some((code) => hasPermission(req.user, code))) {
      return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
    }

    next();
  };
}

function requirePagePermission(...pageCodes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    }

    if (!pageCodes.some((code) => hasPagePermission(req.user, code))) {
      return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
    }

    next();
  };
}

function requireButtonPermission(...buttonCodes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    }

    if (!buttonCodes.some((code) => hasButtonPermission(req.user, code))) {
      return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
    }

    next();
  };
}

function requireFieldPermission(...fieldCodes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    }

    if (!fieldCodes.every((code) => hasFieldPermission(req.user, code))) {
      return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
    }

    next();
  };
}

function requireScopePermission(...scopeCodes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    }

    if (!scopeCodes.some((code) => hasScopePermission(req.user, code))) {
      return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
    }

    next();
  };
}

function hasAdminPermission(user, key) {
  if (!user) {
    return false;
  }

  if (hasRole(user, 'super_admin')) {
    return true;
  }

  const permissions = parseJson(user.admin_permissions, {});
  if (typeof permissions[key] === 'undefined') {
    return hasRole(user, 'admin');
  }
  return Boolean(permissions[key]);
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || !hasRole(req.user, 'super_admin')) {
    return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
  }
  next();
}

function requireAdminOrSuper(req, res, next) {
  if (!req.user || !hasAnyRole(req.user, ['super_admin', 'admin'])) {
    return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
  }
  next();
}

function requireCanConfirmOrder(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
  }

  if (!hasAnyRole(req.user, ['super_admin', 'admin', 'customer_service'])) {
    return res.status(403).json({ success: false, data: null, message: 'Forbidden' });
  }

  if (!hasPermission(req.user, 'api.orders.update_status') && !hasAdminPermission(req.user, 'can_confirm_order')) {
    return res.status(403).json({ success: false, data: null, message: 'No permission to confirm order' });
  }

  next();
}

function applyOrderScope(req, baseWhere = '1=1', params = {}) {
  const user = req.user;
  let where = baseWhere;
  const scopedParams = { ...params };

  if (hasRole(user, 'store_owner')) {
    where += ' AND o.store_id = :scope_store_id AND o.is_deleted = 0';
    scopedParams.scope_store_id = Number(user.store_id);
  }

  return { where, params: scopedParams };
}

module.exports = {
  requireRoles,
  requirePermission,
  requirePagePermission,
  requireButtonPermission,
  requireFieldPermission,
  requireScopePermission,
  requireSuperAdmin,
  requireAdminOrSuper,
  requireCanConfirmOrder,
  hasAdminPermission,
  hasPermission,
  hasPagePermission,
  hasButtonPermission,
  hasFieldPermission,
  hasScopePermission,
  hasRole,
  hasAnyRole,
  applyOrderScope,
  resolveUiPermissions,
  VIEW_SCOPE_KEYS,
};

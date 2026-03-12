const PERMISSION_ALIAS_MAP = {
  menus: ['menus_permissions', 'menu_permissions'],
  pages: ['pages_permissions', 'page_permissions'],
  buttons: ['buttons_permissions', 'button_permissions'],
  fields: ['fields_permissions', 'field_permissions'],
  views: [
    'scopes',
    'view_scopes',
    'views_permissions',
    'view_permissions',
    'scopes_permissions',
    'scope_permissions',
    'data_scope_permissions',
  ],
};

export const PERMISSION_TYPES = ['menus', 'pages', 'buttons', 'fields', 'views'];

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

export function normalizeRole(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text) return '';
  if (['super_admin', 'superadmin', 'super-admin'].includes(text)) return 'super_admin';
  if (['admin', 'administrator'].includes(text)) return 'admin';
  if (['store_owner', 'store-owner', 'owner'].includes(text)) return 'store_owner';
  if (['customer_service', 'customer-service', 'customer', 'service'].includes(text)) return 'customer_service';
  if (['finance', 'financial'].includes(text)) return 'finance';
  return text;
}

export function isSuperAdminRole(role) {
  return normalizeRole(role) === 'super_admin';
}

export function resolvePermissionAliases(type) {
  return PERMISSION_ALIAS_MAP[type] || [`${type}_permissions`];
}

export function hasPermissionEnvelope(userInfo) {
  if (!isObject(userInfo)) return false;
  if (hasOwn(userInfo, 'permissions')) return true;

  const flatKeys = PERMISSION_TYPES.flatMap((type) => [type, ...resolvePermissionAliases(type)]);
  return flatKeys.some((key) => hasOwn(userInfo, key));
}

export function hasExplicitPermissionCollection(userInfo, type) {
  if (!isObject(userInfo)) return false;
  const keys = [type, ...resolvePermissionAliases(type)];
  const permissionObject = isObject(userInfo.permissions) ? userInfo.permissions : null;
  if (permissionObject && keys.some((key) => hasOwn(permissionObject, key))) return true;
  return keys.some((key) => hasOwn(userInfo, key));
}

export function collectPermissions(userInfo, type) {
  if (!userInfo) return undefined;
  const strictMode = hasPermissionEnvelope(userInfo);
  const permissionObject = isObject(userInfo.permissions) ? userInfo.permissions : {};

  const keys = [type, ...resolvePermissionAliases(type)];
  for (const key of keys) {
    if (Array.isArray(permissionObject[key])) return permissionObject[key];
    if (hasOwn(permissionObject, key)) return [];
  }

  for (const key of keys) {
    if (Array.isArray(userInfo[key])) return userInfo[key];
    if (hasOwn(userInfo, key)) return [];
  }

  const flatKey = `${type}_permissions`;
  if (Array.isArray(userInfo[flatKey])) return userInfo[flatKey];
  if (hasOwn(userInfo, flatKey)) return [];

  if (strictMode) {
    if ((type === 'pages' || type === 'views') && !hasExplicitPermissionCollection(userInfo, type)) return undefined;
    return [];
  }
  return undefined;
}

export function hasPermissionByKey(userInfo, role, type, key) {
  if (!key || isSuperAdminRole(role)) return true;
  const list = collectPermissions(userInfo, type);
  if (!Array.isArray(list)) return true;
  return list.includes(key);
}

export function hasAnyPermissionByKeys(userInfo, role, type, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  if (!list.length) return true;
  return list.some((key) => hasPermissionByKey(userInfo, role, type, key));
}

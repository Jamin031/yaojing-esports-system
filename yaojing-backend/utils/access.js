const { query } = require('../config/db');
const { resolveUserUiPermissionState } = require('./userPermissionProfile');

function parseJson(value, fallback = {}) {
  if (!value) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function normalizeUiPermissions(value, role = '') {
  const state = resolveUserUiPermissionState(value, role);
  return state.effectivePermissions;
}

async function loadUserAccessById(userId) {
  const rows = await query(
    `SELECT
      u.id,
      u.username,
      u.name,
      u.password,
      u.role AS legacy_role,
      u.store_id,
      u.status,
      u.admin_permissions,
      GROUP_CONCAT(DISTINCT r.code) AS role_codes
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = :id AND u.is_deleted = 0 AND u.status = 'active'
     GROUP BY u.id
     LIMIT 1`,
    { id: Number(userId) }
  );

  if (!rows.length) {
    return null;
  }

  const user = rows[0];
  const roleCodes = String(user.role_codes || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const legacyRole = String(user.legacy_role || '').trim();
  const roles = uniq([legacyRole, ...roleCodes].filter(Boolean));

  const permissionRows = await query(
    `SELECT DISTINCT p.code, p.scope_type, p.resource, p.action
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = :user_id`,
    { user_id: Number(user.id) }
  );

  const permissions = uniq(permissionRows.map((item) => item.code).filter(Boolean));
  const legacyPermissions = parseJson(user.admin_permissions, {});
  if (legacyPermissions.can_confirm_order && !permissions.includes('api.orders.update_status')) {
    permissions.push('api.orders.update_status');
  }
  const roleCode = legacyRole || roles[0] || '';
  const permissionState = resolveUserUiPermissionState(user.admin_permissions, roleCode);
  const uiPermissions = permissionState.effectivePermissions;

  return {
    id: Number(user.id),
    username: user.username,
    name: user.name,
    role: roleCode,
    roles,
    store_id: user.store_id == null ? null : Number(user.store_id),
    status: user.status,
    admin_permissions: user.admin_permissions,
    permissions,
    ui_permissions: uiPermissions,
    ui_template_permissions: permissionState.templatePermissions,
    ui_permission_overrides: permissionState.overrides,
    ui_permission_source: permissionState.source,
    menu_permissions: uiPermissions.menus,
    page_permissions: uiPermissions.pages,
    button_permissions: uiPermissions.buttons,
    field_permissions: uiPermissions.fields,
    scope_permissions: uiPermissions.scopes,
    permission_details: permissionRows,
    password: user.password,
  };
}

async function loadUserAccessByUsername(username) {
  const rows = await query(
    `SELECT id
     FROM users
     WHERE username = :username AND is_deleted = 0 AND status = 'active'
     LIMIT 1`,
    { username: String(username) }
  );
  if (!rows.length) {
    return null;
  }
  return loadUserAccessById(rows[0].id);
}

module.exports = {
  parseJson,
  loadUserAccessById,
  loadUserAccessByUsername,
};

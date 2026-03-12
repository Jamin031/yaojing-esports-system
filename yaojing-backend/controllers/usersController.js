const bcrypt = require('bcrypt');
const { query, transaction } = require('../config/db');
const { hasRole, hasPagePermission } = require('../middleware/permissions');
const { ok, fail } = require('../utils/http');
const { writeOperationLog } = require('../utils/operationLog');
const { validateSuperAdminSelfPermissionUpdate } = require('../utils/superAdminGuard');
const {
  getBuiltInRoleDefaultUiPermissions,
  getRoleDefaultUiPermissions,
  normalizeUiPermissions,
} = require('../utils/permissionMatrix');
const {
  parseJson,
  pickUiPermissionPayload,
  mergeUiPermissions,
  resolveUserUiPermissionState,
  buildUserPermissionMeta,
  summarizeUiPermissionDiff,
} = require('../utils/userPermissionProfile');

const VALID_ROLES = ['super_admin', 'admin', 'store_owner', 'customer_service', 'finance'];
const VALID_STATUS = ['active', 'disabled'];

function isSuperAdmin(user) {
  return hasRole(user, 'super_admin');
}

function canAccessUsersPage(user) {
  return hasPagePermission(user, 'users:view');
}

function canManageUserBase(currentUser, targetUser) {
  if (isSuperAdmin(currentUser)) {
    return true;
  }
  if (!hasRole(currentUser, 'admin')) {
    return false;
  }
  return String(targetUser.role) !== 'super_admin';
}

function normalizeRole(value) {
  return String(value || '').trim();
}

function resolveRoleTemplatePermissions(role) {
  return normalizeUiPermissions(
    getRoleDefaultUiPermissions(role),
    getBuiltInRoleDefaultUiPermissions(role)
  );
}

function normalizeUiPermissionsForResponse(permissions, fallback) {
  return normalizeUiPermissions(permissions, fallback);
}

function buildPermissionAction(diff) {
  if (diff.granted.length > 0 && diff.revoked.length === 0) {
    return { code: 'permissions.grant', text: '发放权限' };
  }
  if (diff.revoked.length > 0 && diff.granted.length === 0) {
    return { code: 'permissions.revoke', text: '收回权限' };
  }
  return { code: 'permissions.adjust', text: '调整权限' };
}

function summarizeChangeNames(items = [], max = 8) {
  const names = items.map((item) => item.name).filter(Boolean);
  if (names.length <= max) {
    return names.join('、');
  }
  return `${names.slice(0, max).join('、')} 等${names.length}项`;
}

function buildPermissionChangeDetail(username, beforeRole, nextRole, diff) {
  const roleChanged = String(beforeRole || '') !== String(nextRole || '');
  const roleText = roleChanged ? `角色：${beforeRole || '-'} -> ${nextRole || '-'}` : '角色未变化';
  const grantedText = diff.granted.length
    ? `发放${diff.granted.length}项（${summarizeChangeNames(diff.granted)}）`
    : '发放0项';
  const revokedText = diff.revoked.length
    ? `收回${diff.revoked.length}项（${summarizeChangeNames(diff.revoked)}）`
    : '收回0项';

  return `调整用户${username || '-'}权限，${roleText}，${grantedText}，${revokedText}`;
}

function alignLegacyPermissionFlags(meta, role) {
  const nextMeta = { ...meta };
  if (String(role) === 'admin') {
    if (typeof nextMeta.can_confirm_order === 'undefined') {
      nextMeta.can_confirm_order = true;
    }
  } else if (typeof nextMeta.can_confirm_order !== 'undefined') {
    delete nextMeta.can_confirm_order;
  }
  return nextMeta;
}

async function getUserById(userId) {
  const rows = await query(
    `SELECT
      u.id,
      u.name,
      u.username,
      u.role,
      u.store_id,
      u.status,
      u.admin_permissions,
      u.is_deleted,
      u.created_at,
      u.updated_at,
      s.name AS store_name
     FROM users u
     LEFT JOIN stores s ON s.id = u.store_id
     WHERE u.id = :id
     LIMIT 1`,
    { id: Number(userId) }
  );
  return rows[0] || null;
}

async function listUsers(req, res) {
  const user = req.user;
  if (!canAccessUsersPage(user)) {
    return fail(res, 'Forbidden', 403);
  }
  if (!hasRole(user, 'super_admin') && !hasRole(user, 'admin')) {
    return fail(res, 'Forbidden', 403);
  }

  const rows = await query(
    `SELECT
      u.id,
      u.name,
      u.username,
      u.role,
      u.store_id,
      u.status,
      u.admin_permissions,
      u.created_at,
      s.name AS store_name
     FROM users u
     LEFT JOIN stores s ON s.id = u.store_id
     WHERE u.is_deleted = 0
     ORDER BY u.id DESC`
  );

  const list = rows
    .filter((item) => (hasRole(user, 'admin') ? String(item.role) !== 'super_admin' : true))
    .map((item) => {
      const permissionState = resolveUserUiPermissionState(item.admin_permissions, item.role);
      return {
        ...item,
        admin_permissions: parseJson(item.admin_permissions, {}),
        permissions: normalizeUiPermissionsForResponse(
          permissionState.effectivePermissions,
          permissionState.templatePermissions
        ),
        template_permissions: normalizeUiPermissionsForResponse(
          permissionState.templatePermissions,
          getBuiltInRoleDefaultUiPermissions(item.role)
        ),
        permission_overrides: permissionState.overrides,
        permission_source: permissionState.source,
      };
    });

  return ok(res, { list, total: list.length }, 'users fetched');
}

async function createUser(req, res) {
  if (!isSuperAdmin(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const { name, username, password, role, store_id } = req.body || {};
  const roleCode = normalizeRole(role);

  if (!name || !username || !password || !roleCode) {
    return fail(res, 'Missing required fields', 400);
  }
  if (!VALID_ROLES.includes(roleCode)) {
    return fail(res, 'Invalid role', 400);
  }

  const storeId = roleCode === 'store_owner' ? Number(store_id || 0) : null;
  if (roleCode === 'store_owner' && !storeId) {
    return fail(res, 'store_owner must bind store_id', 400);
  }

  const roleTemplate = resolveRoleTemplatePermissions(roleCode);
  const permissionMetaInfo = buildUserPermissionMeta({}, roleCode, roleTemplate);
  const adminPermissions = alignLegacyPermissionFlags(permissionMetaInfo.meta, roleCode);

  const passwordHash = await bcrypt.hash(String(password), 10);
  await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO users (name, username, password, role, store_id, admin_permissions, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [
        String(name),
        String(username),
        passwordHash,
        roleCode,
        roleCode === 'store_owner' ? storeId : null,
        JSON.stringify(adminPermissions),
      ]
    );

    await conn.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
       SELECT u.id, r.id
       FROM users u
       JOIN roles r ON BINARY r.code = BINARY ?
       WHERE u.username = ?`,
      [roleCode, String(username)]
    );
  });

  const rows = await query(
    `SELECT id, name, username, role, store_id, status
     FROM users
     WHERE username = :username
     ORDER BY id DESC
     LIMIT 1`,
    { username: String(username) }
  );
  const created = rows[0] || null;

  await writeOperationLog(req, {
    action: 'users.create',
    detail: `新增用户 ${username}（角色：${roleCode}）`,
    target_type: 'user',
    target_id: created?.id || null,
    after: {
      ...created,
      permissions: roleTemplate,
      permission_source: 'role_template',
    },
  });

  return ok(res, created, 'user created');
}

async function updateUserName(req, res) {
  if (!canAccessUsersPage(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const id = Number(req.params.id);
  const name = String(req.body?.name || '').trim();
  if (!name) {
    return fail(res, 'name is required', 400);
  }

  const target = await getUserById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, 'User not found', 404);
  }
  if (!canManageUserBase(req.user, target)) {
    return fail(res, 'Forbidden', 403);
  }

  const before = { id: target.id, name: target.name };
  await query(
    `UPDATE users
     SET name = :name,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id AND is_deleted = 0`,
    { id, name }
  );

  const after = await getUserById(id);
  await writeOperationLog(req, {
    action: 'users.update_name',
    detail: `修改用户姓名：${target.name || '-'} -> ${after?.name || '-'}`,
    target_type: 'user',
    target_id: id,
    before,
    after: { id: after.id, name: after.name },
  });

  return ok(res, after, 'user name updated');
}

async function updateUserPermissions(req, res) {
  if (!canAccessUsersPage(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  if (!isSuperAdmin(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const id = Number(req.params.id);
  const payloadRole = normalizeRole(req.body?.role);
  const nextRole = payloadRole || '';
  const payloadPermissions = pickUiPermissionPayload(req.body || {});

  const target = await getUserById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, 'User not found', 404);
  }

  if (nextRole && !VALID_ROLES.includes(nextRole)) {
    return fail(res, 'Invalid role', 400);
  }

  const finalRole = nextRole || String(target.role);
  const roleChanged = String(target.role) !== finalRole;
  const currentState = resolveUserUiPermissionState(target.admin_permissions, target.role);

  let nextPermissions;
  if (roleChanged) {
    const baseTemplate = resolveRoleTemplatePermissions(finalRole);
    if (typeof payloadPermissions === 'undefined') {
      nextPermissions = baseTemplate;
    } else {
      const merged = mergeUiPermissions(baseTemplate, payloadPermissions);
      nextPermissions = normalizeUiPermissions(merged, baseTemplate);
    }
  } else {
    const merged = mergeUiPermissions(currentState.effectivePermissions, payloadPermissions);
    nextPermissions = normalizeUiPermissions(merged, currentState.templatePermissions);
  }

  const selfGuard = validateSuperAdminSelfPermissionUpdate({
    operatorUserId: req.user?.id,
    targetUserId: target.id,
    currentRole: target.role,
    nextRole: finalRole,
    permissions: nextPermissions,
  });
  if (!selfGuard.ok) {
    if (selfGuard.reason === 'role_downgrade') {
      return fail(res, 'super_admin cannot downgrade own role', 400);
    }
    return fail(
      res,
      `super_admin cannot revoke own core permissions: ${selfGuard.missing.join(', ')}`,
      400
    );
  }

  const beforePermissions = currentState.effectivePermissions;

  const finalStoreId =
    finalRole === 'store_owner'
      ? Number(req.body?.store_id || target.store_id || 0) || null
      : null;
  if (finalRole === 'store_owner' && !finalStoreId) {
    return fail(res, 'store_owner must bind store_id', 400);
  }

  await transaction(async (conn) => {
    if (roleChanged) {
      await conn.execute(
        `UPDATE users
         SET role = ?,
             store_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_deleted = 0`,
        [finalRole, finalStoreId, id]
      );

      await conn.execute(`DELETE FROM user_roles WHERE user_id = ?`, [id]);
      await conn.execute(
        `INSERT IGNORE INTO user_roles (user_id, role_id)
         SELECT ?, r.id FROM roles r WHERE BINARY r.code = BINARY ?`,
        [id, finalRole]
      );
    }

    if (typeof payloadPermissions !== 'undefined' || roleChanged) {
      const nextMetaInfo = buildUserPermissionMeta(target.admin_permissions, finalRole, nextPermissions);
      const alignedMeta = alignLegacyPermissionFlags(nextMetaInfo.meta, finalRole);

      await conn.execute(
        `UPDATE users
         SET admin_permissions = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_deleted = 0`,
        [JSON.stringify(alignedMeta), id]
      );
    }
  });

  const afterUser = await getUserById(id);
  const afterState = resolveUserUiPermissionState(afterUser.admin_permissions, afterUser.role);
  const diff = summarizeUiPermissionDiff(beforePermissions, afterState.effectivePermissions);
  const actionMeta = buildPermissionAction(diff);

  await writeOperationLog(req, {
    action: actionMeta.code,
    detail: buildPermissionChangeDetail(target.username, target.role, afterUser.role, diff),
    target_type: 'user',
    target_id: id,
    before: {
      role: target.role,
      permissions: beforePermissions,
      permission_overrides: currentState.overrides,
      permission_source: currentState.source,
    },
    after: {
      role: afterUser.role,
      permissions: afterState.effectivePermissions,
      permission_overrides: afterState.overrides,
      permission_source: afterState.source,
      diff,
      store_id: afterUser.store_id,
    },
  });

  return ok(
    res,
    {
      ...afterUser,
      permissions: normalizeUiPermissionsForResponse(afterState.effectivePermissions, afterState.templatePermissions),
      template_permissions: normalizeUiPermissionsForResponse(
        afterState.templatePermissions,
        getBuiltInRoleDefaultUiPermissions(afterUser.role)
      ),
      permission_overrides: afterState.overrides,
      permission_source: afterState.source,
      diff,
      action: actionMeta,
    },
    'user permissions updated'
  );
}

async function updateUserStatus(req, res) {
  if (!canAccessUsersPage(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const id = Number(req.params.id);
  const status = String(req.body?.status || '').trim();
  if (!VALID_STATUS.includes(status)) {
    return fail(res, 'Invalid status', 400);
  }

  const target = await getUserById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, 'User not found', 404);
  }
  if (!canManageUserBase(req.user, target)) {
    return fail(res, 'Forbidden', 403);
  }
  if (String(target.role) === 'super_admin' && status === 'disabled') {
    return fail(res, 'Cannot disable super admin', 400);
  }

  const before = { status: target.status };
  await query(
    `UPDATE users
     SET status = :status,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id AND is_deleted = 0`,
    { id, status }
  );

  const after = await getUserById(id);
  await writeOperationLog(req, {
    action: 'users.update_status',
    detail: `修改用户状态：${target.status} -> ${status}`,
    target_type: 'user',
    target_id: id,
    before,
    after: { status: after.status },
  });

  return ok(res, after, 'user status updated');
}

async function updateUserPassword(req, res) {
  if (!canAccessUsersPage(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const id = Number(req.params.id);
  const password = String(req.body?.password || '');
  if (!password) {
    return fail(res, 'Password is required', 400);
  }

  const target = await getUserById(id);
  if (!target || Number(target.is_deleted) === 1) {
    return fail(res, 'User not found', 404);
  }
  if (!canManageUserBase(req.user, target)) {
    return fail(res, 'Forbidden', 403);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await query(
    `UPDATE users
     SET password = :password,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id AND is_deleted = 0`,
    {
      id,
      password: passwordHash,
    }
  );

  await writeOperationLog(req, {
    action: 'users.update_password',
    detail: `修改用户密码：${target.username || id}`,
    target_type: 'user',
    target_id: id,
  });

  return ok(res, { user_id: id }, 'user password updated');
}

async function deleteUser(req, res) {
  if (!canAccessUsersPage(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  if (!isSuperAdmin(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const id = Number(req.params.id);
  const target = await getUserById(id);
  if (!target) {
    return fail(res, 'User not found', 404);
  }
  if (String(target.role) === 'super_admin') {
    return fail(res, 'Cannot delete super admin', 400);
  }

  await query(`UPDATE users SET is_deleted = 1, status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = :id`, { id });
  await query(`DELETE FROM user_roles WHERE user_id = :id`, { id });

  await writeOperationLog(req, {
    action: 'users.delete',
    detail: `删除用户：${target.username || id}`,
    target_type: 'user',
    target_id: id,
    before: { id: target.id, role: target.role, status: target.status },
    after: { is_deleted: 1, status: 'disabled' },
  });

  return ok(res, { user_id: id }, 'user deleted');
}

module.exports = {
  listUsers,
  createUser,
  updateUserName,
  updateUserPermissions,
  updateUserStatus,
  updateUserPassword,
  deleteUser,
};

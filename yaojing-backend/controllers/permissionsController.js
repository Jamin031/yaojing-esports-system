const { query } = require('../config/db');
const { ok, fail } = require('../utils/http');
const { writeOperationLog } = require('../utils/operationLog');
const { validateSuperAdminSelfPermissionUpdate } = require('../utils/superAdminGuard');
const {
  emitRolePermissionTemplateUpdated,
  emitUserPermissionUpdated,
} = require('../services/adminRealtimeService');
const {
  PERMISSION_SCHEMAS,
  ROLE_DEFAULTS,
  getBuiltInRoleDefaultUiPermissions,
  getRoleDefaultUiPermissions,
  normalizeUiPermissions,
  setRoleTemplateOverride,
} = require('../utils/permissionMatrix');
const {
  parseJson,
  normalizeUiPermissionOverrides,
  isUiPermissionOverridesEmpty,
  applyUiPermissionOverrides,
  computeUiPermissionOverrides,
  pickUiPermissionPayload,
  mergeUiPermissions,
  resolveUserUiPermissionState,
  buildUserPermissionMeta,
  summarizeUiPermissionDiff,
} = require('../utils/userPermissionProfile');

const VALID_ROLES = Object.keys(ROLE_DEFAULTS);
const EDITABLE_TEMPLATE_ROLES = VALID_ROLES.filter((role) => role !== 'super_admin');

function sanitizeRole(value) {
  return String(value || '').trim();
}

function normalizeUiPermissionsForResponse(permissions, fallback) {
  return normalizeUiPermissions(permissions, fallback);
}

function buildPermissionChangeAction(diff) {
  const granted = diff.granted.length;
  const revoked = diff.revoked.length;

  if (granted > 0 && revoked === 0) {
    return { code: 'permissions.grant', text: '发放权限' };
  }
  if (revoked > 0 && granted === 0) {
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

function buildPermissionChangeDetail(diff, username) {
  const grantedText = diff.granted.length
    ? `发放${diff.granted.length}项（${summarizeChangeNames(diff.granted)}）`
    : '发放0项';
  const revokedText = diff.revoked.length
    ? `收回${diff.revoked.length}项（${summarizeChangeNames(diff.revoked)}）`
    : '收回0项';

  return `为用户${username || '-'}调整权限：${grantedText}，${revokedText}`;
}

function rowToUserPermissionView(row) {
  const state = resolveUserUiPermissionState(row.admin_permissions, row.role);
  return {
    id: Number(row.id),
    name: row.name,
    username: row.username,
    role: row.role,
    store_id: row.store_id == null ? null : Number(row.store_id),
    store_name: row.store_name || null,
    created_at: row.created_at,
    permissions: normalizeUiPermissionsForResponse(state.effectivePermissions, state.templatePermissions),
    template_permissions: normalizeUiPermissionsForResponse(
      state.templatePermissions,
      getBuiltInRoleDefaultUiPermissions(row.role)
    ),
    permission_overrides: state.overrides,
    permission_source: state.source,
  };
}

function normalizeRoleTemplatePermissions(role, rawPermissions) {
  return normalizeUiPermissions(rawPermissions, getBuiltInRoleDefaultUiPermissions(role));
}

function resolveMetaStoredPermissions(meta = {}) {
  if (meta.permissions && typeof meta.permissions === 'object') {
    return meta.permissions;
  }
  if (meta.ui_permissions && typeof meta.ui_permissions === 'object') {
    return meta.ui_permissions;
  }
  return null;
}

function resolvePermissionsByTemplate(meta, templatePermissions) {
  const normalizedTemplate = normalizeUiPermissions(templatePermissions);
  const overrides = normalizeUiPermissionOverrides(
    meta.ui_permission_overrides && typeof meta.ui_permission_overrides === 'object'
      ? meta.ui_permission_overrides
      : meta.permission_overrides
  );

  if (!isUiPermissionOverridesEmpty(overrides)) {
    return {
      mode: 'overrides',
      overrides,
      effectivePermissions: normalizeUiPermissions(
        applyUiPermissionOverrides(normalizedTemplate, overrides),
        normalizedTemplate
      ),
    };
  }

  const permissionSource = String(meta.permission_source || '').trim();
  const fromMeta = resolveMetaStoredPermissions(meta);
  if (permissionSource === 'role_template' || !fromMeta) {
    return {
      mode: 'role_template',
      overrides,
      effectivePermissions: normalizedTemplate,
    };
  }

  return {
    mode: 'legacy_meta',
    overrides,
    effectivePermissions: normalizeUiPermissions(fromMeta, normalizedTemplate),
  };
}

async function refreshUsersByRoleTemplate(role, beforeTemplate, nextTemplate) {
  const users = await query(
    `SELECT id, admin_permissions
     FROM users
     WHERE is_deleted = 0
       AND role = :role`,
    { role }
  );

  const summary = {
    total: users.length,
    updated: 0,
    role_template_followers: 0,
    explicit_overrides: 0,
    legacy_migrated: 0,
  };

  for (const user of users) {
    const currentMeta = parseJson(user.admin_permissions, {});
    const beforeState = resolvePermissionsByTemplate(currentMeta, beforeTemplate);

    let nextEffectivePermissions;
    if (beforeState.mode === 'overrides') {
      summary.explicit_overrides += 1;
      nextEffectivePermissions = applyUiPermissionOverrides(nextTemplate, beforeState.overrides);
    } else if (beforeState.mode === 'legacy_meta') {
      const legacyOverrides = computeUiPermissionOverrides(beforeTemplate, beforeState.effectivePermissions);
      if (isUiPermissionOverridesEmpty(legacyOverrides)) {
        summary.role_template_followers += 1;
        nextEffectivePermissions = nextTemplate;
      } else {
        summary.legacy_migrated += 1;
        nextEffectivePermissions = applyUiPermissionOverrides(nextTemplate, legacyOverrides);
      }
    } else {
      summary.role_template_followers += 1;
      nextEffectivePermissions = nextTemplate;
    }

    const nextMetaInfo = buildUserPermissionMeta(currentMeta, role, nextEffectivePermissions);
    const currentMetaText = JSON.stringify(currentMeta);
    const nextMetaText = JSON.stringify(nextMetaInfo.meta);
    if (currentMetaText === nextMetaText) {
      continue;
    }

    await query(
      `UPDATE users
       SET admin_permissions = :admin_permissions,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        id: Number(user.id),
        admin_permissions: nextMetaText,
      }
    );
    summary.updated += 1;
  }

  return summary;
}

async function getRoleTemplateRow(role) {
  const rows = await query(
    `SELECT role_code, permissions_json, updated_by, created_at, updated_at
     FROM role_permission_templates
     WHERE role_code = :role_code
     LIMIT 1`,
    { role_code: role }
  );
  return rows[0] || null;
}

async function getPermissionSchemas(req, res) {
  return ok(
    res,
    {
      ...PERMISSION_SCHEMAS,
      roles: VALID_ROLES,
      editable_template_roles: EDITABLE_TEMPLATE_ROLES,
      locked_template_roles: ['super_admin'],
    },
    '权限结构获取成功'
  );
}

async function listRoleTemplates(req, res) {
  const rows = await query(
    `SELECT role_code, permissions_json, updated_by, created_at, updated_at
     FROM role_permission_templates`
  );
  const rowMap = Object.fromEntries(rows.map((item) => [String(item.role_code), item]));

  const list = VALID_ROLES.map((role) => {
    const row = rowMap[role] || null;
    const builtIn = normalizeUiPermissions(getBuiltInRoleDefaultUiPermissions(role));
    const current = normalizeUiPermissions(getRoleDefaultUiPermissions(role), builtIn);

    return {
      role,
      editable: role !== 'super_admin',
      permissions: normalizeUiPermissionsForResponse(current, builtIn),
      built_in_permissions: normalizeUiPermissionsForResponse(builtIn, builtIn),
      updated_by: row?.updated_by == null ? null : Number(row.updated_by),
      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null,
    };
  });

  return ok(res, { list, total: list.length }, '默认权限模板获取成功');
}

async function updateRoleTemplate(req, res) {
  const role = sanitizeRole(req.params.role);
  if (!VALID_ROLES.includes(role)) {
    return fail(res, 'Invalid role', 400);
  }
  if (role === 'super_admin') {
    return fail(res, 'super_admin 默认模板固定为全权限，不支持修改', 400);
  }

  const payload = pickUiPermissionPayload(req.body || {});
  if (typeof payload === 'undefined') {
    return fail(res, 'permissions payload is required', 400);
  }

  const beforeTemplate = normalizeUiPermissions(getRoleDefaultUiPermissions(role), getBuiltInRoleDefaultUiPermissions(role));
  const merged = mergeUiPermissions(beforeTemplate, payload);
  const nextTemplate = normalizeRoleTemplatePermissions(role, merged);
  const diff = summarizeUiPermissionDiff(beforeTemplate, nextTemplate);

  await query(
    `INSERT INTO role_permission_templates (role_code, permissions_json, updated_by)
     VALUES (:role_code, :permissions_json, :updated_by)
     ON DUPLICATE KEY UPDATE
       permissions_json = VALUES(permissions_json),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    {
      role_code: role,
      permissions_json: JSON.stringify(nextTemplate),
      updated_by: req.user?.id ? Number(req.user.id) : null,
    }
  );

  setRoleTemplateOverride(role, nextTemplate);
  const user_sync = await refreshUsersByRoleTemplate(role, beforeTemplate, nextTemplate);

  await writeOperationLog(req, {
    action: 'permissions.template.update',
    detail: `设置角色 ${role} 的默认权限模板（发放${diff.granted.length}项，收回${diff.revoked.length}项）`,
    target_type: 'role_template',
    target_id: role,
    before: { role, permissions: beforeTemplate },
    after: { role, permissions: nextTemplate, diff },
  });

  emitRolePermissionTemplateUpdated(req.app?.get('io'), { role });

  const row = await getRoleTemplateRow(role);
  return ok(
    res,
    {
      role,
      editable: true,
      permissions: normalizeUiPermissionsForResponse(nextTemplate, getBuiltInRoleDefaultUiPermissions(role)),
      built_in_permissions: normalizeUiPermissionsForResponse(
        normalizeUiPermissions(getBuiltInRoleDefaultUiPermissions(role)),
        getBuiltInRoleDefaultUiPermissions(role)
      ),
      updated_by: row?.updated_by == null ? null : Number(row.updated_by),
      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null,
      diff,
      user_sync,
    },
    '默认权限模板更新成功'
  );
}

async function listUsersWithPermissions(req, res) {
  const rows = await query(
    `SELECT
      u.id,
      u.name,
      u.username,
      u.role,
      u.store_id,
      u.admin_permissions,
      u.created_at,
      s.name AS store_name
     FROM users u
     LEFT JOIN stores s ON s.id = u.store_id
     WHERE u.is_deleted = 0
     ORDER BY u.id DESC`
  );

  const list = rows.map((row) => rowToUserPermissionView(row));

  return ok(res, { list, total: list.length }, '用户权限列表获取成功');
}

async function getUserPermissionById(req, res) {
  const userId = Number(req.params.id);
  if (!userId) {
    return fail(res, 'Invalid user id', 400);
  }

  const rows = await query(
    `SELECT
      u.id,
      u.name,
      u.username,
      u.role,
      u.store_id,
      u.admin_permissions,
      u.created_at,
      s.name AS store_name
     FROM users u
     LEFT JOIN stores s ON s.id = u.store_id
     WHERE u.is_deleted = 0
       AND u.id = :id
     LIMIT 1`,
    { id: userId }
  );

  if (!rows.length) {
    return fail(res, 'User not found', 404);
  }

  return ok(res, rowToUserPermissionView(rows[0]), '用户权限详情获取成功');
}

async function updateUserPermissions(req, res) {
  const userId = Number(req.params.id);
  const payload = pickUiPermissionPayload(req.body || {});

  if (!userId) {
    return fail(res, 'Invalid user id', 400);
  }
  if (typeof payload === 'undefined') {
    return fail(res, 'permissions payload is required', 400);
  }

  const rows = await query(
    `SELECT id, role, username, admin_permissions
     FROM users
     WHERE id = :id AND is_deleted = 0
     LIMIT 1`,
    { id: userId }
  );

  if (!rows.length) {
    return fail(res, 'User not found', 404);
  }

  const row = rows[0];
  const currentState = resolveUserUiPermissionState(row.admin_permissions, row.role);
  const mergedPermissions = mergeUiPermissions(currentState.effectivePermissions, payload);
  const normalized = normalizeUiPermissions(mergedPermissions, currentState.templatePermissions);

  const selfGuard = validateSuperAdminSelfPermissionUpdate({
    operatorUserId: req.user?.id,
    targetUserId: row.id,
    currentRole: row.role,
    nextRole: row.role,
    permissions: normalized,
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

  const nextMetaInfo = buildUserPermissionMeta(row.admin_permissions, row.role, normalized);
  const diff = summarizeUiPermissionDiff(currentState.effectivePermissions, nextMetaInfo.effectivePermissions);
  const actionMeta = buildPermissionChangeAction(diff);

  await query(
    `UPDATE users
     SET admin_permissions = :admin_permissions,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    {
      id: userId,
      admin_permissions: JSON.stringify(nextMetaInfo.meta),
    }
  );

  await writeOperationLog(req, {
    action: actionMeta.code,
    detail: buildPermissionChangeDetail(diff, row.username),
    target_type: 'user',
    target_id: userId,
    before: {
      role: row.role,
      permissions: currentState.effectivePermissions,
      permission_overrides: currentState.overrides,
      permission_source: currentState.source,
    },
    after: {
      role: row.role,
      permissions: nextMetaInfo.effectivePermissions,
      permission_overrides: nextMetaInfo.overrides,
      permission_source: nextMetaInfo.source,
      diff,
    },
  });

  emitUserPermissionUpdated(req.app?.get('io'), { user_id: userId });

  return ok(
    res,
    {
      user_id: userId,
      role: row.role,
      permissions: normalizeUiPermissionsForResponse(
        nextMetaInfo.effectivePermissions,
        nextMetaInfo.templatePermissions
      ),
      template_permissions: normalizeUiPermissionsForResponse(
        nextMetaInfo.templatePermissions,
        getBuiltInRoleDefaultUiPermissions(row.role)
      ),
      permission_overrides: nextMetaInfo.overrides,
      permission_source: nextMetaInfo.source,
      diff,
      action: {
        code: actionMeta.code,
        text: actionMeta.text,
      },
    },
    '用户权限更新成功'
  );
}

module.exports = {
  getPermissionSchemas,
  listRoleTemplates,
  updateRoleTemplate,
  listUsersWithPermissions,
  getUserPermissionById,
  updateUserPermissions,
};

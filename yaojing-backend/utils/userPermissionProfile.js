const {
  UI_PERMISSION_SCOPES,
  EMPTY_UI_PERMISSIONS,
  PERMISSION_SCHEMAS,
  VIEW_SCOPE_ALIAS_KEYS,
  getRoleDefaultUiPermissions,
  normalizeUiPermissions,
} = require('./permissionMatrix');

const SCOPE_ALLOWED_SET = Object.fromEntries(
  UI_PERMISSION_SCOPES.map((scope) => [
    scope,
    scope === 'scopes'
      ? null
      : new Set((PERMISSION_SCHEMAS[scope] || []).map((item) => String(item.key || '').trim()).filter(Boolean)),
  ])
);

const PERMISSION_NAME_MAP = Object.fromEntries(
  UI_PERMISSION_SCOPES.flatMap((scope) =>
    (PERMISSION_SCHEMAS[scope] || []).map((item) => [String(item.key || '').trim(), String(item.name || '').trim()])
  )
);

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

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target || {}, key);
}

function cloneUiPermissions(input = EMPTY_UI_PERMISSIONS) {
  const normalized = normalizeUiPermissions(input, EMPTY_UI_PERMISSIONS);
  return {
    menus: [...normalized.menus],
    pages: [...normalized.pages],
    buttons: [...normalized.buttons],
    fields: [...normalized.fields],
    scopes: [...normalized.scopes],
  };
}

function applyFixedRolePermissionRules(role, permissions = EMPTY_UI_PERMISSIONS) {
  const normalized = normalizeUiPermissions(permissions, EMPTY_UI_PERMISSIONS);
  return {
    menus: [...normalized.menus],
    pages: [...normalized.pages],
    buttons: [...normalized.buttons],
    fields: [...normalized.fields],
    scopes: [...normalized.scopes],
  };
}

function emptyUiPermissionOverrides() {
  return {
    menus: { grant: [], revoke: [] },
    pages: { grant: [], revoke: [] },
    buttons: { grant: [], revoke: [] },
    fields: { grant: [], revoke: [] },
    scopes: { grant: [], revoke: [] },
  };
}

function normalizeOverrideItems(value, allowedSet) {
  const list = Array.isArray(value) ? value : [];
  const unique = new Set();
  list.forEach((item) => {
    const key = String(item || '').trim();
    if (!key) {
      return;
    }
    if (allowedSet && !allowedSet.has(key)) {
      return;
    }
    unique.add(key);
  });
  return Array.from(unique);
}

function normalizeUiPermissionOverrides(input) {
  const source = input && typeof input === 'object' ? input : {};
  const normalized = emptyUiPermissionOverrides();

  UI_PERMISSION_SCOPES.forEach((scope) => {
    const current = source[scope] && typeof source[scope] === 'object' ? source[scope] : {};
    const allowedSet = SCOPE_ALLOWED_SET[scope];
    normalized[scope] = {
      grant: normalizeOverrideItems(current.grant, allowedSet),
      revoke: normalizeOverrideItems(current.revoke, allowedSet),
    };

    if (normalized[scope].grant.length && normalized[scope].revoke.length) {
      const revokeSet = new Set(normalized[scope].revoke);
      normalized[scope].grant = normalized[scope].grant.filter((item) => !revokeSet.has(item));
    }
  });

  return normalized;
}

function isUiPermissionOverridesEmpty(overrides) {
  const normalized = normalizeUiPermissionOverrides(overrides);
  return UI_PERMISSION_SCOPES.every(
    (scope) => normalized[scope].grant.length === 0 && normalized[scope].revoke.length === 0
  );
}

function applyUiPermissionOverrides(templatePermissions, overrides) {
  const template = normalizeUiPermissions(templatePermissions, EMPTY_UI_PERMISSIONS);
  const normalizedOverrides = normalizeUiPermissionOverrides(overrides);
  const result = {};

  UI_PERMISSION_SCOPES.forEach((scope) => {
    const next = new Set(template[scope]);
    const allowedSet = SCOPE_ALLOWED_SET[scope];
    normalizedOverrides[scope].grant.forEach((key) => {
      if (!allowedSet || allowedSet.has(key)) {
        next.add(key);
      }
    });
    normalizedOverrides[scope].revoke.forEach((key) => next.delete(key));
    result[scope] = Array.from(next);
  });

  return normalizeUiPermissions(result, EMPTY_UI_PERMISSIONS);
}

function computeUiPermissionOverrides(templatePermissions, effectivePermissions) {
  const template = normalizeUiPermissions(templatePermissions, EMPTY_UI_PERMISSIONS);
  const effective = normalizeUiPermissions(effectivePermissions, template);
  const overrides = emptyUiPermissionOverrides();

  UI_PERMISSION_SCOPES.forEach((scope) => {
    const templateSet = new Set(template[scope]);
    const effectiveSet = new Set(effective[scope]);

    overrides[scope].grant = Array.from(effectiveSet).filter((key) => !templateSet.has(key));
    overrides[scope].revoke = Array.from(templateSet).filter((key) => !effectiveSet.has(key));
  });

  return normalizeUiPermissionOverrides(overrides);
}

function resolveUserUiPermissionState(adminPermissions, role) {
  const meta = parseJson(adminPermissions, {});
  const roleCode = String(role || '').trim();
  const templatePermissions = applyFixedRolePermissionRules(
    roleCode,
    normalizeUiPermissions(getRoleDefaultUiPermissions(roleCode), EMPTY_UI_PERMISSIONS)
  );

  if (roleCode === 'super_admin') {
    return {
      meta,
      templatePermissions,
      effectivePermissions: applyFixedRolePermissionRules(roleCode, cloneUiPermissions(templatePermissions)),
      overrides: emptyUiPermissionOverrides(),
      source: 'role_template',
    };
  }

  const rawOverrides =
    meta.ui_permission_overrides && typeof meta.ui_permission_overrides === 'object'
      ? meta.ui_permission_overrides
      : meta.permission_overrides;
  const normalizedOverrides = normalizeUiPermissionOverrides(rawOverrides);
  const permissionSource = String(meta.permission_source || '').trim();

  if (!isUiPermissionOverridesEmpty(normalizedOverrides)) {
    const effectivePermissions = applyFixedRolePermissionRules(
      roleCode,
      applyUiPermissionOverrides(templatePermissions, normalizedOverrides)
    );
    return {
      meta,
      templatePermissions,
      effectivePermissions,
      overrides: normalizedOverrides,
      source: 'template+overrides',
    };
  }

  if (permissionSource === 'role_template') {
    return {
      meta,
      templatePermissions,
      effectivePermissions: applyFixedRolePermissionRules(roleCode, cloneUiPermissions(templatePermissions)),
      overrides: emptyUiPermissionOverrides(),
      source: 'role_template',
    };
  }

  const fromMeta =
    meta.permissions && typeof meta.permissions === 'object'
      ? meta.permissions
      : meta.ui_permissions && typeof meta.ui_permissions === 'object'
      ? meta.ui_permissions
      : null;

  if (fromMeta) {
    const effectivePermissions = applyFixedRolePermissionRules(
      roleCode,
      normalizeUiPermissions(fromMeta, templatePermissions)
    );
    const derivedOverrides = computeUiPermissionOverrides(templatePermissions, effectivePermissions);
    if (isUiPermissionOverridesEmpty(derivedOverrides)) {
      return {
        meta,
        templatePermissions,
        effectivePermissions: applyFixedRolePermissionRules(roleCode, cloneUiPermissions(templatePermissions)),
        overrides: emptyUiPermissionOverrides(),
        source: 'role_template',
      };
    }
    return {
      meta,
      templatePermissions,
      effectivePermissions,
      overrides: derivedOverrides,
      source: 'legacy_custom',
    };
  }

  return {
    meta,
    templatePermissions,
    effectivePermissions: applyFixedRolePermissionRules(roleCode, cloneUiPermissions(templatePermissions)),
    overrides: emptyUiPermissionOverrides(),
    source: 'role_template',
  };
}

function buildUserPermissionMeta(adminPermissions, role, effectivePermissions) {
  const state = resolveUserUiPermissionState(adminPermissions, role);
  const normalizedEffective = applyFixedRolePermissionRules(
    role,
    normalizeUiPermissions(effectivePermissions, state.templatePermissions)
  );
  const overrides = computeUiPermissionOverrides(state.templatePermissions, normalizedEffective);
  const source = isUiPermissionOverridesEmpty(overrides) ? 'role_template' : 'template+overrides';

  const nextMeta = {
    ...state.meta,
    permissions: normalizedEffective,
    ui_permissions: normalizedEffective,
    ui_permission_overrides: overrides,
    permission_source: source,
    template_role: String(role || ''),
  };

  return {
    meta: nextMeta,
    templatePermissions: state.templatePermissions,
    effectivePermissions: normalizedEffective,
    overrides,
    source,
  };
}

function pickViewScopePayload(source = {}) {
  if (hasOwn(source, 'scopes')) {
    return source.scopes;
  }

  for (const key of VIEW_SCOPE_ALIAS_KEYS) {
    if (hasOwn(source, key)) {
      return source[key];
    }
  }

  return undefined;
}

function hasAnyUiPermissionPayloadKeys(source = {}) {
  return (
    hasOwn(source, 'menus') ||
    hasOwn(source, 'pages') ||
    hasOwn(source, 'buttons') ||
    hasOwn(source, 'fields') ||
    typeof pickViewScopePayload(source) !== 'undefined'
  );
}

function normalizeUiPermissionPayload(source = {}) {
  const payload = {};
  if (hasOwn(source, 'menus')) {
    payload.menus = source.menus;
  }
  if (hasOwn(source, 'pages')) {
    payload.pages = source.pages;
  }
  if (hasOwn(source, 'buttons')) {
    payload.buttons = source.buttons;
  }
  if (hasOwn(source, 'fields')) {
    payload.fields = source.fields;
  }

  const scopes = pickViewScopePayload(source);
  if (typeof scopes !== 'undefined') {
    payload.scopes = scopes;
  }

  return payload;
}

function pickUiPermissionPayload(body = {}) {
  if (body && typeof body.permissions === 'object') {
    return normalizeUiPermissionPayload(body.permissions);
  }

  if (hasAnyUiPermissionPayloadKeys(body)) {
    return normalizeUiPermissionPayload(body);
  }

  return undefined;
}

function mergeUiPermissions(currentPermissions, patchPermissions) {
  const current = normalizeUiPermissions(currentPermissions, EMPTY_UI_PERMISSIONS);
  if (typeof patchPermissions === 'undefined') {
    return current;
  }

  return {
    menus: hasOwn(patchPermissions, 'menus') ? patchPermissions.menus : current.menus,
    pages: hasOwn(patchPermissions, 'pages') ? patchPermissions.pages : current.pages,
    buttons: hasOwn(patchPermissions, 'buttons') ? patchPermissions.buttons : current.buttons,
    fields: hasOwn(patchPermissions, 'fields') ? patchPermissions.fields : current.fields,
    scopes: hasOwn(patchPermissions, 'scopes') ? patchPermissions.scopes : current.scopes,
  };
}

function permissionDisplayName(key) {
  const code = String(key || '').trim();
  return PERMISSION_NAME_MAP[code] || code;
}

function summarizeUiPermissionDiff(beforePermissions, afterPermissions) {
  const before = normalizeUiPermissions(beforePermissions, EMPTY_UI_PERMISSIONS);
  const after = normalizeUiPermissions(afterPermissions, before);
  const granted = [];
  const revoked = [];

  UI_PERMISSION_SCOPES.forEach((scope) => {
    const beforeSet = new Set(before[scope]);
    const afterSet = new Set(after[scope]);

    Array.from(afterSet)
      .filter((key) => !beforeSet.has(key))
      .forEach((key) => {
        granted.push({ scope, key, name: permissionDisplayName(key) });
      });

    Array.from(beforeSet)
      .filter((key) => !afterSet.has(key))
      .forEach((key) => {
        revoked.push({ scope, key, name: permissionDisplayName(key) });
      });
  });

  return {
    granted,
    revoked,
    unchanged:
      granted.length === 0 &&
      revoked.length === 0,
  };
}

module.exports = {
  parseJson,
  hasOwn,
  cloneUiPermissions,
  emptyUiPermissionOverrides,
  normalizeUiPermissionOverrides,
  isUiPermissionOverridesEmpty,
  applyUiPermissionOverrides,
  computeUiPermissionOverrides,
  resolveUserUiPermissionState,
  buildUserPermissionMeta,
  pickUiPermissionPayload,
  mergeUiPermissions,
  permissionDisplayName,
  summarizeUiPermissionDiff,
};

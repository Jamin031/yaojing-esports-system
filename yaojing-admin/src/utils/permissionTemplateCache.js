import { normalizeViewPermissionKey } from './viewPermissionKeys';

const ROLE_PERMISSION_TEMPLATE_CACHE_KEY = 'west_role_permission_templates_v1';
const ROLE_PERMISSION_TEMPLATE_CACHE_TTL_MS = 2 * 60 * 1000;

const PERMISSION_KEY_GROUPS = {
  menus: ['menus', 'menu_permissions', 'menus_permissions'],
  pages: ['pages', 'page_permissions', 'pages_permissions'],
  buttons: ['buttons', 'button_permissions', 'buttons_permissions'],
  fields: ['fields', 'field_permissions', 'fields_permissions'],
  views: [
    'scopes',
    'views',
    'view_scopes',
    'view_permissions',
    'views_permissions',
    'scope_permissions',
    'scopes_permissions',
    'data_scope_permissions',
  ],
};

const PERMISSION_TYPES = Object.keys(PERMISSION_KEY_GROUPS);

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizePermissionKey(type, value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (type === 'views') {
    return normalizeViewPermissionKey(key);
  }
  return key;
}

function uniqStringArray(type, values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((item) => normalizePermissionKey(type, item))
        .filter(Boolean),
    ),
  );
}

function pickPermissionArray(source, keys) {
  for (const key of keys) {
    const target = source?.[key];
    if (Array.isArray(target)) return target;
  }
  return [];
}

function resolvePermissionKeys(type) {
  return PERMISSION_KEY_GROUPS[type] || [type];
}

function normalizeCachePayload(source) {
  if (!isPlainObject(source)) return null;
  if (!isPlainObject(source.templates)) return null;

  const updatedAt = Number(source.updatedAt || 0);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;

  return {
    templates: normalizeRolePermissionTemplateMap(source.templates),
    updatedAt,
  };
}

function buildCachePayload(source) {
  return {
    templates: normalizeRolePermissionTemplateMap(source),
    updatedAt: Date.now(),
  };
}

export function normalizePermissionSet(source) {
  const value = isPlainObject(source) ? source : {};
  const normalized = {};
  PERMISSION_TYPES.forEach((type) => {
    normalized[type] = uniqStringArray(type, pickPermissionArray(value, resolvePermissionKeys(type)));
  });
  return normalized;
}

export function emptyPermissionSet() {
  return {
    menus: [],
    pages: [],
    buttons: [],
    fields: [],
    views: [],
  };
}

export function buildPermissionEnvelope(source) {
  const normalized = normalizePermissionSet(source);
  return {
    menus: normalized.menus.slice(),
    pages: normalized.pages.slice(),
    buttons: normalized.buttons.slice(),
    fields: normalized.fields.slice(),
    scopes: normalized.views.slice(),
  };
}

export function buildPermissionRequestPayload(source) {
  const envelope = buildPermissionEnvelope(source);
  return {
    permissions: envelope,
  };
}

export function normalizeRolePermissionTemplateMap(source) {
  if (!isPlainObject(source)) return {};
  const result = {};

  Object.entries(source).forEach(([role, permissions]) => {
    const roleKey = String(role || '').trim().toLowerCase();
    if (!roleKey) return;
    if (PERMISSION_TYPES.includes(roleKey)) return;
    if (roleKey.endsWith('_permissions') || roleKey.endsWith('_permission')) return;
    result[roleKey] = normalizePermissionSet(permissions);
  });

  return result;
}

export function clearRolePermissionTemplateCache() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ROLE_PERMISSION_TEMPLATE_CACHE_KEY);
  } catch {
    // ignore cache clear errors
  }
}

export function readRolePermissionTemplateCache() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ROLE_PERMISSION_TEMPLATE_CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    const payload = normalizeCachePayload(parsed);
    if (!payload) {
      // Migrate old cache format by clearing once.
      clearRolePermissionTemplateCache();
      return {};
    }

    if (Date.now() - payload.updatedAt > ROLE_PERMISSION_TEMPLATE_CACHE_TTL_MS) {
      clearRolePermissionTemplateCache();
      return {};
    }

    return payload.templates;
  } catch {
    return {};
  }
}

export function writeRolePermissionTemplateCache(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ROLE_PERMISSION_TEMPLATE_CACHE_KEY, JSON.stringify(buildCachePayload(value)));
  } catch {
    // ignore cache write errors
  }
}

export function listPermissionTypes() {
  return PERMISSION_TYPES.slice();
}

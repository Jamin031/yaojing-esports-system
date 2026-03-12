const { query } = require('../config/db');

const STORE_SOURCE_NOT_FOUND_MESSAGE = '来源网吧不存在，请先在后台配置来源标识';
const ONLINE_STORE_KEY = 'online';
const DEFAULT_ONLINE_STORE_NAME = process.env.DEFAULT_ONLINE_STORE_NAME || '线上用户订单';
const STORE_COMPARABLE_CLEAN_RE = /[^a-z0-9\u4e00-\u9fa5]/g;
const STORE_SELECT_FIELDS = `id, name, domain_prefix, subdomain, commission_rate`;
const PRODUCTION_ROOT_DOMAIN = String(process.env.PRODUCTION_ROOT_DOMAIN || 'yaojingclub.com')
  .trim()
  .toLowerCase();
const RESERVED_NON_STORE_SOURCE_KEYS = new Set(['admin', 'www']);

function isDuplicateKeyError(error) {
  return Boolean(error && (error.code === 'ER_DUP_ENTRY' || Number(error.errno) === 1062));
}

function parseHostPrefix(host = '') {
  const raw = String(host || '').trim().toLowerCase();
  const firstHost = raw.split(',')[0].trim();
  const clean = firstHost.replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0];
  if (!clean) {
    return '';
  }

  if (clean === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(clean)) {
    return '';
  }

  const parts = clean.split('.');
  if (parts.length < 2) {
    return '';
  }
  return parts[0] === 'www' ? parts[1] || '' : parts[0] || '';
}

function normalizeHost(rawHost = '') {
  const value = String(rawHost || '').trim().toLowerCase();
  if (!value) return '';
  return value.split(',')[0].trim().replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0];
}

function isLocalRuntimeHost(host = '') {
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  return /^\d+\.\d+\.\d+\.\d+$/.test(normalized);
}

function isProductionRuntimeHost(host = '') {
  const normalized = normalizeHost(host);
  if (!normalized || isLocalRuntimeHost(normalized)) return false;
  if (!PRODUCTION_ROOT_DOMAIN) return false;
  return normalized === PRODUCTION_ROOT_DOMAIN || normalized.endsWith(`.${PRODUCTION_ROOT_DOMAIN}`);
}

function resolveStoreRuntimeMode(host = '') {
  if (isLocalRuntimeHost(host)) return 'local';
  if (isProductionRuntimeHost(host)) return 'production';
  return 'other';
}

function normalizeStoreKey(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeStoreKey(value) {
  const normalized = normalizeStoreKey(value);
  if (!normalized) return '';
  if (RESERVED_NON_STORE_SOURCE_KEYS.has(normalized)) return '';
  return normalized;
}

function safeDecodeUriComponent(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch (error) {
    return String(value || '');
  }
}

function extractStoreKey(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const normalized = sanitizeStoreKey(raw);
  const looksLikeUrlOrHost = /[:/?#]/.test(normalized) || normalized.includes('.');

  if (!looksLikeUrlOrHost) {
    return normalized;
  }

  const queryMatch = normalized.match(/[?&](?:store_key|store)=([^&#]+)/i);
  if (queryMatch?.[1]) {
    const fromQuery = sanitizeStoreKey(safeDecodeUriComponent(queryMatch[1]));
    if (fromQuery) {
      return fromQuery;
    }
  }

  const fromHost = sanitizeStoreKey(parseHostPrefix(normalized));
  if (fromHost) {
    return fromHost;
  }

  return '';
}

function normalizeComparableStoreToken(value) {
  return normalizeStoreKey(value).replace(STORE_COMPARABLE_CLEAN_RE, '');
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function normalizeStoreDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }

  const withoutProtocol = raw.replace(/^[a-z]+:\/\//, '');
  const hostPart = withoutProtocol.split(/[/?#]/)[0] || '';
  const host = hostPart.split(':')[0] || '';
  if (!host) {
    return '';
  }

  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return '';
  }

  if (host.includes('.')) {
    return parseHostPrefix(host);
  }

  return host === 'www' ? '' : host;
}

function collectPrefixCandidates(...values) {
  const set = new Set();

  for (const value of values) {
    const normalizedKey = sanitizeStoreKey(value);
    if (normalizedKey) {
      set.add(normalizedKey);
    }

    const normalizedDomain = sanitizeStoreKey(normalizeStoreDomain(value));
    if (normalizedDomain) {
      set.add(normalizedDomain);
    }
  }

  return Array.from(set);
}

function isOnlineStoreKey(value) {
  return normalizeStoreKey(value) === ONLINE_STORE_KEY;
}

function isOnlineStore(store = null) {
  if (!store) {
    return false;
  }
  return isOnlineStoreKey(store.domain_prefix) || isOnlineStoreKey(store.subdomain);
}

async function findStoreById(storeId) {
  const id = Number(storeId);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const rows = await query(
    `SELECT ${STORE_SELECT_FIELDS}
     FROM stores
     WHERE id = :id AND is_deleted = 0
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function findStoreByPrefix(prefix) {
  const normalized = normalizeStoreKey(prefix);
  if (!normalized) {
    return null;
  }

  const exactRows = await query(
    `SELECT ${STORE_SELECT_FIELDS}
     FROM stores
     WHERE is_deleted = 0
       AND (
         LOWER(COALESCE(domain_prefix, '')) = :prefix
         OR LOWER(COALESCE(subdomain, '')) = :prefix
       )
     LIMIT 1`,
    { prefix: normalized }
  );
  if (exactRows[0]) {
    return exactRows[0];
  }

  const compact = normalizeComparableStoreToken(normalized);
  if (!compact) {
    return null;
  }

  const fuzzyRows = await query(
    `SELECT ${STORE_SELECT_FIELDS}
     FROM stores
     WHERE is_deleted = 0
       AND (
         REPLACE(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(domain_prefix, '')), '-', ''), '_', ''), '.', ''), ' ', '') = :compact
         OR REPLACE(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(subdomain, '')), '-', ''), '_', ''), '.', ''), ' ', '') = :compact
       )
     LIMIT 1`,
    { compact }
  );
  if (fuzzyRows[0]) {
    return fuzzyRows[0];
  }

  const byNameRows = await query(
    `SELECT ${STORE_SELECT_FIELDS}
     FROM stores
     WHERE is_deleted = 0
       AND (
         LOWER(COALESCE(name, '')) = :prefix
         OR REPLACE(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(name, '')), '-', ''), '_', ''), '.', ''), ' ', '') = :compact
       )
     LIMIT 1`,
    {
      prefix: normalized,
      compact,
    }
  );

  return byNameRows[0] || null;
}

async function findStoreBySourceKey(storeKey) {
  const key = extractStoreKey(storeKey);
  if (!key) {
    return null;
  }

  const subdomainRows = await query(
    `SELECT ${STORE_SELECT_FIELDS}
     FROM stores
     WHERE is_deleted = 0
       AND LOWER(COALESCE(subdomain, '')) = :key
     LIMIT 1`,
    { key }
  );
  if (subdomainRows[0]) {
    return subdomainRows[0];
  }

  const domainPrefixRows = await query(
    `SELECT ${STORE_SELECT_FIELDS}
     FROM stores
     WHERE is_deleted = 0
       AND LOWER(COALESCE(domain_prefix, '')) = :key
     LIMIT 1`,
    { key }
  );
  return domainPrefixRows[0] || null;
}

async function findOnlineStore(includeDeleted = false) {
  const rows = await query(
    `SELECT ${STORE_SELECT_FIELDS}, is_deleted
     FROM stores
     WHERE (
       LOWER(COALESCE(domain_prefix, '')) = :online_key
       OR LOWER(COALESCE(subdomain, '')) = :online_key
     )
     ${includeDeleted ? '' : 'AND is_deleted = 0'}
     ORDER BY is_deleted ASC, id ASC
     LIMIT 1`,
    { online_key: ONLINE_STORE_KEY }
  );

  return rows[0] || null;
}

async function resolveOnlineFallbackStore() {
  const active = await findOnlineStore(false);
  if (active) {
    return active;
  }

  const existing = await findOnlineStore(true);
  if (existing) {
    if (Number(existing.is_deleted) === 1) {
      await query(
        `UPDATE stores
         SET is_deleted = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :id`,
        { id: Number(existing.id) }
      );

      const revived = await findOnlineStore(false);
      if (revived) {
        return revived;
      }
    } else {
      return existing;
    }
  }

  try {
    const insertResult = await query(
      `INSERT INTO stores (name, subdomain, domain_prefix, commission_rate, is_deleted)
       VALUES (:name, :subdomain, :domain_prefix, :commission_rate, 0)`,
      {
        name: DEFAULT_ONLINE_STORE_NAME,
        subdomain: ONLINE_STORE_KEY,
        domain_prefix: ONLINE_STORE_KEY,
        commission_rate: 0,
      }
    );

    const insertedId = Number(insertResult?.insertId || 0);
    if (insertedId > 0) {
      const createdRows = await query(
        `SELECT ${STORE_SELECT_FIELDS}
         FROM stores
         WHERE id = :id
         LIMIT 1`,
        { id: insertedId }
      );
      if (createdRows[0]) {
        return createdRows[0];
      }
    }
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  return findOnlineStore(false);
}

function resolveStoreKeyByPriority(req) {
  const rawHost = firstNonEmpty(req.headers?.['x-forwarded-host'], req.headers?.host, req.hostname);
  const runtimeMode = resolveStoreRuntimeMode(rawHost);

  const fromBody = extractStoreKey(firstNonEmpty(req.body?.store_key, req.body?.storeKey));
  const fromQuery = extractStoreKey(firstNonEmpty(req.query?.store, req.query?.store_key, req.query?.storeKey));
  const fromHost = sanitizeStoreKey(parseHostPrefix(rawHost));

  if (runtimeMode === 'production') {
    if (fromHost) return { storeKey: fromHost, source: 'headers.host', runtimeMode };
    if (fromBody) return { storeKey: fromBody, source: 'body.store_key', runtimeMode };
    if (fromQuery) return { storeKey: fromQuery, source: 'query.store', runtimeMode };
    return { storeKey: '', source: '', runtimeMode };
  }

  if (runtimeMode === 'local') {
    if (fromBody) return { storeKey: fromBody, source: 'body.store_key', runtimeMode };
    if (fromQuery) return { storeKey: fromQuery, source: 'query.store', runtimeMode };
    if (fromHost) return { storeKey: fromHost, source: 'headers.host', runtimeMode };
    return { storeKey: '', source: '', runtimeMode };
  }

  if (fromHost) return { storeKey: fromHost, source: 'headers.host', runtimeMode };
  if (fromBody) return { storeKey: fromBody, source: 'body.store_key', runtimeMode };
  if (fromQuery) return { storeKey: fromQuery, source: 'query.store', runtimeMode };

  return { storeKey: '', source: '', runtimeMode };
}

async function resolveStore(req) {
  const { storeKey, source } = resolveStoreKeyByPriority(req);
  if (storeKey) {
    const store = await findStoreBySourceKey(storeKey);
    if (store) {
      return {
        ok: true,
        store,
        store_id: Number(store.id),
        store_key: storeKey,
        source,
        fallback: false,
        fallback_reason: '',
        error: null,
      };
    }
  }

  const explicitStoreId = firstNonEmpty(
    req.body?.store_id,
    req.body?.storeId,
    req.query?.store_id,
    req.query?.storeId,
    req.headers?.['x-store-id']
  );
  if (explicitStoreId) {
    const directStore = await findStoreById(explicitStoreId);
    if (directStore) {
      return {
        ok: true,
        store: directStore,
        store_id: Number(directStore.id),
        store_key: normalizeStoreKey(directStore.domain_prefix || directStore.subdomain || directStore.name || ''),
        source: 'store_id',
        fallback: false,
        fallback_reason: '',
        error: null,
      };
    }
  }

  const onlineStore = await resolveOnlineFallbackStore();
  if (!onlineStore) {
    return {
      ok: false,
      store: null,
      store_id: null,
      store_key: storeKey || ONLINE_STORE_KEY,
      source: source || 'fallback.online',
      fallback: true,
      fallback_reason: storeKey ? 'store_not_found' : 'store_key_missing',
      error: STORE_SOURCE_NOT_FOUND_MESSAGE,
    };
  }

  return {
    ok: true,
    store: onlineStore,
    store_id: Number(onlineStore.id),
    store_key: storeKey || ONLINE_STORE_KEY,
    source: source || 'fallback.online',
    fallback: true,
    fallback_reason: storeKey ? 'store_not_found' : 'store_key_missing',
    error: null,
  };
}

function resolveRequestStoreLocator(req, options = {}) {
  const bodyStoreKey = firstNonEmpty(req.body?.store_key, req.body?.storeKey);
  const queryStoreKey = firstNonEmpty(req.query?.store, req.query?.store_key, req.query?.storeKey);
  const headerStoreKey = firstNonEmpty(req.headers?.['x-store-key'], req.headers?.['x-storekey']);
  const rawHost = firstNonEmpty(req.headers?.['x-forwarded-host'], req.headers?.host, req.hostname);
  const runtimeMode = resolveStoreRuntimeMode(rawHost);
  const fromBody = extractStoreKey(firstNonEmpty(bodyStoreKey, options.storeKey));
  const fromQuery = extractStoreKey(firstNonEmpty(queryStoreKey, headerStoreKey));
  const hostPrefix = sanitizeStoreKey(parseHostPrefix(rawHost));

  let storeKey = '';
  if (runtimeMode === 'production') {
    storeKey = firstNonEmpty(hostPrefix, fromBody, fromQuery);
  } else if (runtimeMode === 'local') {
    storeKey = firstNonEmpty(fromBody, fromQuery, hostPrefix);
  } else {
    storeKey = firstNonEmpty(hostPrefix, fromBody, fromQuery);
  }

  return {
    bodyStoreKey: fromBody,
    storeKey: extractStoreKey(storeKey),
    hostPrefix,
    runtimeMode,
  };
}

async function resolveStoreFromRequest(req, explicitStoreId, options = {}) {
  const preferStoreKey = options.preferStoreKey !== false;
  const disableStoreIdFallback = options.disableStoreIdFallback === true;
  const { storeKey, hostPrefix } = resolveRequestStoreLocator(req, options);

  if (preferStoreKey && storeKey) {
    const fromStoreKey = await findStoreBySourceKey(storeKey);
    if (fromStoreKey) {
      return fromStoreKey;
    }
    return null;
  }

  const domainCandidates = collectPrefixCandidates(hostPrefix);
  for (const candidate of domainCandidates) {
    const fromDomain = await findStoreBySourceKey(candidate);
    if (fromDomain) {
      return fromDomain;
    }
  }

  if (disableStoreIdFallback) {
    return null;
  }

  const direct = await findStoreById(explicitStoreId);
  if (direct) {
    return direct;
  }

  const headerStoreId = req.headers['x-store-id'];
  const fromHeaderId = await findStoreById(headerStoreId);
  if (fromHeaderId) {
    return fromHeaderId;
  }

  return null;
}

module.exports = {
  STORE_SOURCE_NOT_FOUND_MESSAGE,
  normalizeStoreKey,
  isOnlineStoreKey,
  isOnlineStore,
  resolveStore,
  resolveRequestStoreLocator,
  resolveStoreFromRequest,
};

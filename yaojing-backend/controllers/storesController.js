const { query } = require('../config/db');
const { hasRole, hasPagePermission } = require('../middleware/permissions');
const { ok, fail } = require('../utils/http');
const { writeOperationLog } = require('../utils/operationLog');
const { buildStoreDomainPreview, buildDomainConfigSnapshot } = require('../utils/domainConfig');
const RESERVED_SOURCE_PREFIXES = new Set(['admin']);

function normalizeDomainPrefix(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }
  return raw.replace(/[^a-z0-9-]/g, '');
}

function normalizeStoreKey(input) {
  return normalizeDomainPrefix(input);
}

function parseCommissionRate(value, fallback = null) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return fallback;
  }
  const rate = Number(value);
  return Number.isFinite(rate) ? rate : NaN;
}

function isDuplicateKeyError(error) {
  return Boolean(error && (error.code === 'ER_DUP_ENTRY' || Number(error.errno) === 1062));
}

function normalizeStoreIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function isReservedSourcePrefix(value) {
  const normalized = normalizeStoreIdentifier(value);
  if (!normalized) return false;
  return RESERVED_SOURCE_PREFIXES.has(normalized);
}

function validateStoreIdentifiers(domainPrefix, subdomain, storeKey) {
  if (isReservedSourcePrefix(domainPrefix) || isReservedSourcePrefix(subdomain) || isReservedSourcePrefix(storeKey)) {
    return 'admin 前缀为系统后台保留标识，不能用于网吧来源';
  }
  return '';
}

function isOnlineFallbackStore(store = {}) {
  return (
    normalizeStoreIdentifier(store.store_key) === 'online' ||
    normalizeStoreIdentifier(store.subdomain) === 'online' ||
    normalizeStoreIdentifier(store.domain_prefix) === 'online'
  );
}

function toStoreWithDomainPreview(store) {
  if (!store) {
    return store;
  }
  return {
    ...store,
    domain_preview: buildStoreDomainPreview(store),
  };
}

async function getDomainConfig(req, res) {
  return ok(res, buildDomainConfigSnapshot(), 'domain config fetched');
}

async function listStores(req, res) {
  if (!hasPagePermission(req.user, 'stores:view')) {
    return fail(res, 'Forbidden', 403);
  }

  const isStoreOwner = hasRole(req.user, 'store_owner');
  const params = {};
  let where = 's.is_deleted = 0';

  if (isStoreOwner) {
    if (!req.user.store_id) {
      return fail(res, 'Store owner is not bound to a store', 400);
    }
    where += ' AND s.id = :scope_store_id';
    params.scope_store_id = Number(req.user.store_id);
  }

  const rows = await query(
    `SELECT
      s.id,
      s.name,
      s.store_key,
      s.subdomain,
      s.domain_prefix,
      s.commission_rate,
      COUNT(o.id) AS order_count,
      COALESCE(SUM(CASE WHEN o.is_deleted = 0 AND o.status = 'completed' THEN COALESCE(o.revised_amount, o.order_amount) ELSE 0 END), 0) AS total_income
     FROM stores s
     LEFT JOIN orders o ON o.store_id = s.id
     WHERE ${where}
     GROUP BY s.id, s.name, s.store_key, s.subdomain, s.domain_prefix, s.commission_rate
     ORDER BY s.id DESC`,
    params
  );

  return ok(
    res,
    {
      list: rows.map((item) => toStoreWithDomainPreview(item)),
      total: rows.length,
      domain_config: buildDomainConfigSnapshot(),
    },
    'stores fetched'
  );
}

async function createStore(req, res) {
  const { name } = req.body || {};
  const commissionRate = parseCommissionRate(req.body?.commission_rate, 0.05);
  const rawDomainPrefix = req.body?.domain_prefix;
  const rawSubdomain = req.body?.subdomain;
  const rawStoreKey = req.body?.store_key;
  const hasDomainPrefix = Object.prototype.hasOwnProperty.call(req.body || {}, 'domain_prefix');
  const hasSubdomain = Object.prototype.hasOwnProperty.call(req.body || {}, 'subdomain');
  const hasStoreKey = Object.prototype.hasOwnProperty.call(req.body || {}, 'store_key');
  const domainPrefix = normalizeDomainPrefix(hasDomainPrefix ? rawDomainPrefix : rawSubdomain || '');
  const subdomain = normalizeDomainPrefix(hasSubdomain ? rawSubdomain : rawDomainPrefix || '');
  const storeKey = normalizeStoreKey(hasStoreKey ? rawStoreKey : domainPrefix || subdomain);

  if (!name) {
    return fail(res, 'Store name is required', 400);
  }
  if (!Number.isFinite(commissionRate)) {
    return fail(res, 'Invalid commission_rate', 400);
  }
  if (!storeKey) {
    return fail(res, 'store_key is required', 400);
  }

  const reservedPrefixError = validateStoreIdentifiers(domainPrefix, subdomain, storeKey);
  if (reservedPrefixError) {
    return fail(res, reservedPrefixError, 400);
  }

  try {
    await query(
      `INSERT INTO stores (name, store_key, commission_rate, subdomain, domain_prefix)
       VALUES (:name, :store_key, :commission_rate, :subdomain, :domain_prefix)`,
      {
        name: String(name),
        store_key: storeKey,
        commission_rate: commissionRate,
        subdomain: subdomain || null,
        domain_prefix: domainPrefix || null,
      }
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return fail(res, 'store_key、domain_prefix 或 subdomain 已存在', 409);
    }
    throw error;
  }

  const rows = await query(
    `SELECT id, name, store_key, subdomain, domain_prefix, commission_rate
     FROM stores
     WHERE name = :name
     ORDER BY id DESC
     LIMIT 1`,
    { name: String(name) }
  );
  const row = toStoreWithDomainPreview(rows[0] || null);

  await writeOperationLog(req, {
    action: 'stores.create',
    detail: `新增网吧：${name}`,
    target_type: 'store',
    target_id: row?.id || null,
    after: row,
  });

  return ok(res, row, 'store created');
}

async function updateStore(req, res) {
  const id = Number(req.params.id);
  const { name } = req.body || {};
  const commissionRate = parseCommissionRate(req.body?.commission_rate);
  const hasDomainPrefix = Object.prototype.hasOwnProperty.call(req.body || {}, 'domain_prefix');
  const hasSubdomain = Object.prototype.hasOwnProperty.call(req.body || {}, 'subdomain');
  const hasStoreKey = Object.prototype.hasOwnProperty.call(req.body || {}, 'store_key');
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
  const hasCommissionRate = Object.prototype.hasOwnProperty.call(req.body || {}, 'commission_rate');

  if (hasCommissionRate && !Number.isFinite(commissionRate)) {
    return fail(res, 'Invalid commission_rate', 400);
  }

  const beforeRows = await query(
    `SELECT id, name, store_key, subdomain, domain_prefix, commission_rate
     FROM stores
     WHERE id = :id AND is_deleted = 0
     LIMIT 1`,
    { id }
  );
  if (!beforeRows.length) {
    return fail(res, 'Store not found', 404);
  }
  const before = beforeRows[0];

  const nextDomainPrefix = hasDomainPrefix
    ? normalizeDomainPrefix(req.body?.domain_prefix) || null
    : before.domain_prefix;
  const nextSubdomain = hasSubdomain
    ? normalizeDomainPrefix(req.body?.subdomain) || null
    : before.subdomain;
  const nextStoreKey = hasStoreKey
    ? normalizeStoreKey(req.body?.store_key) || nextDomainPrefix || nextSubdomain || null
    : normalizeStoreKey(before.store_key) || nextDomainPrefix || nextSubdomain || null;

  if (!nextStoreKey) {
    return fail(res, 'store_key is required', 400);
  }

  const reservedPrefixError = validateStoreIdentifiers(nextDomainPrefix, nextSubdomain, nextStoreKey);
  if (reservedPrefixError) {
    return fail(res, reservedPrefixError, 400);
  }

  if (!hasName && !hasCommissionRate && !hasDomainPrefix && !hasSubdomain && !hasStoreKey) {
    return ok(res, before, 'store updated');
  }

  try {
    await query(
      `UPDATE stores
       SET name = COALESCE(:name, name),
           store_key = :store_key,
           commission_rate = COALESCE(:commission_rate, commission_rate),
           subdomain = :subdomain,
           domain_prefix = :domain_prefix,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id AND is_deleted = 0`,
      {
        id,
        name: typeof name === 'undefined' ? null : String(name),
        store_key: nextStoreKey,
        commission_rate: hasCommissionRate ? commissionRate : null,
        subdomain: nextSubdomain,
        domain_prefix: nextDomainPrefix,
      }
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return fail(res, 'store_key、domain_prefix 或 subdomain 已存在', 409);
    }
    throw error;
  }

  const afterRows = await query(
    `SELECT id, name, store_key, subdomain, domain_prefix, commission_rate
     FROM stores
     WHERE id = :id
     LIMIT 1`,
    { id }
  );
  const after = toStoreWithDomainPreview(afterRows[0] || null);
  const commissionChanged = Number(before.commission_rate) !== Number(after?.commission_rate);
  const domainChanged =
    String(before.store_key || '') !== String(after?.store_key || '') ||
    String(before.domain_prefix || '') !== String(after?.domain_prefix || '') ||
    String(before.subdomain || '') !== String(after?.subdomain || '');
  const nameChanged = String(before.name || '') !== String(after?.name || '');
  const actionCode = commissionChanged && !domainChanged && !nameChanged ? 'stores.set_commission' : 'stores.update';
  const detailText = commissionChanged && !domainChanged && !nameChanged
    ? `设置网吧分成比例：网吧${id} ${before.commission_rate} -> ${after?.commission_rate}`
    : `修改网吧信息：网吧${id}`;

  await writeOperationLog(req, {
    action: actionCode,
    detail: detailText,
    target_type: 'store',
    target_id: id,
    before,
    after,
  });

  return ok(res, after, 'store updated');
}

async function updateStoreDomain(req, res) {
  const id = Number(req.params.id);
  const hasDomainPrefix = Object.prototype.hasOwnProperty.call(req.body || {}, 'domain_prefix');
  const hasSubdomain = Object.prototype.hasOwnProperty.call(req.body || {}, 'subdomain');
  if (!hasDomainPrefix && !hasSubdomain) {
    return fail(res, 'domain_prefix or subdomain is required', 400);
  }

  const beforeRows = await query(
    `SELECT id, name, store_key, subdomain, domain_prefix
     FROM stores
     WHERE id = :id AND is_deleted = 0
     LIMIT 1`,
    { id }
  );
  if (!beforeRows.length) {
    return fail(res, 'Store not found', 404);
  }
  const before = beforeRows[0];

  const incomingDomainPrefix = hasDomainPrefix ? normalizeDomainPrefix(req.body?.domain_prefix) : null;
  const incomingSubdomain = hasSubdomain ? normalizeDomainPrefix(req.body?.subdomain) : null;
  const nextDomainPrefix = hasDomainPrefix
    ? incomingDomainPrefix || null
    : incomingSubdomain || before.domain_prefix || null;
  const nextSubdomain = hasSubdomain
    ? incomingSubdomain || null
    : incomingDomainPrefix || before.subdomain || null;
  const nextStoreKey = normalizeStoreKey(before.store_key) || nextDomainPrefix || nextSubdomain || null;

  if (!nextStoreKey) {
    return fail(res, 'store_key is required', 400);
  }

  const reservedPrefixError = validateStoreIdentifiers(nextDomainPrefix, nextSubdomain, nextStoreKey);
  if (reservedPrefixError) {
    return fail(res, reservedPrefixError, 400);
  }

  try {
    await query(
      `UPDATE stores
       SET store_key = :store_key,
           domain_prefix = :domain_prefix,
           subdomain = :subdomain,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id AND is_deleted = 0`,
      {
        id,
        store_key: nextStoreKey,
        domain_prefix: nextDomainPrefix,
        subdomain: nextSubdomain,
      }
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return fail(res, 'store_key、domain_prefix 或 subdomain 已存在', 409);
    }
    throw error;
  }

  const afterRows = await query(
    `SELECT id, name, store_key, subdomain, domain_prefix
     FROM stores
     WHERE id = :id
     LIMIT 1`,
    { id }
  );
  const after = toStoreWithDomainPreview(afterRows[0] || null);

  await writeOperationLog(req, {
    action: 'stores.update_domain',
    detail: `修改网吧来源标识：网吧${id} -> ${nextDomainPrefix || '-'} / ${nextSubdomain || '-'}`,
    target_type: 'store',
    target_id: id,
    before,
    after,
  });

  return ok(res, after, 'store domain updated');
}

async function deleteStore(req, res) {
  const id = Number(req.params.id);
  const beforeRows = await query(
    `SELECT id, name, store_key, subdomain, domain_prefix, is_deleted
     FROM stores
     WHERE id = :id
     LIMIT 1`,
    { id }
  );
  if (!beforeRows.length) {
    return fail(res, 'Store not found', 404);
  }
  const before = beforeRows[0];
  if (isOnlineFallbackStore(before)) {
    return fail(res, 'Cannot delete online fallback store', 400);
  }

  await query(`UPDATE stores SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = :id`, { id });
  const afterRows = await query(
    `SELECT id, name, store_key, subdomain, domain_prefix, is_deleted
     FROM stores
     WHERE id = :id
     LIMIT 1`,
    { id }
  );

  await writeOperationLog(req, {
    action: 'stores.delete',
    detail: `删除网吧：网吧${id}`,
    target_type: 'store',
    target_id: id,
    before,
    after: afterRows[0] || null,
  });

  return ok(res, { store_id: id }, 'store deleted');
}

module.exports = {
  getDomainConfig,
  listStores,
  createStore,
  updateStore,
  updateStoreDomain,
  deleteStore,
};


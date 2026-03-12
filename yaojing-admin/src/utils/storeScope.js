function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).trim();
}

function pushCandidate(set, value, normalizer = normalizeId) {
  if (Array.isArray(value)) {
    value.forEach((item) => pushCandidate(set, item, normalizer));
    return;
  }

  const normalized = normalizer(value);
  if (normalized) {
    set.add(normalized);
  }
}

function pickFirst(values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}

function rowStoreId(row) {
  return normalizeId(
    pickFirst([
      row.store_id,
      row.storeId,
      row.netbar_id,
      row.netbarId,
      row.store?.id,
      row.store?.store_id,
      row.source_store_id,
      row.sourceStoreId,
    ]),
  );
}

function rowStoreName(row) {
  return normalizeText(
    pickFirst([
      row.store_name,
      row.storeName,
      row.netbar_name,
      row.netbarName,
      row.store?.name,
      row.store?.title,
      row.source_store_name,
      row.sourceStoreName,
    ]),
  );
}

export function resolveOwnerStoreScope(userInfo) {
  const info = userInfo || {};
  const idSet = new Set();
  const nameSet = new Set();
  const nestedStore = info.store || info.netbar || info.bound_store || {};

  [
    info.store_id,
    info.storeId,
    info.netbar_id,
    info.netbarId,
    info.bind_store_id,
    info.bound_store_id,
    info.store_ids,
    info.storeIds,
    nestedStore.id,
    nestedStore.store_id,
    nestedStore.netbar_id,
  ].forEach((value) => pushCandidate(idSet, value, normalizeId));

  [
    info.store_name,
    info.storeName,
    info.netbar_name,
    info.netbarName,
    nestedStore.name,
    nestedStore.title,
  ].forEach((value) => pushCandidate(nameSet, value, normalizeText));

  return {
    ids: Array.from(idSet),
    names: Array.from(nameSet),
  };
}

export function resolvePrimaryOwnerStoreId(userInfo) {
  const scope = resolveOwnerStoreScope(userInfo);
  return scope.ids[0];
}

export function hasOwnerScope(scope) {
  const target = scope || { ids: [], names: [] };
  return Boolean((target.ids && target.ids.length) || (target.names && target.names.length));
}

export function isRowInOwnerScope(row, scope) {
  const target = scope || { ids: [], names: [] };
  if ((!target.ids || !target.ids.length) && (!target.names || !target.names.length)) {
    return true;
  }

  const id = rowStoreId(row);
  if (id && target.ids?.includes(id)) return true;

  const name = rowStoreName(row);
  if (name && target.names?.includes(name)) return true;

  return false;
}

export function filterRowsByOwnerScope(rows, scope) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isRowInOwnerScope(row, scope));
}

export function withOwnerStoreQuery(query, role, userInfo) {
  if (role !== 'store_owner') return query;
  const storeId = resolvePrimaryOwnerStoreId(userInfo);
  if (!storeId) return query;
  return {
    ...query,
    store_id: storeId,
  };
}

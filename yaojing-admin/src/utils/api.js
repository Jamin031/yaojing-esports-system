export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function isApiSuccess(response) {
  if (response === null || response === undefined) return false;
  if (!isPlainObject(response)) return true;

  if (typeof response.success === 'boolean') {
    return response.success;
  }

  if (isPlainObject(response.data) && typeof response.data.success === 'boolean') {
    return response.data.success;
  }

  const code = response.code ?? response.status ?? response.statusCode;
  if (code === null || code === undefined || code === '') {
    return true;
  }

  const codeNum = toNumber(code);
  if (codeNum !== null) {
    return codeNum === 0 || (codeNum >= 200 && codeNum < 300);
  }

  return !['error', 'fail', 'failed'].includes(String(code).toLowerCase());
}

export function getPayload(response) {
  if (Array.isArray(response)) return response;
  if (!isPlainObject(response)) return response;

  if (Array.isArray(response.data)) {
    return response.data;
  }

  if (isPlainObject(response.data)) {
    return response.data;
  }

  return response;
}

export function getPayloadObject(response) {
  const payload = getPayload(response);
  if (isPlainObject(payload)) return payload;
  if (isPlainObject(response)) return response;
  return {};
}

export function getList(response) {
  if (Array.isArray(response)) return response;

  const payload = getPayload(response);
  if (Array.isArray(payload)) return payload;

  const target = isPlainObject(payload) ? payload : {};
  const candidates = [
    target.list,
    target.rows,
    target.items,
    target.records,
    target.result,
    target.data,
    target.page?.list,
    target.page?.rows,
    target.pagination?.list,
    target.pagination?.items,
  ];

  for (const item of candidates) {
    if (Array.isArray(item)) return item;
  }

  return [];
}

export function getTotal(response) {
  const payload = getPayloadObject(response);
  const candidates = [
    payload.total,
    payload.count,
    payload.total_count,
    payload.totalCount,
    payload.page?.total,
    payload.pagination?.total,
    payload.meta?.total,
  ];

  for (const item of candidates) {
    const num = toNumber(item);
    if (num !== null) return num;
  }

  return getList(response).length;
}

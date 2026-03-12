const STORE_BINDING_CACHE_KEY = 'yaojing_store_binding_cache_v1';
const SOURCE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const LOCAL_PREVIEW_ORIGIN = 'http://localhost:5174';
const PROD_PREVIEW_ROOT_DOMAIN = 'yaojingclub.com';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).trim();
}

export function normalizeSourceIdentifier(value) {
  return normalizeText(value).toLowerCase();
}

export function isValidSourceIdentifier(value) {
  const normalized = normalizeSourceIdentifier(value);
  return Boolean(normalized) && SOURCE_IDENTIFIER_PATTERN.test(normalized);
}

function normalizeDomainRoot(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return '';

  let hostname = raw;
  if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
    try {
      hostname = new URL(hostname).hostname || '';
    } catch {
      hostname = hostname.replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  hostname = hostname.split('/')[0].replace(/^\.+|\.+$/g, '').replace(/:\d+$/, '');
  if (!hostname || hostname === 'localhost') return '';
  return hostname;
}

function firstDefined(values, fallback = '') {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return fallback;
}

function resolveDefaultSubdomain() {
  const envDomain = normalizeDomainRoot(import.meta.env.VITE_STORE_DOMAIN_SUFFIX || '');
  if (envDomain) return envDomain;

  const envProdRoot = normalizeDomainRoot(import.meta.env.VITE_STORE_PROD_ROOT_DOMAIN || '');
  if (envProdRoot) return envProdRoot;

  return PROD_PREVIEW_ROOT_DOMAIN;
}

function extractFromUrl(raw) {
  const text = normalizeText(raw);
  if (!text) return '';

  let parsed = null;
  try {
    parsed = new URL(text);
  } catch {
    try {
      parsed = new URL(`http://${text}`);
    } catch {
      parsed = null;
    }
  }
  if (!parsed) return '';

  const fromQuery = normalizeSourceIdentifier(
    parsed.searchParams.get('store') || parsed.searchParams.get('source') || parsed.searchParams.get('store_key') || '',
  );
  if (isValidSourceIdentifier(fromQuery)) return fromQuery;

  const host = normalizeDomainRoot(parsed.hostname || '');
  if (!host) return '';
  const firstLabel = host.split('.')[0];
  if (firstLabel === 'www') return '';
  if (isValidSourceIdentifier(firstLabel)) return firstLabel;
  return '';
}

function extractFromDirtyText(raw) {
  const text = normalizeSourceIdentifier(raw);
  if (!text) return '';

  if (isValidSourceIdentifier(text)) return text;

  const fromUrl = extractFromUrl(text);
  if (fromUrl) return fromUrl;

  const fromQuery = text.match(/(?:^|[?&#]|%3f|%26)(?:store|source|store_key)(?:=|%3d)([a-z0-9][a-z0-9_-]{0,62})/i);
  if (fromQuery && isValidSourceIdentifier(fromQuery[1])) return normalizeSourceIdentifier(fromQuery[1]);

  const fromSuffix = text.match(/(?:store|source|storekey)([a-z0-9][a-z0-9_-]{1,62})$/i);
  if (fromSuffix && isValidSourceIdentifier(fromSuffix[1])) return normalizeSourceIdentifier(fromSuffix[1]);

  const fromHostLike = text.match(/^([a-z0-9][a-z0-9_-]{0,62})\.[a-z0-9.-]+$/);
  if (fromHostLike && fromHostLike[1] !== 'www' && isValidSourceIdentifier(fromHostLike[1])) {
    return normalizeSourceIdentifier(fromHostLike[1]);
  }

  return '';
}

function resolveIdentifierField(rawValue) {
  const raw = normalizeText(rawValue);
  if (!raw) {
    return {
      identifier: '',
      dirty: false,
      dirtyRaw: '',
    };
  }

  const normalized = normalizeSourceIdentifier(raw);
  if (isValidSourceIdentifier(normalized)) {
    return {
      identifier: normalized,
      dirty: false,
      dirtyRaw: '',
    };
  }

  const extracted = extractFromDirtyText(raw);
  if (isValidSourceIdentifier(extracted)) {
    return {
      identifier: extracted,
      dirty: true,
      dirtyRaw: raw,
    };
  }

  return {
    identifier: '',
    dirty: true,
    dirtyRaw: raw,
  };
}

function resolveRawStoreId(row) {
  return normalizeId(firstDefined([row?.id, row?.store_id, row?.storeId]));
}

function readBindingCache() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORE_BINDING_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBindingCache(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_BINDING_CACHE_KEY, JSON.stringify(value || {}));
  } catch {
    // ignore cache errors
  }
}

export function resolveStoreBinding(row) {
  const rawDomainPrefix = firstDefined([row?.domain_prefix, row?.domainPrefix], '');
  const rawSubdomain = firstDefined([row?.subdomain, row?.domain_suffix, row?.domainSuffix], '');
  const rawStoreKey = firstDefined([row?.store_key, row?.storeKey], '');

  const domainPrefixResult = resolveIdentifierField(rawDomainPrefix);
  const subdomainResult = resolveIdentifierField(rawSubdomain);
  const storeKeyResult = resolveIdentifierField(rawStoreKey);

  const domainPrefix = domainPrefixResult.identifier || storeKeyResult.identifier || subdomainResult.identifier || '';
  const subdomain = subdomainResult.identifier || domainPrefix || storeKeyResult.identifier || '';
  const sourceIdentifier = domainPrefix || subdomain || storeKeyResult.identifier || '';
  const storeKey = storeKeyResult.identifier || sourceIdentifier;

  const dirtyFields = [];
  if (domainPrefixResult.dirtyRaw) dirtyFields.push('domain_prefix');
  if (subdomainResult.dirtyRaw) dirtyFields.push('subdomain');
  if (storeKeyResult.dirtyRaw) dirtyFields.push('store_key');

  const dirtyRaw = [
    domainPrefixResult.dirtyRaw ? `domain_prefix=${domainPrefixResult.dirtyRaw}` : '',
    subdomainResult.dirtyRaw ? `subdomain=${subdomainResult.dirtyRaw}` : '',
    storeKeyResult.dirtyRaw ? `store_key=${storeKeyResult.dirtyRaw}` : '',
  ]
    .filter(Boolean)
    .join(' ; ');

  return {
    id: resolveRawStoreId(row),
    source_identifier: sourceIdentifier,
    store_key: storeKey,
    domain_prefix: domainPrefix,
    subdomain,
    binding_dirty: Boolean(dirtyFields.length),
    binding_dirty_raw: dirtyRaw,
    binding_dirty_field: dirtyFields.join(','),
    binding_dirty_domain_prefix_raw: domainPrefixResult.dirtyRaw,
    binding_dirty_subdomain_raw: subdomainResult.dirtyRaw,
    binding_dirty_store_key_raw: storeKeyResult.dirtyRaw,
  };
}

export function resolveFullDomain(value, maybeSubdomain = '') {
  const identifier = value && typeof value === 'object'
    ? resolveStoreBinding(value).source_identifier
    : extractFromDirtyText(value);

  if (!identifier) return '-';

  const rootDomain = normalizeDomainRoot(maybeSubdomain || resolveDefaultSubdomain());
  if (!rootDomain) return identifier;
  return `${identifier}.${rootDomain}`;
}

export function resolveLocalPreviewUrl(sourceIdentifier) {
  const id = extractFromDirtyText(sourceIdentifier);
  if (!id) return `${LOCAL_PREVIEW_ORIGIN}/?store=`;
  return `${LOCAL_PREVIEW_ORIGIN}/?store=${id}`;
}

export function resolveProdPreviewUrl(sourceIdentifier) {
  const id = extractFromDirtyText(sourceIdentifier);
  const rootDomain = PROD_PREVIEW_ROOT_DOMAIN;
  if (!id) return `https://<source>.${rootDomain}`;
  return `https://${id}.${rootDomain}`;
}

export function mergeStoreBindingCache(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const cache = readBindingCache();
  return rows.map((row) => {
    const id = resolveRawStoreId(row);
    if (!id || !cache[id]) return row;
    return {
      ...row,
      ...cache[id],
    };
  });
}

export function persistStoreBindingCache(row) {
  const id = resolveRawStoreId(row);
  if (!id) return;

  const binding = resolveStoreBinding(row);
  const cache = readBindingCache();
  cache[id] = {
    name: normalizeText(row?.name),
    commission_rate: Number(row?.commission_rate ?? 0),
    domain_prefix: binding.domain_prefix,
    subdomain: binding.subdomain,
    store_key: binding.store_key,
  };
  writeBindingCache(cache);
}

export function removeStoreBindingCacheById(storeId) {
  const id = normalizeId(storeId);
  if (!id) return;
  const cache = readBindingCache();
  if (!Object.prototype.hasOwnProperty.call(cache, id)) return;
  delete cache[id];
  writeBindingCache(cache);
}

export function resolveSourceIdentifierMeta() {
  return {
    storeKeyName: 'store_key',
    domainPrefixName: 'domain_prefix',
    defaultSubdomain: resolveDefaultSubdomain() || 'yaojingclub.com',
  };
}

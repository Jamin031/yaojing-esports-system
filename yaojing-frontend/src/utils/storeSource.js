const DEFAULT_STORE_KEY = 'online';
const IPV4_HOST_REGEX = /^\d+\.\d+\.\d+\.\d+$/;
const FULLWIDTH_QUESTION_MARK_REGEX = /(?:\uFF1F|%EF%BC%9F)([^#]*)/i;
const URL_PROTOCOL_PREFIX_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const STORE_VALUE_RESERVED_CHARS_REGEX = /[/?#&=]/;
const RESERVED_NON_STORE_KEYS = new Set(['admin', 'www']);
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const PRODUCTION_ROOT_DOMAIN = String(ENV.VITE_PRODUCTION_ROOT_DOMAIN || 'yaojingclub.com')
  .trim()
  .toLowerCase();

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const safeDecodeUriComponent = (value) => {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch {
    return String(value || '');
  }
};

const sanitizeStoreKey = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (RESERVED_NON_STORE_KEYS.has(normalized)) return '';
  return normalized;
};

const normalizeHostName = (hostText = '') =>
  normalizeText(hostText)
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/?#]/)[0]
    .split(':')[0];

const isLocalHostName = (hostname = '') => {
  const normalizedHost = normalizeHostName(hostname);
  if (!normalizedHost) return true;
  if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost')) return true;
  return IPV4_HOST_REGEX.test(normalizedHost);
};

const isProductionRootHost = (hostname = '') => {
  const normalizedHost = normalizeHostName(hostname);
  if (!normalizedHost || isLocalHostName(normalizedHost)) return false;
  if (!PRODUCTION_ROOT_DOMAIN) return false;
  return normalizedHost === PRODUCTION_ROOT_DOMAIN || normalizedHost.endsWith(`.${PRODUCTION_ROOT_DOMAIN}`);
};

const resolveRuntimeMode = (hostname = '') => {
  if (isLocalHostName(hostname)) return 'local';
  if (isProductionRootHost(hostname)) return 'production';
  return 'other';
};

const extractStoreKeyFromHostText = (hostText = '') => {
  const normalizedHost = normalizeHostName(hostText);
  if (!normalizedHost || normalizedHost === 'localhost' || IPV4_HOST_REGEX.test(normalizedHost)) return '';

  const firstLabel = normalizedHost.split('.')[0] || '';
  return sanitizeStoreKey(firstLabel);
};

const resolveStoreKeyCandidate = (rawValue = '', depth = 0) => {
  if (rawValue === null || rawValue === undefined) return '';

  const decodedValue = safeDecodeUriComponent(rawValue);
  const normalizedDecodedValue = String(decodedValue || '').trim();
  if (!normalizedDecodedValue) return '';

  if (depth < 2) {
    const queryMatch = normalizedDecodedValue.match(/[?&](?:store|store_key)=([^&#]+)/i);
    if (queryMatch?.[1]) {
      const nestedStoreKey = resolveStoreKeyCandidate(queryMatch[1], depth + 1);
      if (nestedStoreKey) return nestedStoreKey;
    }
  }

  // Prevent submitting full URLs or query strings as store_key.
  if (URL_PROTOCOL_PREFIX_REGEX.test(normalizedDecodedValue)) return '';
  if (STORE_VALUE_RESERVED_CHARS_REGEX.test(normalizedDecodedValue)) return '';

  return sanitizeStoreKey(normalizedDecodedValue);
};

const getLocationSnapshot = () => {
  if (typeof window === 'undefined') {
    return {
      search: '',
      pathname: '',
      hash: '',
      href: '',
      hostname: '',
    };
  }

  return {
    search: window.location.search || '',
    pathname: window.location.pathname || '',
    hash: window.location.hash || '',
    href: window.location.href || '',
    hostname: window.location.hostname || '',
  };
};

const normalizeSearchText = (search) => {
  const normalizedSearch = String(search || '').trim();
  if (!normalizedSearch) return '';

  if (normalizedSearch.startsWith('?')) return normalizedSearch;
  if (normalizedSearch.startsWith('\uFF1F')) return `?${normalizedSearch.slice(1)}`;
  if (normalizedSearch.includes('=')) return `?${normalizedSearch.replace(/^[?\uFF1F]/, '')}`;

  return '';
};

const parseMalformedSearchFromLocation = (locationParts = {}) => {
  const candidates = [locationParts.pathname, locationParts.hash, locationParts.href];

  for (const candidate of candidates) {
    const normalizedCandidate = String(candidate || '');
    if (!normalizedCandidate) continue;

    const fullWidthQuestionMarkMatched = normalizedCandidate.match(FULLWIDTH_QUESTION_MARK_REGEX);
    if (fullWidthQuestionMarkMatched) {
      const rawQuery = String(fullWidthQuestionMarkMatched[1] || '').replace(/^\/+/, '');
      if (rawQuery) return `?${rawQuery}`;
    }

    const questionMarkIndex = normalizedCandidate.indexOf('?');
    if (questionMarkIndex === -1) continue;

    const rawQuery = normalizedCandidate
      .slice(questionMarkIndex + 1)
      .split('#')[0]
      .replace(/^\/+/, '');
    if (rawQuery) return `?${rawQuery}`;
  }

  return '';
};

let hasWarnedMalformedStoreUrl = false;

const resolveEffectiveSearch = (search, locationParts = {}) => {
  const normalizedSearch = normalizeSearchText(search);
  if (normalizedSearch) return normalizedSearch;

  const malformedSearch = parseMalformedSearchFromLocation(locationParts);
  if (malformedSearch && !hasWarnedMalformedStoreUrl && typeof window !== 'undefined') {
    console.warn('[store-source] detected non-standard URL query. Prefer "?store=online".', {
      href: locationParts.href,
      parsed_search: malformedSearch,
    });
    hasWarnedMalformedStoreUrl = true;
  }

  return malformedSearch;
};

const resolveStoreKeyFromQuery = (search) => {
  try {
    const params = new URLSearchParams(search);
    const storeValue = params.get('store');
    const effectiveStoreValue = storeValue === null ? params.get('store_key') : storeValue;

    if (effectiveStoreValue === null) return '';
    if (effectiveStoreValue === '') return '';

    return resolveStoreKeyCandidate(effectiveStoreValue);
  } catch {
    return '';
  }
};

const resolveStoreKeyFromHost = (hostname = '') => extractStoreKeyFromHostText(hostname);

const resolveStoreResolution = (options = {}) => {
  const locationSnapshot = getLocationSnapshot();
  const locationParts = {
    pathname: options.pathname ?? locationSnapshot.pathname,
    hash: options.hash ?? locationSnapshot.hash,
    href: options.href ?? locationSnapshot.href,
    hostname: options.hostname ?? locationSnapshot.hostname,
  };
  const search = options.search ?? locationSnapshot.search;
  const runtimeMode = resolveRuntimeMode(locationParts.hostname);

  const effectiveSearch = resolveEffectiveSearch(search, locationParts);
  const storeKeyFromQuery = resolveStoreKeyFromQuery(effectiveSearch);
  const storeKeyFromHost = resolveStoreKeyFromHost(locationParts.hostname);

  if (runtimeMode === 'production') {
    if (storeKeyFromHost) {
      return {
        store_key: storeKeyFromHost,
        resolved_by: 'host',
      };
    }

    return {
      store_key: DEFAULT_STORE_KEY,
      resolved_by: 'default',
    };
  }

  if (runtimeMode === 'local') {
    if (storeKeyFromQuery) {
      return {
        store_key: storeKeyFromQuery,
        resolved_by: 'query',
      };
    }

    if (storeKeyFromHost) {
      return {
        store_key: storeKeyFromHost,
        resolved_by: 'host',
      };
    }

    return {
      store_key: DEFAULT_STORE_KEY,
      resolved_by: 'default',
    };
  }

  if (storeKeyFromHost) {
    return {
      store_key: storeKeyFromHost,
      resolved_by: 'host',
    };
  }

  if (storeKeyFromQuery) {
    return {
      store_key: storeKeyFromQuery,
      resolved_by: 'query',
    };
  }

  return {
    store_key: DEFAULT_STORE_KEY,
    resolved_by: 'default',
  };
};

export const resolveStoreKey = (options = {}) => resolveStoreResolution(options).store_key;

export const resolveStoreIdentity = (options = {}) => resolveStoreResolution(options);

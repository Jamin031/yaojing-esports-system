const PRODUCTION_ROOT_DOMAIN = String(process.env.PRODUCTION_ROOT_DOMAIN || 'yaojingclub.com').trim().toLowerCase();
const PRODUCTION_PROTOCOL = String(process.env.PRODUCTION_PROTOCOL || 'https').trim().toLowerCase() || 'https';
const LOCAL_PREVIEW_BASE_HOST = String(process.env.LOCAL_PREVIEW_BASE_HOST || 'localhost:5174').trim();
const LOCAL_PREVIEW_PROTOCOL = String(process.env.LOCAL_PREVIEW_PROTOCOL || 'http').trim().toLowerCase() || 'http';

const REQUIRED_SYSTEM_PREFIXES = Object.freeze(['admin', 'online']);

function normalizePrefix(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

function buildProductionHost(prefix) {
  const normalized = normalizePrefix(prefix);
  if (!normalized) {
    return PRODUCTION_ROOT_DOMAIN;
  }
  return `${normalized}.${PRODUCTION_ROOT_DOMAIN}`;
}

function buildProductionUrl(prefix) {
  return `${PRODUCTION_PROTOCOL}://${buildProductionHost(prefix)}`;
}

function buildLocalPreviewHost(prefix) {
  return LOCAL_PREVIEW_BASE_HOST;
}

function buildLocalPreviewUrl(prefix) {
  const base = `${LOCAL_PREVIEW_PROTOCOL}://${buildLocalPreviewHost(prefix)}`;
  const normalized = normalizePrefix(prefix);
  if (!normalized) {
    return base;
  }

  try {
    const url = new URL(base);
    url.searchParams.set('store', normalized);
    return url.toString();
  } catch {
    return `${base}/?store=${encodeURIComponent(normalized)}`;
  }
}

function resolveStorePrefix(store = {}) {
  return normalizePrefix(store.domain_prefix || store.subdomain || '');
}

function buildStoreDomainPreview(store = {}) {
  const prefix = resolveStorePrefix(store);
  return {
    production_root_domain: PRODUCTION_ROOT_DOMAIN,
    production_host: buildProductionHost(prefix),
    production_url: buildProductionUrl(prefix),
    local_preview_host: buildLocalPreviewHost(prefix),
    local_preview_url: buildLocalPreviewUrl(prefix),
    domain_prefix: prefix || null,
  };
}

function buildDomainConfigSnapshot() {
  const required_hosts = Object.fromEntries(
    REQUIRED_SYSTEM_PREFIXES.map((prefix) => [prefix, buildProductionHost(prefix)])
  );

  return {
    production_root_domain: PRODUCTION_ROOT_DOMAIN,
    production_protocol: PRODUCTION_PROTOCOL,
    local_preview_base_host: LOCAL_PREVIEW_BASE_HOST,
    local_preview_protocol: LOCAL_PREVIEW_PROTOCOL,
    required_hosts,
    dynamic_pattern: `{domain_prefix}.${PRODUCTION_ROOT_DOMAIN}`,
    future_example: buildProductionHost('huofenghuang'),
    local_testing_pattern: `${LOCAL_PREVIEW_PROTOCOL}://${LOCAL_PREVIEW_BASE_HOST}/?store={domain_prefix}`,
    local_testing_example: buildLocalPreviewUrl('huofenghuang'),
    source_resolution_priority: {
      production: ['req.headers.host', 'req.body.store_key', 'req.query.store'],
      local: ['req.body.store_key', 'req.query.store', 'req.headers.host'],
      note: 'admin host is reserved and will not be treated as store source',
    },
    local_testing_enabled: true,
  };
}

module.exports = {
  PRODUCTION_ROOT_DOMAIN,
  PRODUCTION_PROTOCOL,
  LOCAL_PREVIEW_BASE_HOST,
  LOCAL_PREVIEW_PROTOCOL,
  REQUIRED_SYSTEM_PREFIXES,
  normalizePrefix,
  buildProductionHost,
  buildProductionUrl,
  buildLocalPreviewHost,
  buildLocalPreviewUrl,
  buildStoreDomainPreview,
  buildDomainConfigSnapshot,
};

const DEFAULT_API_BASE_URL = '/api'
const ABSOLUTE_REQUEST_URL_RE = /^[a-z][a-z\d+\-.]*:\/\//i
const PROTOCOL_RELATIVE_URL_RE = /^\/\//

function trimTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '')
}

function ensureLeadingSlash(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.startsWith('/') ? text : `/${text}`
}

export function resolveApiBaseUrl() {
  const raw = String(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).trim()
  if (!raw) return DEFAULT_API_BASE_URL

  const normalized = trimTrailingSlashes(raw)
  return normalized || DEFAULT_API_BASE_URL
}

export function resolveApiConfig() {
  const baseURL = resolveApiBaseUrl()

  if (baseURL.startsWith('/')) {
    return {
      baseURL,
      axiosBaseURL: '',
      apiBasePath: baseURL
    }
  }

  try {
    const parsed = new URL(baseURL)
    return {
      baseURL,
      axiosBaseURL: parsed.origin,
      apiBasePath: trimTrailingSlashes(parsed.pathname || '')
    }
  } catch {
    return {
      baseURL: DEFAULT_API_BASE_URL,
      axiosBaseURL: '',
      apiBasePath: DEFAULT_API_BASE_URL
    }
  }
}

export function isAbsoluteRequestUrl(url) {
  const value = String(url || '').trim()
  return ABSOLUTE_REQUEST_URL_RE.test(value) || PROTOCOL_RELATIVE_URL_RE.test(value)
}

export function resolveApiRequestUrl(url, apiConfig = resolveApiConfig()) {
  const value = String(url || '').trim()
  if (!value) return value
  if (isAbsoluteRequestUrl(value)) return value

  const normalized = ensureLeadingSlash(value)
  const apiBasePath = trimTrailingSlashes(apiConfig?.apiBasePath || '')
  if (!apiBasePath) return normalized
  if (normalized === apiBasePath || normalized.startsWith(`${apiBasePath}/`)) return normalized
  return `${apiBasePath}${normalized}`
}

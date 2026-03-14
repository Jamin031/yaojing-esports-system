import axios from 'axios'

function resolveApiBaseUrl() {
  const raw = String(import.meta.env.VITE_API_BASE_URL || '').trim()
  if (raw) {
    return raw.replace(/\/+$/, '')
  }

  return import.meta.env.PROD ? '/api' : 'http://localhost:3000/api'
}

function resolveBasePath(baseUrl) {
  const raw = String(baseUrl || '').trim()
  if (!raw) return ''

  if (raw.startsWith('/')) {
    return raw.replace(/\/+$/, '')
  }

  try {
    const parsed = new URL(raw)
    return String(parsed.pathname || '').replace(/\/+$/, '')
  } catch {
    return ''
  }
}

const apiBaseUrl = resolveApiBaseUrl()
const apiBasePath = resolveBasePath(apiBaseUrl)

function normalizeRequestUrl(url) {
  const value = String(url || '').trim()
  if (!value) return value
  if (!apiBasePath || !value.startsWith('/')) return value
  if (value === apiBasePath) return '/'
  if (!value.startsWith(`${apiBasePath}/`)) return value
  return value.slice(apiBasePath.length) || '/'
}

const request = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000
})

const shouldAttachToken = (config) =>
  config?.requiresAuth === true || config?.meta?.requiresAuth === true

request.interceptors.request.use(
  (config) => {
    if (typeof config.url === 'string') {
      config.url = normalizeRequestUrl(config.url)
    }

    if (!shouldAttachToken(config)) {
      return config
    }

    const token = localStorage.getItem('token')
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && shouldAttachToken(error?.config)) {
      localStorage.removeItem('token')
    }
    return Promise.reject(error)
  }
)

export default request

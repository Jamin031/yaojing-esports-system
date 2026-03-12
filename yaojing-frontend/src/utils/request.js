import axios from 'axios'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim() || 'http://localhost:3000'

const request = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000
})

const shouldAttachToken = (config) =>
  config?.requiresAuth === true || config?.meta?.requiresAuth === true

request.interceptors.request.use(
  (config) => {
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

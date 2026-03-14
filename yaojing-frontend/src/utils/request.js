import axios from 'axios'
import { resolveApiConfig, resolveApiRequestUrl } from './apiBase'

const API_CONFIG = resolveApiConfig()

const request = axios.create({
  baseURL: API_CONFIG.axiosBaseURL,
  timeout: 15000
})

const shouldAttachToken = (config) =>
  config?.requiresAuth === true || config?.meta?.requiresAuth === true

request.interceptors.request.use(
  (config) => {
    if (typeof config.url === 'string') {
      config.url = resolveApiRequestUrl(config.url, API_CONFIG)
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

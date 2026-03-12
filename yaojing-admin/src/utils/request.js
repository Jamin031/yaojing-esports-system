import axios from 'axios';
import { ElMessage } from 'element-plus';
import { clearRolePermissionTemplateCache } from './permissionTemplateCache';
import { clearAuthCache, getToken } from './token';
import {
  isManualLogoutInProgress,
  markUnauthorizedHandled,
  registerPendingRequestController,
  unregisterPendingRequestController,
} from './authFlow';

function resolveApiBaseURL() {
  const raw = String(import.meta.env.VITE_API_BASE_URL || '/api').trim();
  if (!raw) return '/api';
  return raw.replace(/\/+$/, '');
}

function resolveBasePath(baseURL) {
  const raw = String(baseURL || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/')) {
    return raw.replace(/\/+$/, '');
  }

  try {
    const parsed = new URL(raw);
    return String(parsed.pathname || '').replace(/\/+$/, '');
  } catch {
    return '';
  }
}

const API_BASE_URL = resolveApiBaseURL();
const API_BASE_PATH = resolveBasePath(API_BASE_URL);

function normalizeRequestUrl(url) {
  const value = String(url || '').trim();
  if (!value) return value;
  if (!API_BASE_PATH || !value.startsWith('/')) return value;
  if (value === API_BASE_PATH) return '/';
  if (!value.startsWith(`${API_BASE_PATH}/`)) return value;
  return value.slice(API_BASE_PATH.length) || '/';
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function resolveLoginErrorMessage(rawMessage) {
  const message = normalizeText(rawMessage);
  if (!message) return '账号或密码错误';
  if (
    message.includes('账号或密码错误') ||
    message.includes('user not found') ||
    message.includes('账号不存在') ||
    message.includes('用户不存在') ||
    message.includes('password') ||
    message.includes('密码错误') ||
    message.includes('invalid credentials')
  ) {
    return '账号或密码错误';
  }
  return '账号或密码错误';
}

const request = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

function attachAbortController(config) {
  if (config?.signal) return;
  const controller = new AbortController();
  config.signal = controller.signal;
  config.__abortController = controller;
  registerPendingRequestController(controller);
}

function cleanupAbortController(config) {
  const controller = config?.__abortController;
  if (!controller) return;
  unregisterPendingRequestController(controller);
  delete config.__abortController;
}

request.interceptors.request.use(
  (config) => {
    if (typeof config.url === 'string') {
      config.url = normalizeRequestUrl(config.url);
    }
    attachAbortController(config);
    config.headers = config.headers || {};
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const method = String(config.method || 'get').toLowerCase();
    if (method === 'get') {
      config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      config.headers.Pragma = 'no-cache';
      config.headers.Expires = '0';
    }
    return config;
  },
  (error) => Promise.reject(error),
);

request.interceptors.response.use(
  (response) => {
    cleanupAbortController(response?.config);
    return response.data;
  },
  (error) => {
    cleanupAbortController(error?.config);

    const canceled = error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';
    if (canceled) {
      return Promise.reject(error);
    }

    const status = error?.response?.status;
    const message = error?.response?.data?.message || '请求失败，请稍后重试';
    const requestUrl = normalizeText(error?.config?.url);
    const isLoginApi = requestUrl.includes('/auth/login');

    if (status === 401) {
      if (isLoginApi) {
        ElMessage.error(resolveLoginErrorMessage(message));
        return Promise.reject(error);
      }

      if (isManualLogoutInProgress()) {
        return Promise.reject(error);
      }

      if (markUnauthorizedHandled()) {
        clearAuthCache();
        clearRolePermissionTemplateCache();
        ElMessage.error('登录态已失效，请重新登录');
        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }
      }
    } else if (status === 403) {
      ElMessage.error('权限不足');
    } else {
      ElMessage.error(message);
    }

    return Promise.reject(error);
  },
);

export default request;

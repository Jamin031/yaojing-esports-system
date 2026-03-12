import request from '../utils/request';
import axios from 'axios';
import { isApiSuccess } from '../utils/api';
import { getToken } from '../utils/token';

function resolveApiBaseURL() {
  const raw = String(import.meta.env.VITE_API_BASE_URL || '/api').trim();
  if (!raw) return '/api';
  return raw.replace(/\/+$/, '');
}

const silentRequest = axios.create({
  baseURL: resolveApiBaseURL(),
  timeout: 12000,
});

silentRequest.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function requestSilently(config) {
  try {
    const resp = await silentRequest(config);
    const payload = resp?.data;
    if (isApiSuccess(payload)) {
      return payload;
    }
  } catch {
    // read-state sync is best-effort
  }
  return null;
}

function normalizeOrderId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function normalizeNotificationId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function buildReadPayload(orderId, notificationId) {
  const normalizedOrderId = normalizeOrderId(orderId);
  const normalizedNotificationId = normalizeNotificationId(notificationId);
  if (!normalizedOrderId && !normalizedNotificationId) return null;

  const payload = {};
  if (normalizedOrderId) {
    payload.order_id = normalizedOrderId;
  }
  if (normalizedNotificationId) {
    payload.notification_id = normalizedNotificationId;
  }
  return payload;
}

async function markReadSilently(orderId, notificationId) {
  const readPayload = buildReadPayload(orderId, notificationId);
  if (!readPayload) return false;

  const payload = await requestSilently({
    url: '/notifications/read',
    method: 'post',
    data: readPayload,
  });

  return Boolean(payload);
}

export function getOrderNotificationsApi(params) {
  return request({
    url: '/notifications/orders',
    method: 'get',
    params,
  });
}

export function markOrderNotificationReadApi(payload = {}) {
  const orderId = payload.order_id ?? payload.orderId ?? null;
  const notificationId = payload.notification_id ?? payload.notificationId ?? payload.notify_id ?? payload.notifyId ?? payload.id ?? null;
  return markReadSilently(orderId, notificationId);
}

export async function markAllOrderNotificationsReadApi(payload = {}) {
  const orderIds = [
    ...(Array.isArray(payload.order_ids) ? payload.order_ids : []),
    ...(Array.isArray(payload.orderIds) ? payload.orderIds : []),
  ];
  const notificationIds = [
    ...(Array.isArray(payload.notification_ids) ? payload.notification_ids : []),
    ...(Array.isArray(payload.notificationIds) ? payload.notificationIds : []),
    ...(Array.isArray(payload.notify_ids) ? payload.notify_ids : []),
    ...(Array.isArray(payload.notifyIds) ? payload.notifyIds : []),
  ];

  const normalizedIds = [...new Set(orderIds.map(normalizeOrderId).filter(Boolean))];
  const normalizedNotificationIds = [...new Set(notificationIds.map(normalizeNotificationId).filter(Boolean))];
  const total = Math.max(normalizedIds.length, normalizedNotificationIds.length);

  if (!total) {
    return { successCount: 0, total: 0 };
  }

  const tasks = [];
  const maxLen = total;
  for (let index = 0; index < maxLen; index += 1) {
    tasks.push(markReadSilently(normalizedIds[index] || null, normalizedNotificationIds[index] || null));
  }

  const results = await Promise.allSettled(tasks);
  const successCount = results.filter((item) => item.status === 'fulfilled' && item.value).length;

  return {
    successCount,
    total,
  };
}

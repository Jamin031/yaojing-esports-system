import request from '../utils/request';

export function getDevicesApi(params) {
  return request({
    url: '/api/devices',
    method: 'get',
    params,
  });
}

export function getDeviceSourcesApi() {
  return request({
    url: '/api/devices/sources',
    method: 'get',
  });
}

export function blockDeviceApi(deviceId, data) {
  return request({
    url: `/api/devices/${encodeURIComponent(deviceId)}/block`,
    method: 'post',
    data,
  });
}

export function unblockDeviceApi(deviceId, data = {}) {
  return request({
    url: `/api/devices/${encodeURIComponent(deviceId)}/unblock`,
    method: 'post',
    data,
  });
}

export function getDeviceLogsApi(deviceId, params) {
  return request({
    url: `/api/devices/${encodeURIComponent(deviceId)}/logs`,
    method: 'get',
    params,
  });
}

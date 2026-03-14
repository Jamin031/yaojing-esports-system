import request from '../utils/request';

export function getUsersApi(params) {
  return request({
    url: '/api/users',
    method: 'get',
    params,
  });
}

export function createUserApi(data) {
  return request({
    url: '/api/users',
    method: 'post',
    data,
  });
}

export function resetPasswordApi(userId, password) {
  return request({
    url: `/api/users/${userId}/reset-password`,
    method: 'patch',
    data: { password },
  });
}

export function deleteUserApi(userId) {
  return request({
    url: `/api/users/${userId}`,
    method: 'delete',
  });
}

export function updateUserApi(userId, data) {
  return request({
    url: `/api/users/${userId}`,
    method: 'patch',
    data,
  });
}

export function updateUserNameApi(userId, name) {
  return request({
    url: `/api/users/${userId}/name`,
    method: 'put',
    data: { name },
  });
}

export function updateUserStatusApi(userId, status) {
  return request({
    url: `/api/users/${userId}/status`,
    method: 'put',
    data: { status },
  });
}

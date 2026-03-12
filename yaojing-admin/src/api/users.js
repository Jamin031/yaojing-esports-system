import request from '../utils/request';

export function getUsersApi(params) {
  return request({
    url: '/users',
    method: 'get',
    params,
  });
}

export function createUserApi(data) {
  return request({
    url: '/users',
    method: 'post',
    data,
  });
}

export function resetPasswordApi(userId, password) {
  return request({
    url: `/users/${userId}/reset-password`,
    method: 'patch',
    data: { password },
  });
}

export function deleteUserApi(userId) {
  return request({
    url: `/users/${userId}`,
    method: 'delete',
  });
}

export function updateUserApi(userId, data) {
  return request({
    url: `/users/${userId}`,
    method: 'patch',
    data,
  });
}

export function updateUserNameApi(userId, name) {
  return request({
    url: `/users/${userId}/name`,
    method: 'put',
    data: { name },
  });
}

export function updateUserStatusApi(userId, status) {
  return request({
    url: `/users/${userId}/status`,
    method: 'put',
    data: { status },
  });
}

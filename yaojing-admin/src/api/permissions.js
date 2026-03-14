import request from '../utils/request';

export function getPermissionSchemasApi() {
  return request({
    url: '/api/permissions/schemas',
    method: 'get',
  });
}

export function getUsersWithPermissionsApi(params) {
  return request({
    url: '/api/permissions/users',
    method: 'get',
    params,
  });
}

export function updateUserPermissionsApi(userId, data) {
  return request({
    url: `/api/permissions/users/${userId}`,
    method: 'put',
    data,
  });
}

export function getRolePermissionTemplatesApi() {
  return request({
    url: '/api/permissions/templates',
    method: 'get',
  });
}

export function updateRolePermissionTemplateApi(role, data) {
  const roleKey = String(role || '').trim().toLowerCase();
  return request({
    url: `/api/permissions/templates/${roleKey}`,
    method: 'put',
    data,
  });
}

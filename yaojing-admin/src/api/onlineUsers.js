import request from '../utils/request';

export function getOnlineUsersApi(params) {
  return request({
    url: '/api/online-users',
    method: 'get',
    params,
  });
}

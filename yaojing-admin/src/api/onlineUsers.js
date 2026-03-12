import request from '../utils/request';

export function getOnlineUsersApi(params) {
  return request({
    url: '/online-users',
    method: 'get',
    params,
  });
}

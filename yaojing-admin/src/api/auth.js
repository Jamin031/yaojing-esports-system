import request from '../utils/request';

export function loginApi(payload) {
  return request({
    url: '/auth/login',
    method: 'post',
    data: {
      username: payload.username,
      password: payload.password,
    },
  });
}

export function getProfileApi() {
  return request({
    url: '/auth/profile',
    method: 'get',
  });
}

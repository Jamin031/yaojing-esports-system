import request from '../utils/request';

const LOGIN_API_URL = '/api/auth/login';
const PROFILE_API_URL = '/api/auth/profile';

export function loginApi(payload) {
  return request({
    url: LOGIN_API_URL,
    method: 'post',
    data: {
      username: payload.username,
      password: payload.password,
    },
  });
}

export function getProfileApi() {
  return request({
    url: PROFILE_API_URL,
    method: 'get',
  });
}

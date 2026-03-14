import request from '../utils/request';

export function getStoreDataApi(params) {
  return request({
    url: '/api/store-data',
    method: 'get',
    params,
  });
}

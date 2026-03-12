import request from '../utils/request';

export function getStoreDataApi(params) {
  return request({
    url: '/store-data',
    method: 'get',
    params,
  });
}

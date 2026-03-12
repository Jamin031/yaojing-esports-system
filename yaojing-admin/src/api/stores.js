import request from '../utils/request';

export function getStoresApi(params) {
  return request({
    url: '/stores',
    method: 'get',
    params,
  });
}

export function createStoreApi(data) {
  return request({
    url: '/stores',
    method: 'post',
    data,
  });
}

export function updateStoreApi(storeId, data) {
  return request({
    url: `/stores/${storeId}`,
    method: 'put',
    data,
  });
}

export function deleteStoreApi(storeId) {
  return request({
    url: `/stores/${storeId}`,
    method: 'delete',
  });
}

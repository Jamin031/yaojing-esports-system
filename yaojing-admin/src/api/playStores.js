import request from '../utils/request';

export function getPlayStoresApi(params) {
  return request({
    url: '/play-stores',
    method: 'get',
    params,
  });
}

export function createPlayStoreApi(data) {
  return request({
    url: '/play-stores',
    method: 'post',
    data,
  });
}

export function updatePlayStoreApi(id, data) {
  return request({
    url: `/play-stores/${id}`,
    method: 'put',
    data,
  });
}

export function deletePlayStoreApi(id) {
  return request({
    url: `/play-stores/${id}`,
    method: 'delete',
  });
}

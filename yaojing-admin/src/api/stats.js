import request from '../utils/request';

export function getStatsApi(params) {
  return request({
    url: '/api/stats/overview',
    method: 'get',
    params,
  });
}

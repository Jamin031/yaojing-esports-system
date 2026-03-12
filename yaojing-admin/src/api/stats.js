import request from '../utils/request';

export function getStatsApi(params) {
  return request({
    url: '/stats/overview',
    method: 'get',
    params,
  });
}

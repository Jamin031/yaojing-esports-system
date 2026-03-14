import request from '../utils/request';

export function getOperationLogsApi(params) {
  return request({
    url: '/api/operation-logs',
    method: 'get',
    params,
  });
}

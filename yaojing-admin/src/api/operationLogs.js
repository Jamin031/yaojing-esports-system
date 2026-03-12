import request from '../utils/request';

export function getOperationLogsApi(params) {
  return request({
    url: '/operation-logs',
    method: 'get',
    params,
  });
}

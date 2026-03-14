import request from '@/utils/request'

export const checkHealth = () => request.get('/api/health')

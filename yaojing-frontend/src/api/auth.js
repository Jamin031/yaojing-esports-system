import request from '@/utils/request'

export const login = async (payload) => {
  const res = await request.post('/api/login', payload)
  const token = res?.data?.token
  if (token) {
    localStorage.setItem('token', token)
  }
  return res
}

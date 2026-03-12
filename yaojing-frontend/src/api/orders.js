import request from '@/utils/request'

const orderApiPath = (import.meta.env.VITE_ORDER_API_PATH || '').trim() || '/api/orders'
const normalizedOrderApiPath = orderApiPath.replace(/\/$/, '')
const orderConfirmApiPath = `${normalizedOrderApiPath}/confirm`

export const getOrders = () => request.get(normalizedOrderApiPath, { requiresAuth: true })

export const getStats = () => request.get('/api/stats', { requiresAuth: true })

export const createOrder = (payload) => request.post(normalizedOrderApiPath, payload)

export const confirmOrder = (orderId) =>
  request.post(orderConfirmApiPath, { order_id: orderId }, { requiresAuth: true })

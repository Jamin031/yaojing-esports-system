import request from '@/utils/request'

const ORDERS_API_PATH = '/api/orders'
const ORDER_CONFIRM_API_PATH = '/api/orders/confirm'
const STATS_API_PATH = '/api/stats'

export const getOrders = () => request.get(ORDERS_API_PATH, { requiresAuth: true })

export const getStats = () => request.get(STATS_API_PATH, { requiresAuth: true })

export const createOrder = (payload) => request.post(ORDERS_API_PATH, payload)

export const confirmOrder = (orderId) =>
  request.post(ORDER_CONFIRM_API_PATH, { order_id: orderId }, { requiresAuth: true })

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/permissions');
const {
  listOrders,
  listGarbageOrders,
  getOrderById,
  getGarbageOrderDetail,
  createOrder,
  updateOrderStatus,
  markOrderAsGarbage,
  updateGarbageOrderReason,
  restoreGarbageOrderToNormal,
  batchUpdateOrderStatus,
  batchDeleteOrders,
  updateOrderAmount,
  updateOrderRemark,
  updateProblemOrder,
  completeProblemOrder,
  withdrawProblemOrder,
  confirmOrder,
  assignPlayShop,
  assignShop,
  recycleOrder,
  restoreOrder,
  permanentDeleteOrder,
  deleteOrder,
  updateOrderEffective,
} = require('../controllers/ordersController');

const router = express.Router();

// Required APIs
router.get('/', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'customer_service', 'finance'), asyncHandler(listOrders));
router.get('/garbage', requireAuth, requireRoles('super_admin', 'admin', 'customer_service'), asyncHandler(listGarbageOrders));
router.get('/garbage/:id', requireAuth, requireRoles('super_admin', 'admin', 'customer_service'), asyncHandler(getGarbageOrderDetail));
router.get('/:id', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'customer_service', 'finance'), asyncHandler(getOrderById));
router.post('/', optionalAuth, asyncHandler(createOrder));
router.post('/batch-delete', requireAuth, asyncHandler(batchDeleteOrders));
router.patch('/batch-status', requireAuth, asyncHandler(batchUpdateOrderStatus));
router.post('/:id/mark-garbage', requireAuth, requireRoles('super_admin', 'admin', 'customer_service'), asyncHandler(markOrderAsGarbage));
router.patch('/:id/mark-garbage', requireAuth, requireRoles('super_admin', 'admin', 'customer_service'), asyncHandler(markOrderAsGarbage));
router.patch('/:id/garbage-reason', requireAuth, requireRoles('super_admin', 'admin', 'customer_service'), asyncHandler(updateGarbageOrderReason));
router.patch('/:id/restore-normal', requireAuth, requireRoles('super_admin', 'admin', 'customer_service'), asyncHandler(restoreGarbageOrderToNormal));

router.put('/:id/status', requireAuth, asyncHandler(updateOrderStatus));
router.patch('/:id/status', requireAuth, asyncHandler(updateOrderStatus));
router.put('/:id/remark', requireAuth, asyncHandler(updateOrderRemark));
router.patch('/:id/remark', requireAuth, asyncHandler(updateOrderRemark));
router.put('/:id/amount', requireAuth, asyncHandler(updateOrderAmount));
router.put('/:id/problem', requireAuth, asyncHandler(updateProblemOrder));
router.patch('/:id/problem', requireAuth, asyncHandler(updateProblemOrder));
router.patch('/:id/problem/complete', requireAuth, asyncHandler(completeProblemOrder));
router.patch('/:id/problem/withdraw', requireAuth, asyncHandler(withdrawProblemOrder));
router.post('/:id/delete', requireAuth, asyncHandler(deleteOrder));
router.post('/:id/restore', requireAuth, asyncHandler(restoreOrder));

// Compatibility APIs
router.post('/admin', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(createOrder));
router.post('/:id/confirm', requireAuth, asyncHandler(confirmOrder));
router.put('/:id/assign-shop', requireAuth, asyncHandler(assignShop));
router.put('/:id/assign-play-shop', requireAuth, asyncHandler(assignPlayShop));
router.patch('/:id/assign-play-shop', requireAuth, asyncHandler(assignPlayShop));
router.patch('/:id/assign-play-store', requireAuth, asyncHandler(assignPlayShop));
router.post('/:id/recycle', requireAuth, asyncHandler(recycleOrder));
router.patch('/:id/effective', requireAuth, asyncHandler(updateOrderEffective));
router.delete('/:id/permanent', requireAuth, asyncHandler(permanentDeleteOrder));
router.delete('/:id', requireAuth, asyncHandler(deleteOrder));
router.patch('/:id/restore', requireAuth, asyncHandler(restoreOrder));

module.exports = router;

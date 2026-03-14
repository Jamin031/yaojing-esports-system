const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/permissions');
const {
  listNotifications,
  markNotificationsRead,
  listOrderNotifications,
} = require('../controllers/notificationsController');

const router = express.Router();

router.get('/', requireAuth, requireRoles('super_admin', 'admin', 'customer_service', 'store_owner'), asyncHandler(listNotifications));
router.get('/orders', requireAuth, requireRoles('super_admin', 'admin', 'customer_service', 'store_owner'), asyncHandler(listOrderNotifications));
router.post('/read', requireAuth, requireRoles('super_admin', 'admin', 'customer_service', 'store_owner'), asyncHandler(markNotificationsRead));
router.patch('/read', requireAuth, requireRoles('super_admin', 'admin', 'customer_service', 'store_owner'), asyncHandler(markNotificationsRead));
router.post('/orders/read', requireAuth, requireRoles('super_admin', 'admin', 'customer_service', 'store_owner'), asyncHandler(markNotificationsRead));
router.patch('/orders/read', requireAuth, requireRoles('super_admin', 'admin', 'customer_service', 'store_owner'), asyncHandler(markNotificationsRead));
router.post('/orders/read-all', requireAuth, requireRoles('super_admin', 'admin', 'customer_service', 'store_owner'), asyncHandler(markNotificationsRead));
router.patch('/orders/read-all', requireAuth, requireRoles('super_admin', 'admin', 'customer_service', 'store_owner'), asyncHandler(markNotificationsRead));

module.exports = router;

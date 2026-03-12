const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/permissions');
const { listOnlineOrders, createOnlineOrder } = require('../controllers/onlineOrdersController');

const router = express.Router();

router.get('/', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'customer_service', 'finance'), asyncHandler(listOnlineOrders));
router.post('/', optionalAuth, asyncHandler(createOnlineOrder));

module.exports = router;

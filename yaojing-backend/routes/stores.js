const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireSuperAdmin, requireRoles } = require('../middleware/permissions');
const {
  getDomainConfig,
  listStores,
  createStore,
  updateStore,
  updateStoreDomain,
  deleteStore,
} = require('../controllers/storesController');

const router = express.Router();

router.get('/domain-config', requireAuth, requireRoles('super_admin', 'admin', 'store_owner'), asyncHandler(getDomainConfig));
router.get('/', requireAuth, requireRoles('super_admin', 'admin', 'store_owner'), asyncHandler(listStores));
router.post('/', requireAuth, requireSuperAdmin, asyncHandler(createStore));
router.put('/:id', requireAuth, requireSuperAdmin, asyncHandler(updateStore));
router.put('/:id/domain', requireAuth, requireSuperAdmin, asyncHandler(updateStoreDomain));
router.delete('/:id', requireAuth, requireSuperAdmin, asyncHandler(deleteStore));

module.exports = router;

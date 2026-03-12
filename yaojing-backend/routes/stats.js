const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/permissions');
const {
  getOverview,
  getPeakHours,
  getStoreRanking,
  getPlayShopUtilization,
  getOnlineVsOffline,
} = require('../controllers/statsController');

const router = express.Router();

router.get('/overview', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'finance'), asyncHandler(getOverview));
router.get('/peak-hours', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'finance'), asyncHandler(getPeakHours));
router.get('/store-ranking', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'finance'), asyncHandler(getStoreRanking));
router.get('/play-shop-utilization', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'finance'), asyncHandler(getPlayShopUtilization));
router.get('/online-vs-offline', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'finance'), asyncHandler(getOnlineVsOffline));

module.exports = router;

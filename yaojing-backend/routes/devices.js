const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const {
  blockDeviceProfile,
  getDeviceOperationLogs,
  getDeviceProfile,
  getDeviceSourceOptions,
  listDeviceProfiles,
  unblockDeviceProfile,
} = require('../controllers/devicesController');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(listDeviceProfiles));
router.get('/sources', requireAuth, asyncHandler(getDeviceSourceOptions));
router.get('/:deviceId', requireAuth, asyncHandler(getDeviceProfile));
router.get('/:deviceId/logs', requireAuth, asyncHandler(getDeviceOperationLogs));
router.post('/:deviceId/block', requireAuth, asyncHandler(blockDeviceProfile));
router.post('/:deviceId/unblock', requireAuth, asyncHandler(unblockDeviceProfile));

module.exports = router;

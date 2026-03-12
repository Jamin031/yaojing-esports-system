const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/permissions');
const { listStoreData } = require('../controllers/storeDataController');

const router = express.Router();

router.get('/', requireAuth, requireRoles('super_admin', 'admin', 'store_owner', 'finance'), asyncHandler(listStoreData));

module.exports = router;

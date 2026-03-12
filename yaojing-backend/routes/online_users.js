const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/permissions');
const { listOnlineUsers } = require('../controllers/onlineUsersController');

const router = express.Router();

router.get('/', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(listOnlineUsers));

module.exports = router;

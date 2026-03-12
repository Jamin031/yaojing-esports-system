const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { listLogs } = require('../controllers/logsController');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(listLogs));

module.exports = router;

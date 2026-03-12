const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { login, profile } = require('../controllers/authController');

const router = express.Router();

router.post('/login', asyncHandler(login));
router.get('/profile', requireAuth, asyncHandler(profile));

module.exports = router;

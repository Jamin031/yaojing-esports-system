const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRoles } = require('../middleware/permissions');
const {
  listPlayShops,
  createPlayShop,
  updatePlayShop,
  deletePlayShop,
} = require('../controllers/playShopsController');

const router = express.Router();

router.get('/', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(listPlayShops));
router.post('/', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(createPlayShop));
router.put('/:id', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(updatePlayShop));
router.delete('/:id', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(deletePlayShop));

module.exports = router;

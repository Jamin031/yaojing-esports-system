const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRoles, requireSuperAdmin } = require('../middleware/permissions');
const {
  listUsers,
  createUser,
  updateUserName,
  updateUserPermissions,
  updateUserStatus,
  updateUserPassword,
  deleteUser,
} = require('../controllers/usersController');

const router = express.Router();

router.get('/', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(listUsers));
router.post('/', requireAuth, requireSuperAdmin, asyncHandler(createUser));
router.put('/:id/name', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(updateUserName));
router.put('/:id/permissions', requireAuth, requireSuperAdmin, asyncHandler(updateUserPermissions));
router.put('/:id/status', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(updateUserStatus));
router.put('/:id/password', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(updateUserPassword));
router.patch('/:id/reset-password', requireAuth, requireRoles('super_admin', 'admin'), asyncHandler(updateUserPassword));
router.delete('/:id', requireAuth, requireSuperAdmin, asyncHandler(deleteUser));

module.exports = router;

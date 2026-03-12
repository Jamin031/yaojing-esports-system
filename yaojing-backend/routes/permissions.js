const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/permissions');
const {
  getPermissionSchemas,
  listRoleTemplates,
  updateRoleTemplate,
  listUsersWithPermissions,
  getUserPermissionById,
  updateUserPermissions,
} = require('../controllers/permissionsController');

const router = express.Router();

router.get('/schemas', requireAuth, requireSuperAdmin, asyncHandler(getPermissionSchemas));
router.get('/templates', requireAuth, requireSuperAdmin, asyncHandler(listRoleTemplates));
router.get('/role-templates', requireAuth, requireSuperAdmin, asyncHandler(listRoleTemplates));
router.put('/templates/:role', requireAuth, requireSuperAdmin, asyncHandler(updateRoleTemplate));
router.put('/role-templates/:role', requireAuth, requireSuperAdmin, asyncHandler(updateRoleTemplate));
router.post('/templates/:role', requireAuth, requireSuperAdmin, asyncHandler(updateRoleTemplate));
router.post('/role-templates/:role', requireAuth, requireSuperAdmin, asyncHandler(updateRoleTemplate));
router.get('/users', requireAuth, requireSuperAdmin, asyncHandler(listUsersWithPermissions));
router.get('/users/:id', requireAuth, requireSuperAdmin, asyncHandler(getUserPermissionById));
router.get('/users/:id/permissions', requireAuth, requireSuperAdmin, asyncHandler(getUserPermissionById));
router.put('/users/:id', requireAuth, requireSuperAdmin, asyncHandler(updateUserPermissions));
router.put('/users/:id/permissions', requireAuth, requireSuperAdmin, asyncHandler(updateUserPermissions));
router.patch('/users/:id', requireAuth, requireSuperAdmin, asyncHandler(updateUserPermissions));
router.patch('/users/:id/permissions', requireAuth, requireSuperAdmin, asyncHandler(updateUserPermissions));
router.post('/users/:id', requireAuth, requireSuperAdmin, asyncHandler(updateUserPermissions));
router.post('/users/:id/permissions', requireAuth, requireSuperAdmin, asyncHandler(updateUserPermissions));

module.exports = router;

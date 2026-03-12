import { Router } from "express";
import { getOverviewController } from "../controllers/statsController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/overview",
  requireAuth,
  requireRole("super_admin", "store_owner"),
  asyncHandler(getOverviewController)
);

export default router;


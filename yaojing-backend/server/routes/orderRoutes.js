import { Router } from "express";
import { body, param } from "express-validator";
import {
  createOrderController,
  listOrdersController,
  confirmOrderController,
  completeOrderController
} from "../controllers/orderController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { resolveStoreBySubdomain } from "../middleware/storeResolver.js";
import { handleValidation } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/",
  resolveStoreBySubdomain,
  body("package_id").isInt({ min: 1 }).withMessage("package_id is required"),
  body("player_id").optional().isInt({ min: 1 }).withMessage("player_id invalid"),
  body("customer_contact").trim().notEmpty().withMessage("customer_contact is required"),
  handleValidation,
  asyncHandler(createOrderController)
);

router.get(
  "/",
  requireAuth,
  requireRole("super_admin", "admin", "store_owner"),
  asyncHandler(listOrdersController)
);

router.put(
  "/:id/confirm",
  requireAuth,
  requireRole("super_admin", "admin"),
  param("id").isInt({ min: 1 }).withMessage("id invalid"),
  handleValidation,
  asyncHandler(confirmOrderController)
);

router.put(
  "/:id/complete",
  requireAuth,
  requireRole("super_admin", "admin"),
  param("id").isInt({ min: 1 }).withMessage("id invalid"),
  handleValidation,
  asyncHandler(completeOrderController)
);

export default router;


import { Router } from "express";
import { body, param } from "express-validator";
import {
  createStoreController,
  listStoresController,
  updateStoreController
} from "../controllers/storeController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { handleValidation } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth, requireRole("super_admin"));

router.post(
  "/",
  body("name").trim().notEmpty().withMessage("name is required"),
  body("subdomain").trim().isLength({ min: 2 }).withMessage("subdomain is required"),
  body("commission_rate")
    .isFloat({ min: 0.03, max: 0.05 })
    .withMessage("commission_rate must be between 0.03 and 0.05"),
  handleValidation,
  asyncHandler(createStoreController)
);

router.get("/", asyncHandler(listStoresController));

router.put(
  "/:id",
  param("id").isInt({ min: 1 }).withMessage("id invalid"),
  body("name").trim().notEmpty().withMessage("name is required"),
  body("subdomain").trim().isLength({ min: 2 }).withMessage("subdomain is required"),
  body("commission_rate")
    .isFloat({ min: 0.03, max: 0.05 })
    .withMessage("commission_rate must be between 0.03 and 0.05"),
  handleValidation,
  asyncHandler(updateStoreController)
);

export default router;


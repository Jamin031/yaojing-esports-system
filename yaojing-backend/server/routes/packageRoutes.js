import { Router } from "express";
import { body, param } from "express-validator";
import {
  listPackagesController,
  createPackageController,
  updatePackageController,
  deletePackageController
} from "../controllers/packageController.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { resolveStoreBySubdomain } from "../middleware/storeResolver.js";
import { handleValidation } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", optionalAuth, async (req, res, next) => {
  if (req.user) {
    return requireRole("super_admin", "admin", "store_owner")(req, res, next);
  }
  return resolveStoreBySubdomain(req, res, next);
}, asyncHandler(listPackagesController));

router.post(
  "/",
  requireAuth,
  requireRole("super_admin", "admin", "store_owner"),
  body("game_type").trim().notEmpty().withMessage("game_type is required"),
  body("service_type").isIn(["陪玩", "护航"]).withMessage("service_type invalid"),
  body("title").trim().notEmpty().withMessage("title is required"),
  body("price").isFloat({ min: 0 }).withMessage("price invalid"),
  body("duration").isInt({ min: 1 }).withMessage("duration invalid"),
  handleValidation,
  asyncHandler(createPackageController)
);

router.put(
  "/:id",
  requireAuth,
  requireRole("super_admin", "admin", "store_owner"),
  param("id").isInt({ min: 1 }).withMessage("id invalid"),
  body("game_type").trim().notEmpty().withMessage("game_type is required"),
  body("service_type").isIn(["陪玩", "护航"]).withMessage("service_type invalid"),
  body("title").trim().notEmpty().withMessage("title is required"),
  body("price").isFloat({ min: 0 }).withMessage("price invalid"),
  body("duration").isInt({ min: 1 }).withMessage("duration invalid"),
  body("status").isIn(["active", "inactive"]).withMessage("status invalid"),
  handleValidation,
  asyncHandler(updatePackageController)
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("super_admin", "admin", "store_owner"),
  param("id").isInt({ min: 1 }).withMessage("id invalid"),
  handleValidation,
  asyncHandler(deletePackageController)
);

export default router;

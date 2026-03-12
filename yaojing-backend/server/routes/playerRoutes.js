import { Router } from "express";
import { body, param } from "express-validator";
import {
  listPlayersController,
  createPlayerController,
  updatePlayerController,
  deletePlayerController
} from "../controllers/playerController.js";
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
}, asyncHandler(listPlayersController));

router.post(
  "/",
  requireAuth,
  requireRole("super_admin", "admin", "store_owner"),
  body("nickname").trim().notEmpty().withMessage("nickname is required"),
  body("gender").isIn(["male", "female", "other"]).withMessage("gender invalid"),
  body("game_type").trim().notEmpty().withMessage("game_type is required"),
  body("price_per_hour").isFloat({ min: 0 }).withMessage("price_per_hour invalid"),
  body("status").optional().isIn(["idle", "busy", "offline"]).withMessage("status invalid"),
  handleValidation,
  asyncHandler(createPlayerController)
);

router.put(
  "/:id",
  requireAuth,
  requireRole("super_admin", "admin", "store_owner"),
  param("id").isInt({ min: 1 }).withMessage("id invalid"),
  body("nickname").trim().notEmpty().withMessage("nickname is required"),
  body("gender").isIn(["male", "female", "other"]).withMessage("gender invalid"),
  body("game_type").trim().notEmpty().withMessage("game_type is required"),
  body("price_per_hour").isFloat({ min: 0 }).withMessage("price_per_hour invalid"),
  body("status").isIn(["idle", "busy", "offline"]).withMessage("status invalid"),
  handleValidation,
  asyncHandler(updatePlayerController)
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("super_admin", "admin", "store_owner"),
  param("id").isInt({ min: 1 }).withMessage("id invalid"),
  handleValidation,
  asyncHandler(deletePlayerController)
);

export default router;

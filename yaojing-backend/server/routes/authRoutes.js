import { Router } from "express";
import { body } from "express-validator";
import { loginController } from "../controllers/authController.js";
import { handleValidation } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/login",
  body("username").trim().notEmpty().withMessage("username is required"),
  body("password").trim().notEmpty().withMessage("password is required"),
  handleValidation,
  asyncHandler(loginController)
);

export default router;


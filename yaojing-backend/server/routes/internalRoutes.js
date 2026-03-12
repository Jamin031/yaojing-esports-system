import { Router } from "express";
import { body } from "express-validator";
import { internalOrderNotifyController } from "../controllers/notifyController.js";
import { handleValidation } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/order-notify",
  body("store_name").optional().isString(),
  body("amount").optional().isFloat({ min: 0 }),
  body("contact").optional().isString(),
  handleValidation,
  asyncHandler(internalOrderNotifyController)
);

export default router;


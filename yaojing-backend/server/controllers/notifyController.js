import { buildOrderNotifyPayload } from "../services/notifyService.js";
import { AppError } from "../utils/appError.js";

export async function internalOrderNotifyController(req, res) {
  const key = req.headers["x-internal-key"];
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    throw new AppError("Forbidden", 403);
  }

  const payload = buildOrderNotifyPayload({
    storeName: req.body.store_name || "网吧",
    amount: Number(req.body.amount || 0),
    contact: req.body.contact || ""
  });

  res.json({
    success: true,
    message: payload.title,
    amount: payload.amount,
    contact: payload.contact
  });
}


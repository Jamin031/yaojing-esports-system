import { AppError } from "../utils/appError.js";

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError("Forbidden", 403);
    }
    next();
  };
}

export function getScopedStoreId(req) {
  if (!req.user) {
    return null;
  }
  if (req.user.role === "store_owner") {
    return req.user.store_id;
  }
  return null;
}


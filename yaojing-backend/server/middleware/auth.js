import { verifyJwt } from "../utils/jwt.js";
import { AppError } from "../utils/appError.js";

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new AppError("Unauthorized", 401);
  }

  const payload = verifyJwt(token);
  req.user = payload;
  next();
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return next();
  }

  try {
    req.user = verifyJwt(token);
  } catch (_) {
    req.user = null;
  }
  next();
}


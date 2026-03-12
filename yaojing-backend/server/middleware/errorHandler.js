import { AppError } from "../utils/appError.js";

export function notFoundHandler(req, res, next) {
  next(new AppError("API endpoint not found", 404));
}

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";
  res.status(statusCode).json({
    success: false,
    message
  });
}


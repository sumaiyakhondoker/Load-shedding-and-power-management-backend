import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/AppError";

export const globalErrorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ success: false, message: error.message, errors: [] });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ success: false, message: "Invalid JSON body", errors: [] });
    return;
  }

  res.status(500).json({ success: false, message: "Internal server error", errors: [] });
};

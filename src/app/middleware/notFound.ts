import type { RequestHandler } from "express";
import { AppError } from "../utils/AppError";

export const notFound: RequestHandler = (req, res, next) => {
  next(new AppError(404, "Route not found"));
};

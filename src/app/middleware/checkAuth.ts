import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { UserRole } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
    }
  }
}

export const auth = (...allowedRoles: UserRole[]): RequestHandler => {
  return catchAsync(async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) {
      throw new AppError(401, "Authentication required");
    }

    if (!config.jwt_access_secret) {
      throw new Error("JWT access secret is missing");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt_access_secret);
    } catch {
      throw new AppError(401, "Invalid or expired token");
    }

    const userId = typeof decoded === "string" ? undefined : decoded.userId;
    if (typeof userId !== "string" || !z.uuid().safeParse(userId).success) {
      throw new AppError(401, "Invalid or expired token");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new AppError(401, "Authentication required");
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      throw new AppError(403, "Forbidden: you have no permission to access this route.");
    }

    req.user = { id: user.id, role: user.role };
    next();
  });
};

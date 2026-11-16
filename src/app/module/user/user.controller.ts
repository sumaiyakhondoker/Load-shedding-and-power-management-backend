import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserService } from "./user.service";

const getMe = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }

  const user = await UserService.getMe(req.user.id);
  sendResponse({ res, statusCode: 200, message: "Profile retrieved successfully!!", data: user });
});

export const UserController: { getMe: RequestHandler } = { getMe };

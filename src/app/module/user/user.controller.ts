import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserService } from "./user.service";
import type { UpdateProfileInput } from "./user.validation";

const getMe = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }

  const user = await UserService.getMe(req.user.id);
  sendResponse({ res, statusCode: 200, message: "Profile retrieved successfully!!", data: user });
});

const updateMe = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }

  const user = await UserService.updateMe(req.user.id, req.body as UpdateProfileInput);
  sendResponse({ res, statusCode: 200, message: "Profile updated successfully!!", data: user });
});

export const UserController: { getMe: RequestHandler; updateMe: RequestHandler } = {
  getMe,
  updateMe,
};

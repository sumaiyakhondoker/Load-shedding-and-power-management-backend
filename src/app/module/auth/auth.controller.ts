import type { RequestHandler } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { RegisterInput } from "./auth.interface";
import { AuthService } from "./auth.service";

const register = catchAsync(async (req, res) => {
  const result = await AuthService.register(req.body as RegisterInput);
  sendResponse({ res, statusCode: 201, message: "Registration successful", data: result });
});

export const AuthController: { register: RequestHandler } = {
  register,
};

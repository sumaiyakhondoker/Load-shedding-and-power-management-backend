import type { RequestHandler } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { LoginInput, RegisterInput } from "./auth.interface";
import { AuthService } from "./auth.service";

const register = catchAsync(async (req, res) => {
	const result = await AuthService.register(req.body as RegisterInput);
	sendResponse({
		res,
		statusCode: 201,
		message: "User registered successfully!",
		data: result,
	});
});

const login = catchAsync(async (req, res) => {
	const result = await AuthService.login(req.body as LoginInput);
	sendResponse({
		res,
		statusCode: 200,
		message: "User logged in successfully!",
		data: result,
	});
});

export const AuthController: {
	register: RequestHandler;
	login: RequestHandler;
} = {
	register,
	login,
};

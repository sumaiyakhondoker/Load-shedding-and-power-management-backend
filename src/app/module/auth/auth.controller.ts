import type { RequestHandler, Response } from "express";
import config from "../../../config";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { LoginInput, RegisterInput } from "./auth.interface";
import { AuthService } from "./auth.service";
import type { DemoLoginInput, GoogleLoginInput } from "./auth.validation";

const refreshTokenCookieOptions = () => ({
	httpOnly: true,
	secure: config.node_env === "production",
	sameSite:
		config.node_env === "production" ? ("none" as const) : ("lax" as const),
	path: "/api/v1/auth/refresh-token",
});

const setRefreshTokenCookie = (res: Response, token: string) => {
	res.cookie("refreshToken", token, refreshTokenCookieOptions());
};

const register = catchAsync(async (req, res) => {
	const { refreshToken, ...result } = await AuthService.register(
		req.body as RegisterInput,
	);
	setRefreshTokenCookie(res, refreshToken);
	sendResponse({
		res,
		statusCode: 201,
		message: "User registered successfully!",
		data: result,
	});
});

const sendLoginResponse = (
	res: Response,
	{ refreshToken, ...result }: Awaited<ReturnType<typeof AuthService.login>>,
) => {
	setRefreshTokenCookie(res, refreshToken);
	sendResponse({
		res,
		statusCode: 200,
		message: "User logged in successfully!",
		data: result,
	});
};

const login = catchAsync(async (req, res) => {
	sendLoginResponse(res, await AuthService.login(req.body as LoginInput));
});

const googleLogin = catchAsync(async (req, res) => {
	const { idToken } = req.body as GoogleLoginInput;
	sendLoginResponse(res, await AuthService.googleLogin(idToken, req.user?.id));
});

const demoLogin = catchAsync(async (req, res) => {
	const { role } = req.body as DemoLoginInput;
	sendLoginResponse(res, await AuthService.demoLogin(role));
});

const refreshToken = catchAsync(async (req, res) => {
	const result = await AuthService.refreshToken(req.cookies?.refreshToken);
	sendResponse({
		res,
		statusCode: 200,
		message: "Access token refreshed successfully!",
		data: result,
	});
});

const logout: RequestHandler = (req, res) => {
	res.clearCookie("refreshToken", refreshTokenCookieOptions());
	sendResponse({
		res,
		statusCode: 200,
		message: "User logged out successfully!",
		data: null,
	});
};

export const AuthController: {
	register: RequestHandler;
	login: RequestHandler;
	googleLogin: RequestHandler;
	demoLogin: RequestHandler;
	refreshToken: RequestHandler;
	logout: RequestHandler;
} = {
	register,
	login,
	googleLogin,
	demoLogin,
	refreshToken,
	logout,
};

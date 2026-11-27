import type { RequestHandler } from "express";
import { auth } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";

export const requireGoogleLoginJson: RequestHandler = (req, _res, next) => {
	if (!req.is("application/json")) {
		return next(new AppError(415, "Google sign-in requires application/json"));
	}
	next();
};

const authenticateLink = auth("CUSTOMER");

export const authenticateGoogleLink: RequestHandler = (req, res, next) => {
	if (req.headers.authorization !== undefined) {
		return authenticateLink(req, res, next);
	}
	next();
};

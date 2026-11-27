import type { RequestHandler } from "express";
import config from "../../config";
import { AppError } from "../utils/AppError";

const trustedOrigin = new URL(config.app_url).origin;

export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
	if (req.get("origin") !== trustedOrigin) {
		return next(new AppError(403, "Request origin is not allowed"));
	}
	next();
};

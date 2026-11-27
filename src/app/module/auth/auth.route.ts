import { Router, type Router as RouterType } from "express";
import { rateLimit } from "express-rate-limit";
import { requireTrustedOrigin } from "../../middleware/requireTrustedOrigin";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { authenticateGoogleLink, requireGoogleLoginJson } from "./auth.utils";
import {
	googleLoginSchema,
	loginSchema,
	registerSchema,
	demoLoginSchema,
} from "./auth.validation";

const router = Router();

router.post(
	"/register",
	validateRequest(registerSchema),
	AuthController.register,
);
router.post("/login", validateRequest(loginSchema), AuthController.login);
router.post(
	"/google",
	requireGoogleLoginJson,
	validateRequest(googleLoginSchema),
	authenticateGoogleLink,
	AuthController.googleLogin,
);
router.post(
	"/demo",
	rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 10,
		standardHeaders: "draft-8",
		legacyHeaders: false,
		handler: (_req, res) => {
			res
				.status(429)
				.json({ success: false, message: "Too many requests", errors: [] });
		},
	}),
	validateRequest(demoLoginSchema),
	AuthController.demoLogin,
);
router.post(
	"/refresh-token",
	requireTrustedOrigin,
	AuthController.refreshToken,
);
router.post("/logout", requireTrustedOrigin, AuthController.logout);

export const AuthRoutes: RouterType = router;

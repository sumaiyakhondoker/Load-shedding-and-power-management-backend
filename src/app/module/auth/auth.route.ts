import { Router, type Router as RouterType } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { authenticateGoogleLink, requireGoogleLoginJson } from "./auth.utils";
import {
	googleLoginSchema,
	loginSchema,
	registerSchema,
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
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logout);

export const AuthRoutes: RouterType = router;

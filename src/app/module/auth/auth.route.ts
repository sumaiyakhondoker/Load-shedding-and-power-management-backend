import { Router, type Router as RouterType } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { registerSchema } from "./auth.validation";

const router = Router();

router.post("/register", validateRequest(registerSchema), AuthController.register);

export const AuthRoutes: RouterType = router;

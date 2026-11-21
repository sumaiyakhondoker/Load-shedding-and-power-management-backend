import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UserController } from "./user.controller";
import { updateProfileSchema } from "./user.validation";

const router = Router();

router.get("/me", auth(), UserController.getMe);
router.patch(
	"/me",
	auth(),
	validateRequest(updateProfileSchema),
	UserController.updateMe,
);

export const UserRoutes: RouterType = router;

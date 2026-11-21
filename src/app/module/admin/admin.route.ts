import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AdminController } from "./admin.controller";
import { updateUserRoleSchema } from "./admin.validation";

const router = Router();

router.get("/users", auth("ADMIN"), AdminController.listUsers);
router.patch(
	"/users/:id/role",
	auth("ADMIN"),
	validateRequest(updateUserRoleSchema),
	AdminController.updateUserRole,
);

export const AdminRoutes: RouterType = router;

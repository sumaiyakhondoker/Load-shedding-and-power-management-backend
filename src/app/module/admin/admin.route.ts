import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { AdminController } from "./admin.controller";

const router = Router();

router.get("/users", auth("ADMIN"), AdminController.listUsers);

export const AdminRoutes: RouterType = router;

import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { UserController } from "./user.controller";

const router = Router();

router.get("/me", auth(), UserController.getMe);

export const UserRoutes: RouterType = router;

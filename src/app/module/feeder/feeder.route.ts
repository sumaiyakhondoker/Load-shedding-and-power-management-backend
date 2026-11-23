import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { FeederController } from "./feeder.controller";
import { createFeederSchema } from "./feeder.validation";

const router = Router();

router.post("/", auth("ADMIN"), validateRequest(createFeederSchema), FeederController.create);

export const FeederRoutes: RouterType = router;

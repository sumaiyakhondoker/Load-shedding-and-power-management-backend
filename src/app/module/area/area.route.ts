import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AreaController } from "./area.controller";
import { createAreaSchema } from "./area.validation";

const router = Router();

router.get("/", AreaController.list);
router.get("/:id", AreaController.getById);
router.post("/", auth("ADMIN"), validateRequest(createAreaSchema), AreaController.create);

export const AreaRoutes: RouterType = router;

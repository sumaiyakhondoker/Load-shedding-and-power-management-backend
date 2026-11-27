import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AreaController } from "./area.controller";
import { createAreaSchema, updateAreaSchema } from "./area.validation";

const router = Router();

router.get("/", AreaController.list);
router.get("/:id", AreaController.getById);
router.post(
	"/",
	auth("ADMIN"),
	validateRequest(createAreaSchema),
	AreaController.create,
);
router.patch(
	"/:id",
	auth("ADMIN"),
	validateRequest(updateAreaSchema),
	AreaController.update,
);
router.delete("/:id", auth("ADMIN"), AreaController.remove);

export const AreaRoutes: RouterType = router;

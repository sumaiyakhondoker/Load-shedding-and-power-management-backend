import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { FeederController } from "./feeder.controller";
import { createFeederSchema, updateFeederSchema } from "./feeder.validation";

const router = Router();

router.get("/", FeederController.list);
router.post(
	"/",
	auth("ADMIN"),
	validateRequest(createFeederSchema),
	FeederController.create,
);
router.patch(
	"/:id",
	auth("ADMIN"),
	validateRequest(updateFeederSchema),
	FeederController.update,
);
router.delete("/:id", auth("ADMIN"), FeederController.remove);

export const FeederRoutes: RouterType = router;

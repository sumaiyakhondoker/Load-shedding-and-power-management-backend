import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { DistributionZoneController } from "./distributionZone.controller";
import {
	createDistributionZoneSchema,
	updateDistributionZoneSchema,
} from "./distributionZone.validation";

const router = Router();

router.get("/", DistributionZoneController.list);
router.get("/:id", DistributionZoneController.getById);
router.post(
	"/",
	auth("ADMIN"),
	validateRequest(createDistributionZoneSchema),
	DistributionZoneController.create,
);
router.patch(
	"/:id",
	auth("ADMIN"),
	validateRequest(updateDistributionZoneSchema),
	DistributionZoneController.update,
);
router.delete("/:id", auth("ADMIN"), DistributionZoneController.remove);

export const DistributionZoneRoutes: RouterType = router;

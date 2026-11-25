import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ScheduleController } from "./schedule.controller";
import {
	createScheduleSchema,
	updateScheduleSchema,
} from "./schedule.validation";

const router = Router();

router.get(
	"/",
	auth("ADMIN", "TECHNICIAN", "CUSTOMER"),
	ScheduleController.list,
);
router.post(
	"/",
	auth("ADMIN"),
	validateRequest(createScheduleSchema),
	ScheduleController.create,
);
router.patch(
	"/:id",
	auth("ADMIN"),
	validateRequest(updateScheduleSchema),
	ScheduleController.update,
);

export const ScheduleRoutes: RouterType = router;

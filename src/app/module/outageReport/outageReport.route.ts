import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { OutageReportController } from "./outageReport.controller";
import { createOutageReportSchema } from "./outageReport.validation";

const router = Router();

router.get(
	"/",
	auth("ADMIN", "TECHNICIAN", "CUSTOMER"),
	OutageReportController.list,
);
router.get(
	"/:id",
	auth("ADMIN", "TECHNICIAN", "CUSTOMER"),
	OutageReportController.getById,
);
router.post(
	"/",
	auth("CUSTOMER"),
	validateRequest(createOutageReportSchema),
	OutageReportController.create,
);

export const OutageReportRoutes: RouterType = router;

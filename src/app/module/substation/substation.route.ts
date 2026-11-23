import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { SubstationController } from "./substation.controller";
import { createSubstationSchema } from "./substation.validation";

const router = Router();

router.get("/", SubstationController.list);
router.get("/:id", SubstationController.getById);
router.post(
	"/",
	auth("ADMIN"),
	validateRequest(createSubstationSchema),
	SubstationController.create,
);

export const SubstationRoutes: RouterType = router;

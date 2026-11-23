import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { SubstationController } from "./substation.controller";
import { createSubstationSchema, updateSubstationSchema } from "./substation.validation";

const router = Router();

router.get("/", SubstationController.list);
router.get("/:id", SubstationController.getById);
router.post(
	"/",
	auth("ADMIN"),
	validateRequest(createSubstationSchema),
	SubstationController.create,
);
router.patch("/:id", auth("ADMIN"), validateRequest(updateSubstationSchema), SubstationController.update);
router.delete("/:id", auth("ADMIN"), SubstationController.remove);

export const SubstationRoutes: RouterType = router;

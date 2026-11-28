import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { TariffController } from "./tariff.controller";
import { createTariffSchema, updateTariffSchema } from "./tariff.validation";

const router = Router();
router.use(auth("ADMIN"));
router.post("/", validateRequest(createTariffSchema), TariffController.create);
router.get("/", TariffController.list);
router.get("/:id", TariffController.getById);
router.patch(
	"/:id",
	validateRequest(updateTariffSchema),
	TariffController.update,
);

export const TariffRoutes: RouterType = router;

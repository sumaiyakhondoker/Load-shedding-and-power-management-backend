import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { BillController } from "./bill.controller";
import { createBillSchema, updateBillSchema } from "./bill.validation";

const router = Router();
router.post(
	"/",
	auth("ADMIN"),
	validateRequest(createBillSchema),
	BillController.create,
);
router.get("/", auth("ADMIN"), BillController.list);
router.get("/my-bills", auth("CUSTOMER"), BillController.list);
router.get("/summary", auth("ADMIN", "CUSTOMER"), BillController.summary);
router.get("/:id", auth("ADMIN", "CUSTOMER"), BillController.getById);
router.patch(
	"/:id",
	auth("ADMIN"),
	validateRequest(updateBillSchema),
	BillController.update,
);
router.patch("/:id/cancel", auth("ADMIN"), BillController.cancel);

export const BillRoutes: RouterType = router;

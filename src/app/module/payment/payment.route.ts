import express, { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { PaymentController } from "./payment.controller";
import { initiatePaymentSchema } from "./payment.validation";

const router = Router();

router.post(
	"/initiate",
	auth("CUSTOMER"),
	validateRequest(initiatePaymentSchema),
	PaymentController.initiate,
);
router.get("/", auth("CUSTOMER", "ADMIN"), PaymentController.list);
router.get("/:id", auth("CUSTOMER", "ADMIN"), PaymentController.getById);

const webhookRouter = Router();
webhookRouter.post(
	"/webhook",
	express.raw({ type: "application/json" }),
	PaymentController.webhook,
);

export const PaymentRoutes: RouterType = router;
export const PaymentWebhookRoutes: RouterType = webhookRouter;

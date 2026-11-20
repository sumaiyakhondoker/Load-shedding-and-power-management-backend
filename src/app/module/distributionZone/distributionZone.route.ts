import { Router, type Router as RouterType } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { DistributionZoneController } from "./distributionZone.controller";
import { createDistributionZoneSchema } from "./distributionZone.validation";

const router = Router();

router.post(
  "/",
  auth("ADMIN"),
  validateRequest(createDistributionZoneSchema),
  DistributionZoneController.create
);

export const DistributionZoneRoutes: RouterType = router;

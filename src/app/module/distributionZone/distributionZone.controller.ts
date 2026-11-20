import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DistributionZoneService } from "./distributionZone.service";
import type { CreateDistributionZoneInput } from "./distributionZone.validation";

const create = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }

  const zone = await DistributionZoneService.create(
    req.user.id,
    req.body as CreateDistributionZoneInput
  );
  sendResponse({ res, statusCode: 201, message: "Distribution zone created", data: zone });
});

export const DistributionZoneController: { create: RequestHandler } = { create };
